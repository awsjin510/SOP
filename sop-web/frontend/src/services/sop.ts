import {
  collection,
  doc,
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
import { db } from '@/firebase/config';
import type { IR } from '@/core/ir/schemas';
import type { SopDoc } from '@/types/firestore';

const SOPS = 'sops';

export interface CreateSopInput {
  sopId: string;
  owner: string;
  ir: IR;
  documentMarkdown?: string;
  sourceMaterialsUrls: string[];
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
    documentDocxUrl: '',
    documentPdfUrl: '',
    sourceMaterialsUrls: input.sourceMaterialsUrls,
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
    createdAt: Timestamp;
  };
  return {
    id: versionId,
    ir: data.ir,
    documentMarkdown: data.documentMarkdown ?? '',
    createdAt: data.createdAt ?? null,
  };
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

export { setDoc, doc };
