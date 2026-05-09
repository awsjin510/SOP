import { nanoid } from 'nanoid';
import { ChangeListExtractor, type ChangeListFormat } from '@/core/extractors/change-list';
import { TextExtractor } from '@/core/extractors/text';
import { PdfExtractor, type TermMapping } from '@/core/extractors/pdf';
import { UpdateScreenshotExtractor } from '@/core/extractors/screenshot-update';
import { type ScreenshotMime } from '@/core/extractors/screenshot';
import { applyChangeIntents } from '@/core/merger/apply';
import { bumpForIntents } from '@/core/merger/version';
import { mergeChangeIntents } from '@/core/merger/merger';
import type { Conflict } from '@/core/merger/conflict';
import type { CompletenessIssue } from '@/core/merger/completeness';
import { renderMarkdown } from '@/core/renderer/markdown';
import { renderDocx } from '@/core/renderer/docx';
import { renderPdf } from '@/core/renderer/pdf';
import {
  uploadJobFile,
  uploadRenderedDoc,
  readFileAsText,
  fetchAsBytes,
} from '@/services/storage';
import {
  updateJob,
  setSubtaskStatus,
  subscribeJob,
  type JobUploadedFile,
  type JobIntermediate,
  type ConflictReview,
  type CompletenessIssueReview,
  type ProcessingJob,
} from '@/services/job';
import {
  addVersion,
  addChange,
  getLatestVersion,
  newChangeId,
} from '@/services/sop';
import type { ChangeIntent } from '@/core/ir/schemas';
import type { ImageAsset } from '@/types/firestore';

// ============================================================
// Public API
// ============================================================

export type UpdateMaterialType = 'change_list' | 'text' | 'pdf' | 'screenshot';

export interface UpdateMaterial {
  file: File;
  type: UpdateMaterialType;
  /** 僅 change_list 用；不指定則由副檔名推斷 */
  changeListFormat?: ChangeListFormat;
}

export interface UpdateSopJobInput {
  jobId: string;
  uid: string;
  sopId: string;
  materials: UpdateMaterial[];
  changeSummary?: string;
  appliedBy: string;
}

export interface UpdateSopAnalysisResult {
  /** 'awaiting_review'：暫停等待人工審核；'auto_completed'：直接套用無暫停 */
  outcome: 'awaiting_review' | 'auto_completed';
  /** auto_completed 時填入 */
  applied?: UpdateSopJobResult;
}

export interface UpdateSopJobResult {
  sopId: string;
  versionId: string;
  changeId: string;
  appliedCount: number;
  conflictCount: number;
  completenessIssueCount: number;
}

export const UPDATE_SOP_SUBTASKS = [
  '上傳素材',
  '讀取現有 IR',
  '抽取變更意圖',
  '匯流與檢查',
  '人工審核',
  '套用變更',
  '產出 Markdown',
  '產出 Word/PDF',
  '寫入新版本',
  '寫入變更紀錄',
] as const;

export { type ChangeListFormat };
// W6 兼容：保留型別 export 給 UI。
export type UpdateChangeListFormat = ChangeListFormat;

// ============================================================
// 自動分類（給 UI 在使用者拖檔時用）
// ============================================================

export function classifyUpdateFile(file: File): UpdateMaterialType {
  const mime = file.type;
  const name = file.name.toLowerCase();
  if (mime.startsWith('image/')) return 'screenshot';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'change_list';
  }
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    return 'change_list';
  }
  return 'text';
}

export function detectScreenshotMime(file: File): ScreenshotMime {
  if (file.type === 'image/jpeg' || file.name.toLowerCase().match(/\.jpe?g$/))
    return 'image/jpeg';
  if (file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp'))
    return 'image/webp';
  return 'image/png';
}

function detectChangeListFormat(file: File): ChangeListFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return 'docx';
  return 'markdown';
}

// ============================================================
// Phase 1：分析（上傳 → 抽取 → 匯流 → 寫入 intermediate）
// ============================================================

/**
 * 第一段：上傳所有素材、抽取 intents、匯流，最後寫入 job.intermediate。
 *
 * 結束狀態：
 * - 若無衝突且無「需人工審核」項 → 接著呼叫 phase 2 自動完成。
 * - 否則 status='awaiting_review'，等待 UI 觸發 phase 2。
 */
export async function runUpdateSopAnalysis(
  input: UpdateSopJobInput,
): Promise<UpdateSopAnalysisResult> {
  const { jobId, uid, sopId, materials } = input;
  const subtasks = UPDATE_SOP_SUBTASKS;

  if (materials.length === 0) {
    throw new Error('至少要上傳一份更新素材');
  }

  try {
    // === 1. 上傳素材 ===
    await updateJob(jobId, {
      status: 'uploading',
      currentStep: subtasks[0],
      progress: 5,
    });
    await setSubtaskStatus(jobId, subtasks[0], 'running');

    const uploadedFiles: JobUploadedFile[] = [];
    const newImageAssets: Record<string, ImageAsset> = {};
    const screenshotImageIdByFileName = new Map<string, string>();

    for (let i = 0; i < materials.length; i++) {
      const m = materials[i]!;
      const upload = await uploadJobFile(uid, jobId, m.file);
      uploadedFiles.push({
        name: m.file.name,
        type: m.type,
        storageUrl: upload.downloadUrl,
        storagePath: upload.storagePath,
        size: m.file.size,
        contentType: m.file.type || 'application/octet-stream',
      });
      if (m.type === 'screenshot') {
        const imageId = `img-${nanoid(10)}`;
        screenshotImageIdByFileName.set(m.file.name, imageId);
        newImageAssets[imageId] = {
          storagePath: upload.storagePath,
          downloadUrl: upload.downloadUrl,
          contentType: m.file.type || 'image/png',
          sourceFile: m.file.name,
        };
      }
      const pct = 5 + Math.round(((i + 1) / materials.length) * 10);
      await updateJob(jobId, { progress: pct });
    }
    await updateJob(jobId, { uploadedFiles, progress: 15 });
    await setSubtaskStatus(jobId, subtasks[0], 'completed');

    // === 2. 讀取現有 IR ===
    await updateJob(jobId, {
      status: 'extracting',
      currentStep: subtasks[1],
      progress: 20,
    });
    await setSubtaskStatus(jobId, subtasks[1], 'running');

    const latest = await getLatestVersion(sopId);
    if (!latest) throw new Error(`找不到 SOP ${sopId} 的版本`);
    const baseIr = latest.ir;
    const fromVersion = baseIr.version;
    await setSubtaskStatus(
      jobId,
      subtasks[1],
      'completed',
      `已讀取 v${fromVersion}（${baseIr.steps.length} 步驟）`,
    );

    // === 3. 分流抽取 ===
    await updateJob(jobId, { currentStep: subtasks[2], progress: 30 });
    await setSubtaskStatus(jobId, subtasks[2], 'running');

    const rawIntents: ChangeIntent[][] = [];
    const allTermMappings: TermMapping[] = [];
    let totalRawIntents = 0;

    for (const m of materials) {
      try {
        if (m.type === 'change_list') {
          const fmt = m.changeListFormat ?? detectChangeListFormat(m.file);
          const buffer = fmt === 'docx' ? await m.file.arrayBuffer() : undefined;
          const text = fmt === 'markdown' ? await readFileAsText(m.file) : undefined;
          const ext = new ChangeListExtractor();
          const out = await ext.extract(
            {
              format: fmt,
              ...(buffer ? { buffer } : {}),
              ...(text !== undefined ? { text } : {}),
              baseIr,
            },
            { sourceFile: m.file.name },
          );
          rawIntents.push(out.payload.intents);
          totalRawIntents += out.payload.intents.length;
        } else if (m.type === 'text') {
          const text = await readFileAsText(m.file);
          const ext = new TextExtractor();
          const out = await ext.extract(
            { text, baseIr },
            { sourceFile: m.file.name },
          );
          rawIntents.push(out.payload.intents);
          totalRawIntents += out.payload.intents.length;
        } else if (m.type === 'pdf') {
          const buffer = await m.file.arrayBuffer();
          const ext = new PdfExtractor();
          const out = await ext.extract(
            { buffer, baseIr },
            { sourceFile: m.file.name },
          );
          rawIntents.push(out.payload.intents);
          allTermMappings.push(...out.payload.termMappings);
          totalRawIntents += out.payload.intents.length;
        } else if (m.type === 'screenshot') {
          const ext = new UpdateScreenshotExtractor();
          const out = await ext.extract(
            {
              blob: m.file,
              mimeType: detectScreenshotMime(m.file),
              baseIr,
            },
            { sourceFile: m.file.name },
          );
          const imageId = screenshotImageIdByFileName.get(m.file.name);
          const stitched = out.payload.intents.map((intent) => {
            if (intent.type !== 'replace_screenshot' || !imageId) return intent;
            return {
              ...intent,
              target: { ...intent.target, field: `image_id:${imageId}` },
            };
          });
          rawIntents.push(stitched);
          totalRawIntents += stitched.length;
        }
      } catch (err) {
        console.warn(`[update-sop] extractor failed for ${m.file.name}`, err);
      }
    }
    await setSubtaskStatus(
      jobId,
      subtasks[2],
      'completed',
      `${materials.length} 份素材 → ${totalRawIntents} 個原始 intents`,
    );

    if (totalRawIntents === 0) {
      throw new Error('所有素材都未抽出任何變更意圖（請確認素材內容）');
    }

    // === 4. 匯流 + 衝突 + 完整性 ===
    await updateJob(jobId, {
      status: 'merging',
      currentStep: subtasks[3],
      progress: 45,
    });
    await setSubtaskStatus(jobId, subtasks[3], 'running');

    const merge = mergeChangeIntents(baseIr, rawIntents);

    // 將 merger 的 intents/conflicts/issues 轉成 review 結構（補預設值）
    const reviewIntents: ChangeIntent[] = merge.intents.map((i) => ({
      ...i,
      // 高信心 + auto_apply → 預設 accepted；否則 pending
      status: i.auto_apply ? 'accepted' : 'pending',
    }));
    const reviewConflicts: ConflictReview[] = merge.conflicts.map((c) => ({
      ...c,
      ...(c.recommendedOptionIndex !== undefined
        ? { resolvedOptionIndex: c.recommendedOptionIndex }
        : {}),
    }));
    const reviewIssues: CompletenessIssueReview[] = merge.completenessIssues.map(
      (i) => ({ ...i }),
    );

    const intermediate: JobIntermediate = {
      fromVersion,
      intents: reviewIntents,
      conflicts: reviewConflicts,
      completenessIssues: reviewIssues,
      termMappings: dedupTermMappings(allTermMappings),
      newImageAssets,
      ...(input.changeSummary ? { changeSummary: input.changeSummary } : {}),
      appliedBy: input.appliedBy,
      stats: merge.stats,
    };
    await updateJob(jobId, { intermediate, progress: 50 });
    await setSubtaskStatus(
      jobId,
      subtasks[3],
      'completed',
      `合併 ${merge.stats.mergedCount} 項；衝突 ${merge.conflicts.length} 組；完整性問題 ${merge.completenessIssues.length} 項`,
    );

    // === 5. 是否需要審核？===
    const needsReview =
      reviewConflicts.length > 0 ||
      reviewIntents.some((i) => i.status === 'pending') ||
      reviewIssues.length > 0;

    if (needsReview) {
      await updateJob(jobId, {
        status: 'awaiting_review',
        currentStep: subtasks[4],
        progress: 55,
      });
      await setSubtaskStatus(jobId, subtasks[4], 'running');
      return { outcome: 'awaiting_review' };
    }

    // 全自動：跳過第 4 步，直接 phase 2
    await setSubtaskStatus(jobId, subtasks[4], 'skipped', '無需審核（全部高信心 + 無衝突）');
    const applied = await runUpdateSopApply(jobId);
    return { outcome: 'auto_completed', applied };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: 'failed',
      error: { message, code: 'pipeline_error' },
    });
    throw err;
  }
}

// ============================================================
// Phase 2：套用（從 intermediate 讀已 accepted → apply → render → persist）
// ============================================================

/**
 * 第二段：從 job.intermediate 讀取已審核完的 intents，套用到 base IR，
 * 渲染、寫入新版本與 changes 文件。
 *
 * 此函式會自己讀 job → 用 sopId / fromVersion 重拉最新 IR。
 */
export async function runUpdateSopApply(
  jobId: string,
): Promise<UpdateSopJobResult> {
  const subtasks = UPDATE_SOP_SUBTASKS;

  // 先讀 job
  const job = await fetchJob(jobId);
  if (!job) throw new Error(`找不到 job ${jobId}`);
  if (!job.intermediate) throw new Error('job 尚無中介資料（請先跑分析）');
  if (!job.sopId) throw new Error('job 缺 sopId');
  const sopId = job.sopId;
  const uid = job.owner;
  const interim = job.intermediate;

  try {
    await updateJob(jobId, {
      status: 'merging',
      currentStep: subtasks[5],
      progress: 60,
    });
    await setSubtaskStatus(jobId, subtasks[5], 'running');

    // 1. 重拉最新 IR（保險：審核期間若有別人改動）
    const latest = await getLatestVersion(sopId);
    if (!latest) throw new Error(`找不到 SOP ${sopId} 的版本`);
    if (latest.ir.version !== interim.fromVersion) {
      console.warn(
        `[update-sop] base 版本已從 ${interim.fromVersion} 變成 ${latest.ir.version}；仍以最新版本套用`,
      );
    }
    const baseIr = latest.ir;

    // 2. 收集要套用的 intents：accepted + modified + 衝突已選定的那一筆
    const acceptedIntents = interim.intents.filter(
      (i) => i.status === 'accepted' || i.status === 'modified',
    );
    const fromConflicts: ChangeIntent[] = [];
    for (const c of interim.conflicts) {
      if (c.dismissed) continue;
      const idx = c.resolvedOptionIndex;
      if (idx === undefined) continue; // 仍未決，視為跳過
      const picked = c.options[idx];
      if (picked) {
        fromConflicts.push({ ...picked, status: 'accepted' });
      }
    }
    const intentsToApply: ChangeIntent[] = [
      ...applyUserModifications(acceptedIntents),
      ...fromConflicts,
    ];

    if (intentsToApply.length === 0) {
      throw new Error('沒有任何已接受的變更，無法產生新版本');
    }

    const { newVersion } = bumpForIntents(latest.ir.version, intentsToApply);
    const nowIso = new Date().toISOString();
    const result = applyChangeIntents(baseIr, intentsToApply, {
      newVersion,
      updatedAt: nowIso,
    });
    await setSubtaskStatus(
      jobId,
      subtasks[5],
      'completed',
      `套用 ${result.applied.length} 項；跳過 ${result.skipped.length} 項；新版本 v${newVersion}`,
    );

    // 3. Markdown
    await updateJob(jobId, {
      status: 'rendering',
      currentStep: subtasks[6],
      progress: 70,
    });
    await setSubtaskStatus(jobId, subtasks[6], 'running');
    const markdown = renderMarkdown(result.ir);
    await setSubtaskStatus(jobId, subtasks[6], 'completed');

    // 4. Word + PDF
    await updateJob(jobId, { currentStep: subtasks[7], progress: 78 });
    await setSubtaskStatus(jobId, subtasks[7], 'running');

    const mergedAssets: Record<string, ImageAsset> = {
      ...latest.imageAssets,
      ...interim.newImageAssets,
    };
    const resolveImage = async (imageId: string) => {
      const asset = mergedAssets[imageId];
      if (!asset) return null;
      try {
        const bytes = await fetchAsBytes(asset.downloadUrl);
        return { bytes, contentType: asset.contentType };
      } catch (err) {
        console.warn('[update-sop apply] image fetch failed', imageId, err);
        return null;
      }
    };
    const versionId = `v${result.ir.version}`;
    const [docxBlob, pdfBlob] = await Promise.all([
      renderDocx(result.ir, { resolveImage }),
      renderPdf(result.ir, { resolveImage }),
    ]);
    const [docxUpload, pdfUpload] = await Promise.all([
      uploadRenderedDoc(uid, sopId, versionId, docxBlob, 'docx'),
      uploadRenderedDoc(uid, sopId, versionId, pdfBlob, 'pdf'),
    ]);
    await setSubtaskStatus(jobId, subtasks[7], 'completed');
    await updateJob(jobId, { progress: 88 });

    // 5. 寫新版本
    await updateJob(jobId, { currentStep: subtasks[8], progress: 92 });
    await setSubtaskStatus(jobId, subtasks[8], 'running');
    const changeId = newChangeId();
    const needsRetraining = intentsToApply.some(
      (i) => i.impact?.needs_retraining === true,
    );
    await addVersion({
      sopId,
      owner: uid,
      ir: result.ir,
      fromVersion: latest.ir.version,
      changeId,
      ...(interim.changeSummary ? { changeSummary: interim.changeSummary } : {}),
      documentMarkdown: markdown,
      documentDocxUrl: docxUpload.downloadUrl,
      documentPdfUrl: pdfUpload.downloadUrl,
      sourceMaterialsUrls: job.uploadedFiles.map((f) => f.storageUrl),
      imageAssets: mergedAssets,
      needsRetraining,
    });
    await setSubtaskStatus(jobId, subtasks[8], 'completed');

    // 6. 寫變更紀錄（含未決衝突 / 完整性問題作為審核紀錄）
    await updateJob(jobId, { currentStep: subtasks[9], progress: 96 });
    await setSubtaskStatus(jobId, subtasks[9], 'running');

    await addChangeWithMergeArtifacts({
      sopId,
      changeId,
      fromVersion: latest.ir.version,
      toVersion: newVersion,
      appliedBy: interim.appliedBy,
      changeIntents: result.applied,
      skippedIntents: result.skipped,
      conflicts: interim.conflicts,
      completenessIssues: interim.completenessIssues,
      termMappings: interim.termMappings,
    });
    await setSubtaskStatus(jobId, subtasks[9], 'completed');

    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      result: { sopId, versionId },
    });

    return {
      sopId,
      versionId,
      changeId,
      appliedCount: result.applied.length,
      conflictCount: interim.conflicts.length,
      completenessIssueCount: interim.completenessIssues.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: 'failed',
      error: { message, code: 'pipeline_error' },
    });
    throw err;
  }
}

// ============================================================
// 使用者修改的 intents：把 user_modification.after 套回 after
// ============================================================

function applyUserModifications(intents: ChangeIntent[]): ChangeIntent[] {
  return intents.map((i) =>
    i.user_modification
      ? { ...i, after: i.user_modification.after }
      : i,
  );
}

// ============================================================
// W7 兼容入口：一氣呵成（內部會自動暫停 / 不暫停）
// ============================================================

export async function runUpdateSopPipeline(
  input: UpdateSopJobInput,
): Promise<UpdateSopJobResult | { awaitingReview: true; jobId: string }> {
  const result = await runUpdateSopAnalysis(input);
  if (result.outcome === 'auto_completed' && result.applied) {
    return result.applied;
  }
  return { awaitingReview: true, jobId: input.jobId };
}

// ============================================================
// 內部：fetch job + persist changes
// ============================================================

async function fetchJob(jobId: string): Promise<ProcessingJob | null> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const unsubscribe = subscribeJob(jobId, (job) => {
      if (resolved) return;
      resolved = true;
      unsubscribe();
      resolve(job);
    });
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      unsubscribe();
      reject(new Error('讀取 job 超時'));
    }, 5000);
  });
}

interface AddChangeArtifactsInput {
  sopId: string;
  changeId: string;
  fromVersion: string;
  toVersion: string;
  appliedBy: string;
  changeIntents: ChangeIntent[];
  skippedIntents: Array<{ intent: ChangeIntent; reason: string }>;
  conflicts: Conflict[];
  completenessIssues: CompletenessIssue[];
  termMappings: TermMapping[];
}

async function addChangeWithMergeArtifacts(
  input: AddChangeArtifactsInput,
): Promise<void> {
  await addChange({
    sopId: input.sopId,
    changeId: input.changeId,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    appliedBy: input.appliedBy,
    changeIntents: input.changeIntents,
    skippedIntents: input.skippedIntents,
    conflicts: input.conflicts,
    completenessIssues: input.completenessIssues,
    termMappings: input.termMappings,
    statsOverride: {
      totalRawIntents:
        input.changeIntents.length +
        input.skippedIntents.length +
        input.conflicts.reduce((s, c) => s + c.options.length, 0),
      consolidated: input.changeIntents.length,
      autoApplied: input.changeIntents.filter((i) => i.auto_apply).length,
      manuallyAccepted: input.changeIntents.filter(
        (i) => !i.auto_apply && i.status === 'accepted',
      ).length,
      rejected: input.skippedIntents.length,
      conflictsResolved: input.conflicts.filter(
        (c) => 'resolvedOptionIndex' in c && c.resolvedOptionIndex !== undefined,
      ).length,
    },
  });
}

function dedupTermMappings(mappings: TermMapping[]): TermMapping[] {
  const seen = new Map<string, TermMapping>();
  for (const m of mappings) {
    const key = m.vendorTerm.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.set(key, m);
  }
  return [...seen.values()];
}
