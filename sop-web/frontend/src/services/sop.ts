import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
  Timestamp,
  getDoc,
} from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { db } from '@/firebase/config';
import type { ChangeIntent, IR } from '@/core/ir/schemas';
import type { ImageAsset, SopDoc } from '@/types/firestore';

const SOPS = 'sops';

export interface CreateSopInput {
  sopId: string;
  owner: string;
  ir: IR;
  documentMarkdown?: string;
  documentDocxUrl?: string;
  documentPdfUrl?: string;
  sourceMaterialsUrls: string[];
  /** image_id → asset 對映，給之後 Word/PDF 渲染用 */
  imageAssets?: Record<string, ImageAsset>;
}

/**
 * 寫入新 SOP（含 v1.0.0 版本子文件）。原子性用 writeBatch。
 */
export async function createSopWithVersion(input: CreateSopInput): Promise<{
  sopId: string;
  versionId: string;
}> {
  const batch = writeBatch(db);
  const sopRef = doc(db, SOPS, input.sopId);
  const versionId = `v${input.ir.version}`;
  const versionRef = doc(db, `${SOPS}/${input.sopId}/versions/${versionId}`);

  const sopDoc: Omit<SopDoc, 'createdAt' | 'updatedAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    id: input.sopId,
    sopId: input.sopId,
    owner: input.owner,
    members: [],
    visibility: 'private',
    title: input.ir.meta.title,
    ...(input.ir.meta.category ? { category: input.ir.meta.category } : {}),
    tags: input.ir.meta.tags ?? [],
    targetAudience: input.ir.meta.target_audience,
    estimatedDuration: input.ir.meta.estimated_duration_minutes
      ? `${input.ir.meta.estimated_duration_minutes} 分鐘`
      : '—',
    difficulty: input.ir.meta.difficulty ?? '中級',
    authors: input.ir.meta.authors ?? [],
    currentVersion: input.ir.version,
    totalVersions: 1,
    stepsCount: input.ir.steps.length,
    troubleshootingCount: input.ir.troubleshooting?.length ?? 0,
    glossaryCount: input.ir.glossary?.length ?? 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'active',
  };

  batch.set(sopRef, sopDoc);

  batch.set(versionRef, {
    id: versionId,
    version: input.ir.version,
    ir: input.ir,
    documentMarkdown: input.documentMarkdown ?? '',
    documentDocxUrl: input.documentDocxUrl ?? '',
    documentPdfUrl: input.documentPdfUrl ?? '',
    sourceMaterialsUrls: input.sourceMaterialsUrls,
    imageAssets: input.imageAssets ?? {},
    createdAt: serverTimestamp(),
    createdBy: input.owner,
    qualityIssues: input.ir.steps.filter((s) => s.needs_human_input).length,
    needsRetraining: false,
  });

  await batch.commit();

  return { sopId: input.sopId, versionId };
}

export async function getSop(sopId: string): Promise<SopDoc | null> {
  const snap = await getDoc(doc(db, SOPS, sopId));
  return snap.exists() ? (snap.data() as SopDoc) : null;
}

export async function getLatestVersion(sopId: string): Promise<{
  id: string;
  ir: IR;
  documentMarkdown: string;
  documentDocxUrl: string;
  documentPdfUrl: string;
  imageAssets: Record<string, ImageAsset>;
  createdAt: Timestamp | null;
} | null> {
  const sop = await getSop(sopId);
  if (!sop) return null;
  const versionId = `v${sop.currentVersion}`;
  const snap = await getDoc(doc(db, `${SOPS}/${sopId}/versions/${versionId}`));
  if (!snap.exists()) return null;
  const data = snap.data() as {
    ir: IR;
    documentMarkdown?: string;
    documentDocxUrl?: string;
    documentPdfUrl?: string;
    imageAssets?: Record<string, ImageAsset>;
    createdAt: Timestamp;
  };
  return {
    id: versionId,
    ir: data.ir,
    documentMarkdown: data.documentMarkdown ?? '',
    documentDocxUrl: data.documentDocxUrl ?? '',
    documentPdfUrl: data.documentPdfUrl ?? '',
    imageAssets: data.imageAssets ?? {},
    createdAt: data.createdAt ?? null,
  };
}

/**
 * 更新 version 文件中的 docx/pdf URL（W5 渲染完成後呼叫）。
 * Firestore Rules 拒絕 update versions 子文件，這裡會用 admin path？
 *
 * 注意：security rules 規定 versions 不可 update。為了支援渲染後寫入 URL，
 * 採取「先建立版本不含 URL，再透過特殊方式更新」太複雜；改採 W5 策略：
 *   pipeline 在 createSopWithVersion 之前先渲染，把 URL 一併傳入。
 */
export async function updateVersionRenderedDocs(
  _sopId: string,
  _versionId: string,
  _patch: Partial<{
    documentDocxUrl: string;
    documentPdfUrl: string;
  }>,
): Promise<void> {
  // W5 不走這條路；保留簽名以利之後更新流程使用（changes 子集合會搭配新版本）
  throw new Error(
    'versions 子文件不可 update（Firestore Rules）。' +
      '請改在 createSopWithVersion 階段一併寫入。',
  );
}

/**
 * 訂閱使用者擁有的 SOP 列表（按 updatedAt desc）。
 */
export function subscribeUserSops(
  uid: string,
  onNext: (sops: SopDoc[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, SOPS),
    where('owner', '==', uid),
    orderBy('updatedAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    onNext(snap.docs.map((d) => d.data() as SopDoc));
  });
}

/**
 * 把任意字串轉成 kebab-case slug 給 sop_id 用。
 *
 * IR schema 規定 sop_id 必須匹配 ^[a-z0-9-]+$。
 * 中文標題會被剝除（W3 不做拼音轉換），純中文標題回傳空字串，
 * 由 caller 用 generateFallbackSopId() 補一個 nanoid-based id。
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 當 slugify 產出空字串時的後備：sop-{nanoid 8 碼}（仍合法）。
 */
export function generateFallbackSopId(nanoIdFn: () => string): string {
  return `sop-${nanoIdFn()}`;
}

// ============================================================
// W6: 新版本 + 變更紀錄寫入
// ============================================================

export interface AddVersionInput {
  sopId: string;
  owner: string;
  ir: IR;
  fromVersion: string;
  changeId: string;
  changeSummary?: string;
  documentMarkdown?: string;
  documentDocxUrl?: string;
  documentPdfUrl?: string;
  sourceMaterialsUrls: string[];
  imageAssets?: Record<string, ImageAsset>;
  needsRetraining?: boolean;
}

export interface AddChangeInput {
  sopId: string;
  changeId: string;
  fromVersion: string;
  toVersion: string;
  appliedBy: string;
  changeIntents: ChangeIntent[];
  /** 跳過 / 拒絕的 intents（給 changelog 顯示用） */
  skippedIntents?: Array<{ intent: ChangeIntent; reason: string }>;
  changelogDocxUrl?: string;
  /** W8：審核產出的衝突 / 完整性問題 / 術語對映（隨 changes 一次寫入） */
  conflicts?: unknown[];
  completenessIssues?: unknown[];
  termMappings?: Array<{ vendorTerm: string; internalTerm: string }>;
  /** W8：審核統計覆寫（沒給就用 W6 預設） */
  statsOverride?: {
    totalRawIntents: number;
    consolidated: number;
    autoApplied: number;
    manuallyAccepted: number;
    rejected: number;
    conflictsResolved: number;
  };
}

/**
 * 寫入新版本並更新 sop 主文件的版本 / 統計欄位。用 batch 確保 atomicity。
 * 注意：versions 子集合不可 update（rules），所以一次性 set 完整內容。
 */
export async function addVersion(input: AddVersionInput): Promise<{ versionId: string }> {
  const versionId = `v${input.ir.version}`;
  const batch = writeBatch(db);

  const sopRef = doc(db, SOPS, input.sopId);
  const versionRef = doc(db, `${SOPS}/${input.sopId}/versions/${versionId}`);

  batch.update(sopRef, {
    title: input.ir.meta.title,
    ...(input.ir.meta.category ? { category: input.ir.meta.category } : {}),
    tags: input.ir.meta.tags ?? [],
    targetAudience: input.ir.meta.target_audience,
    estimatedDuration: input.ir.meta.estimated_duration_minutes
      ? `${input.ir.meta.estimated_duration_minutes} 分鐘`
      : '—',
    ...(input.ir.meta.difficulty ? { difficulty: input.ir.meta.difficulty } : {}),
    currentVersion: input.ir.version,
    totalVersions: increment(1),
    stepsCount: input.ir.steps.length,
    troubleshootingCount: input.ir.troubleshooting?.length ?? 0,
    glossaryCount: input.ir.glossary?.length ?? 0,
    updatedAt: serverTimestamp(),
  });

  batch.set(versionRef, {
    id: versionId,
    version: input.ir.version,
    ir: input.ir,
    fromVersion: input.fromVersion,
    changeId: input.changeId,
    documentMarkdown: input.documentMarkdown ?? '',
    documentDocxUrl: input.documentDocxUrl ?? '',
    documentPdfUrl: input.documentPdfUrl ?? '',
    sourceMaterialsUrls: input.sourceMaterialsUrls,
    imageAssets: input.imageAssets ?? {},
    createdAt: serverTimestamp(),
    createdBy: input.owner,
    ...(input.changeSummary ? { changeSummary: input.changeSummary } : {}),
    qualityIssues: input.ir.steps.filter((s) => s.needs_human_input).length,
    needsRetraining: input.needsRetraining ?? false,
  });

  await batch.commit();
  return { versionId };
}

export async function addChange(input: AddChangeInput): Promise<void> {
  const ref = doc(db, `${SOPS}/${input.sopId}/changes/${input.changeId}`);
  const stats = input.statsOverride ?? {
    totalRawIntents:
      input.changeIntents.length + (input.skippedIntents?.length ?? 0),
    consolidated: input.changeIntents.length,
    autoApplied: input.changeIntents.filter((i) => i.auto_apply).length,
    manuallyAccepted: 0,
    rejected: input.skippedIntents?.length ?? 0,
    conflictsResolved: 0,
  };
  await setDoc(ref, {
    id: input.changeId,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    changeIntents: input.changeIntents,
    skippedIntents: input.skippedIntents ?? [],
    conflicts: input.conflicts ?? [],
    completenessIssues: input.completenessIssues ?? [],
    ...(input.termMappings && input.termMappings.length > 0
      ? { termMappings: input.termMappings }
      : {}),
    stats,
    changelogDocxUrl: input.changelogDocxUrl ?? '',
    createdAt: serverTimestamp(),
    appliedAt: serverTimestamp(),
    appliedBy: input.appliedBy,
    reviewer: input.appliedBy,
  });
}

export interface ChangeRecord {
  id: string;
  fromVersion: string;
  toVersion: string;
  changeIntents: ChangeIntent[];
  skippedIntents?: Array<{ intent: ChangeIntent; reason: string }>;
  /** W8 寫入：審核時的衝突 / 完整性問題 / 術語對映 */
  conflicts?: unknown[];
  completenessIssues?: unknown[];
  termMappings?: Array<{ vendorTerm: string; internalTerm: string }>;
  changelogDocxUrl?: string;
  createdAt: Timestamp | null;
  appliedBy: string;
}

// W9：版本列表 / 取單一版本 / 取單一 change
export interface VersionSummary {
  id: string;
  version: string;
  fromVersion?: string;
  changeId?: string;
  changeSummary?: string;
  documentDocxUrl?: string;
  documentPdfUrl?: string;
  createdAt: Timestamp | null;
  createdBy?: string;
  qualityIssues?: number;
  needsRetraining?: boolean;
  /** stepsCount/troubleCount 給時間軸顯示用 */
  stepsCount?: number;
  troubleshootingCount?: number;
  glossaryCount?: number;
}

export interface VersionDoc extends VersionSummary {
  ir: IR;
  documentMarkdown: string;
  imageAssets: Record<string, ImageAsset>;
  sourceMaterialsUrls: string[];
}

export async function listVersions(sopId: string): Promise<VersionSummary[]> {
  const q = query(
    collection(db, `${SOPS}/${sopId}/versions`),
    orderBy('createdAt', 'desc'),
  );
  const { getDocs } = await import('firebase/firestore');
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const ir = data['ir'] as IR | undefined;
    return {
      id: d.id,
      version: (data['version'] as string) ?? d.id.replace(/^v/, ''),
      ...(typeof data['fromVersion'] === 'string'
        ? { fromVersion: data['fromVersion'] as string }
        : {}),
      ...(typeof data['changeId'] === 'string'
        ? { changeId: data['changeId'] as string }
        : {}),
      ...(typeof data['changeSummary'] === 'string'
        ? { changeSummary: data['changeSummary'] as string }
        : {}),
      ...(typeof data['documentDocxUrl'] === 'string'
        ? { documentDocxUrl: data['documentDocxUrl'] as string }
        : {}),
      ...(typeof data['documentPdfUrl'] === 'string'
        ? { documentPdfUrl: data['documentPdfUrl'] as string }
        : {}),
      createdAt: (data['createdAt'] as Timestamp) ?? null,
      ...(typeof data['createdBy'] === 'string'
        ? { createdBy: data['createdBy'] as string }
        : {}),
      ...(typeof data['qualityIssues'] === 'number'
        ? { qualityIssues: data['qualityIssues'] as number }
        : {}),
      ...(typeof data['needsRetraining'] === 'boolean'
        ? { needsRetraining: data['needsRetraining'] as boolean }
        : {}),
      ...(ir
        ? {
            stepsCount: ir.steps.length,
            troubleshootingCount: ir.troubleshooting?.length ?? 0,
            glossaryCount: ir.glossary?.length ?? 0,
          }
        : {}),
    };
  });
}

export async function getVersion(
  sopId: string,
  versionId: string,
): Promise<VersionDoc | null> {
  const snap = await getDoc(doc(db, `${SOPS}/${sopId}/versions/${versionId}`));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const ir = data['ir'] as IR;
  return {
    id: versionId,
    version: (data['version'] as string) ?? versionId.replace(/^v/, ''),
    ir,
    documentMarkdown: (data['documentMarkdown'] as string) ?? '',
    documentDocxUrl: (data['documentDocxUrl'] as string) ?? '',
    documentPdfUrl: (data['documentPdfUrl'] as string) ?? '',
    sourceMaterialsUrls: (data['sourceMaterialsUrls'] as string[]) ?? [],
    imageAssets: (data['imageAssets'] as Record<string, ImageAsset>) ?? {},
    ...(typeof data['fromVersion'] === 'string'
      ? { fromVersion: data['fromVersion'] as string }
      : {}),
    ...(typeof data['changeId'] === 'string'
      ? { changeId: data['changeId'] as string }
      : {}),
    ...(typeof data['changeSummary'] === 'string'
      ? { changeSummary: data['changeSummary'] as string }
      : {}),
    createdAt: (data['createdAt'] as Timestamp) ?? null,
    ...(typeof data['createdBy'] === 'string'
      ? { createdBy: data['createdBy'] as string }
      : {}),
    ...(typeof data['qualityIssues'] === 'number'
      ? { qualityIssues: data['qualityIssues'] as number }
      : {}),
    ...(typeof data['needsRetraining'] === 'boolean'
      ? { needsRetraining: data['needsRetraining'] as boolean }
      : {}),
    stepsCount: ir.steps.length,
    troubleshootingCount: ir.troubleshooting?.length ?? 0,
    glossaryCount: ir.glossary?.length ?? 0,
  };
}

export async function getChange(
  sopId: string,
  changeId: string,
): Promise<ChangeRecord | null> {
  const snap = await getDoc(doc(db, `${SOPS}/${sopId}/changes/${changeId}`));
  if (!snap.exists()) return null;
  return snap.data() as ChangeRecord;
}

export function subscribeChanges(
  sopId: string,
  onNext: (changes: ChangeRecord[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, `${SOPS}/${sopId}/changes`),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    onNext(snap.docs.map((d) => d.data() as ChangeRecord));
  });
}

export function newChangeId(): string {
  return `change-${nanoid(12)}`;
}

export { setDoc, doc };
