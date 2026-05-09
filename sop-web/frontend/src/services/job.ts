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

export { collection };
