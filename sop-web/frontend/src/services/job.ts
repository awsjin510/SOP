import {
  doc,
  collection,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { db } from '@/firebase/config';
import type { ChangeIntent } from '@/core/ir/schemas';
import type { Conflict } from '@/core/merger/conflict';
import type { CompletenessIssue } from '@/core/merger/completeness';
import type { TermMapping } from '@/core/extractors/pdf';
import type { ImageAsset } from '@/types/firestore';

export type JobStatus =
  | 'pending'
  | 'uploading'
  | 'extracting'
  | 'building_ir'
  | 'enhancing'
  | 'merging'
  | 'awaiting_review'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SubtaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface JobSubtask {
  name: string;
  status: SubtaskStatus;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  message?: string;
}

export interface JobUploadedFile {
  name: string;
  type: 'transcript' | 'document' | 'screenshot' | 'change_list' | 'pdf' | 'text';
  storageUrl: string;
  storagePath: string;
  size: number;
  contentType: string;
}

export interface ConflictReview extends Conflict {
  /** 使用者選的 option index；undefined 表示尚未決定 */
  resolvedOptionIndex?: number;
  /** 全部不採用（衝突中所有 option 都被拒絕） */
  dismissed?: boolean;
}

export interface CompletenessIssueReview extends CompletenessIssue {
  acknowledged?: boolean;
}

/**
 * W8 審核中介資料：在第一段 pipeline 結束時寫入 job.intermediate，
 * 第二段 pipeline 從這裡讀取已 accepted 的 intents 與衝突解析。
 */
export interface JobIntermediate {
  fromVersion: string;
  intents: ChangeIntent[];
  conflicts: ConflictReview[];
  completenessIssues: CompletenessIssueReview[];
  termMappings: TermMapping[];
  /** 新上傳的截圖（image_id → asset），套用 replace_screenshot 用 */
  newImageAssets: Record<string, ImageAsset>;
  changeSummary?: string;
  appliedBy: string;
  /** 統計（給 UI 顯示用） */
  stats: {
    rawCount: number;
    mergedCount: number;
    inConflictCount: number;
  };
}

export interface ProcessingJob {
  id: string;
  owner: string;
  type: 'create_sop' | 'update_sop';
  sopId?: string;
  fromVersion?: string;
  status: JobStatus;
  progress: number;
  currentStep: string;
  subtasks: JobSubtask[];
  uploadedFiles: JobUploadedFile[];
  intermediate?: JobIntermediate;
  result?: {
    sopId: string;
    versionId: string;
  };
  error?: {
    message: string;
    code: string;
    occurredAt: Timestamp;
  };
  apiUsage: {
    claudeTokensInput: number;
    claudeTokensOutput: number;
    estimatedCostUsd: number;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface CreateJobInput {
  owner: string;
  type: 'create_sop' | 'update_sop';
  sopId?: string;
  /** 子任務初始清單（依 pipeline 階段） */
  subtasks: string[];
}

export function newJobId(): string {
  return `job-${nanoid(12)}`;
}

export async function createJob(input: CreateJobInput): Promise<string> {
  const id = newJobId();
  const ref = doc(db, 'processing_jobs', id);
  const subtasks: JobSubtask[] = input.subtasks.map((name) => ({
    name,
    status: 'pending',
  }));
  await setDoc(ref, {
    id,
    owner: input.owner,
    type: input.type,
    ...(input.sopId ? { sopId: input.sopId } : {}),
    status: 'pending',
    progress: 0,
    currentStep: subtasks[0]?.name ?? '',
    subtasks,
    uploadedFiles: [],
    apiUsage: {
      claudeTokensInput: 0,
      claudeTokensOutput: 0,
      estimatedCostUsd: 0,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export function subscribeJob(
  jobId: string,
  onNext: (job: ProcessingJob | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'processing_jobs', jobId), (snap) => {
    onNext(snap.exists() ? (snap.data() as ProcessingJob) : null);
  });
}

export async function updateJob(
  jobId: string,
  patch: Partial<{
    status: JobStatus;
    progress: number;
    currentStep: string;
    uploadedFiles: JobUploadedFile[];
    intermediate: JobIntermediate;
    result: { sopId: string; versionId: string };
    error: { message: string; code: string };
  }>,
): Promise<void> {
  const docRef = doc(db, 'processing_jobs', jobId);
  const update: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
  if (patch.status === 'completed' || patch.status === 'failed') {
    update['completedAt'] = serverTimestamp();
  }
  if (patch.status && patch.status !== 'pending' && patch.status !== 'failed') {
    // 第一次離開 pending 時記錄 startedAt（用 update 但若已寫過就忽略由 caller 控）
  }
  if (patch.error) {
    update['error'] = {
      ...patch.error,
      occurredAt: Timestamp.now(),
    };
  }
  await updateDoc(docRef, update);
}

/**
 * 用陣列覆寫的方式更新 subtasks 狀態（Firestore 陣列 update 沒有 by-index 操作）。
 * 為避免 race，使用 transaction。
 */
export async function setSubtaskStatus(
  jobId: string,
  subtaskName: string,
  status: SubtaskStatus,
  message?: string,
): Promise<void> {
  const ref = doc(db, 'processing_jobs', jobId);
  // 用 simple read-modify-write；W3 一個 pipeline 一次只跑一個任務，不會撞
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as ProcessingJob;
  const updated = data.subtasks.map((t): JobSubtask => {
    if (t.name !== subtaskName) return t;
    const patched: JobSubtask = {
      ...t,
      status,
      ...(message !== undefined ? { message } : {}),
    };
    if (status === 'running' && !t.startedAt) patched.startedAt = Timestamp.now();
    if (status === 'completed' || status === 'failed') {
      patched.completedAt = Timestamp.now();
    }
    return patched;
  });
  await updateDoc(ref, { subtasks: updated, updatedAt: serverTimestamp() });
}

// ============================================================
// W8：審核操作（writes intermediate.* through job.update）
// ============================================================

/**
 * 套用一個 patch 到 job.intermediate.intents[?id===intentId]。
 * 以 read-modify-write 實作（前端整合測試會驗證 race condition 下的合理表現）。
 */
export async function patchIntent(
  jobId: string,
  intentId: string,
  patch: Partial<{
    status: ChangeIntent['status'];
    user_modification: ChangeIntent['user_modification'];
  }>,
): Promise<void> {
  const ref = doc(db, 'processing_jobs', jobId);
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as ProcessingJob;
  if (!data.intermediate) return;
  const intents = data.intermediate.intents.map((i) => {
    if (i.intent_id !== intentId) return i;
    return {
      ...i,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.user_modification
        ? { user_modification: patch.user_modification }
        : {}),
    };
  });
  await updateDoc(ref, {
    'intermediate.intents': intents,
    updatedAt: serverTimestamp(),
  });
}

export async function resolveConflict(
  jobId: string,
  conflictId: string,
  resolution: { resolvedOptionIndex?: number; dismissed?: boolean },
): Promise<void> {
  const ref = doc(db, 'processing_jobs', jobId);
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as ProcessingJob;
  if (!data.intermediate) return;
  const conflicts = data.intermediate.conflicts.map((c): ConflictReview => {
    if (c.id !== conflictId) return c;
    const next: ConflictReview = { ...c };
    if (resolution.resolvedOptionIndex !== undefined) {
      next.resolvedOptionIndex = resolution.resolvedOptionIndex;
      next.dismissed = false;
    }
    if (resolution.dismissed) {
      next.dismissed = true;
      delete next.resolvedOptionIndex;
    }
    return next;
  });
  await updateDoc(ref, {
    'intermediate.conflicts': conflicts,
    updatedAt: serverTimestamp(),
  });
}

export async function acknowledgeIssue(
  jobId: string,
  issueId: string,
  acknowledged: boolean,
): Promise<void> {
  const ref = doc(db, 'processing_jobs', jobId);
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as ProcessingJob;
  if (!data.intermediate) return;
  const issues = data.intermediate.completenessIssues.map(
    (i): CompletenessIssueReview =>
      i.id === issueId ? { ...i, acknowledged } : i,
  );
  await updateDoc(ref, {
    'intermediate.completenessIssues': issues,
    updatedAt: serverTimestamp(),
  });
}

/**
 * 批次操作：依信心區間設定 intents 狀態。
 * - acceptIfConfidenceAtLeast：信心 ≥ X 全部接受
 * - rejectIfConfidenceBelow：信心 < Y 全部拒絕
 */
export async function batchPatchIntents(
  jobId: string,
  rule:
    | { acceptIfConfidenceAtLeast: number }
    | { rejectIfConfidenceBelow: number },
): Promise<void> {
  const ref = doc(db, 'processing_jobs', jobId);
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as ProcessingJob;
  if (!data.intermediate) return;
  const intents = data.intermediate.intents.map((i) => {
    if ('acceptIfConfidenceAtLeast' in rule) {
      if (i.confidence >= rule.acceptIfConfidenceAtLeast && i.status !== 'rejected') {
        return { ...i, status: 'accepted' as const };
      }
    } else if (i.confidence < rule.rejectIfConfidenceBelow && i.status !== 'accepted') {
      return { ...i, status: 'rejected' as const };
    }
    return i;
  });
  await updateDoc(ref, {
    'intermediate.intents': intents,
    updatedAt: serverTimestamp(),
  });
}

/**
 * 標記審核完成；UI 後續會呼叫 runUpdateSopApply 進入第二段。
 *
 * 不在這裡直接觸發 apply，避免 service 層耦合 pipeline。
 */
export async function markReviewCompleted(jobId: string): Promise<void> {
  await updateDoc(doc(db, 'processing_jobs', jobId), {
    status: 'merging' satisfies JobStatus,
    currentStep: '套用審核結果',
    updatedAt: serverTimestamp(),
  });
}

export { collection };
