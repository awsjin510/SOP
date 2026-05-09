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
  type JobUploadedFile,
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
  '套用變更',
  '產出 Markdown',
  '產出 Word/PDF',
  '寫入新版本',
  '寫入變更紀錄',
] as const;

export { type ChangeListFormat };
// W6 兼容：保留型別 export 給 UI；但流程已改走 multi-material。
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
  // 預設：純文字檔走 text 抽取器
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
// Pipeline
// ============================================================

/**
 * 更新 SOP 主流程（W7 多素材匯流版）。
 *
 * 流程：
 * 1. 上傳所有素材
 * 2. 讀現有 IR
 * 3. 分流抽取（change_list / text / pdf / screenshot）
 * 4. 匯流：去重 + 衝突偵測 + 完整性檢查
 * 5. 套用「無衝突」的 intents（衝突留 changes 紀錄供 W8 審核）
 * 6. 渲染新版本
 * 7. 寫入 Firestore（versions + changes）
 *
 * **注意**：W7 不含人工審核閘門（W8 才補），衝突的 intents 不會被自動套用。
 */
export async function runUpdateSopPipeline(
  input: UpdateSopJobInput,
): Promise<UpdateSopJobResult> {
  const { jobId, uid, sopId, materials, appliedBy } = input;
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
    /** screenshot file → 對應 image_id（W7 新截圖會被當作新版本的 imageAsset） */
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
      // screenshot 立刻產生 image_id，後續抽取器產出的 replace_screenshot 會用這個 ID
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

    /** 各抽取器產的 raw intent 陣列，等下進 merger */
    const rawIntents: ChangeIntent[][] = [];
    /** PDF 抽取器產的術語對映 */
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
          // 把 replace_screenshot 的 target.field 注入該檔的 image_id
          const imageId = screenshotImageIdByFileName.get(m.file.name);
          const stitched = out.payload.intents.map((intent) => {
            if (intent.type !== 'replace_screenshot' || !imageId) return intent;
            return {
              ...intent,
              target: {
                ...intent.target,
                field: `image_id:${imageId}`,
              },
            };
          });
          rawIntents.push(stitched);
          totalRawIntents += stitched.length;
        }
      } catch (err) {
        console.warn(`[update-sop] extractor failed for ${m.file.name}`, err);
        // 單一素材抽取失敗不應終止整個 pipeline；其他素材繼續
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
    await setSubtaskStatus(
      jobId,
      subtasks[3],
      'completed',
      `合併 ${merge.stats.mergedCount} 項；衝突 ${merge.conflicts.length} 組；完整性問題 ${merge.completenessIssues.length} 項`,
    );

    // === 5. 套用變更 ===
    await updateJob(jobId, { currentStep: subtasks[4], progress: 55 });
    await setSubtaskStatus(jobId, subtasks[4], 'running');

    const intentsToApply = merge.intents;
    if (intentsToApply.length === 0) {
      // 全部落入衝突 → 沒有變更可套（W7 不做版本 bump，直接報錯）
      throw new Error(
        `所有變更皆有衝突或完整性疑慮（${merge.conflicts.length} 組衝突 / ${merge.completenessIssues.length} 項完整性問題），請使用 W8 審核介面處理`,
      );
    }

    const { newVersion } = bumpForIntents(fromVersion, intentsToApply);
    const nowIso = new Date().toISOString();
    const applyResult = applyChangeIntents(baseIr, intentsToApply, {
      newVersion,
      updatedAt: nowIso,
    });
    await setSubtaskStatus(
      jobId,
      subtasks[4],
      'completed',
      `套用 ${applyResult.applied.length} 項；跳過 ${applyResult.skipped.length} 項；新版本 v${newVersion}`,
    );

    // === 6. 產 Markdown ===
    await updateJob(jobId, {
      status: 'rendering',
      currentStep: subtasks[5],
      progress: 65,
    });
    await setSubtaskStatus(jobId, subtasks[5], 'running');
    const markdown = renderMarkdown(applyResult.ir);
    await setSubtaskStatus(jobId, subtasks[5], 'completed');

    // === 7. 產 Word / PDF ===
    await updateJob(jobId, { currentStep: subtasks[6], progress: 75 });
    await setSubtaskStatus(jobId, subtasks[6], 'running');

    const mergedAssets: Record<string, ImageAsset> = {
      ...latest.imageAssets,
      ...newImageAssets,
    };
    const resolveImage = async (imageId: string) => {
      const asset = mergedAssets[imageId];
      if (!asset) return null;
      try {
        const bytes = await fetchAsBytes(asset.downloadUrl);
        return { bytes, contentType: asset.contentType };
      } catch (err) {
        console.warn('[update-sop] image fetch failed', imageId, err);
        return null;
      }
    };

    const versionId = `v${applyResult.ir.version}`;
    const [docxBlob, pdfBlob] = await Promise.all([
      renderDocx(applyResult.ir, { resolveImage }),
      renderPdf(applyResult.ir, { resolveImage }),
    ]);
    const [docxUpload, pdfUpload] = await Promise.all([
      uploadRenderedDoc(uid, sopId, versionId, docxBlob, 'docx'),
      uploadRenderedDoc(uid, sopId, versionId, pdfBlob, 'pdf'),
    ]);
    await setSubtaskStatus(jobId, subtasks[6], 'completed');
    await updateJob(jobId, { progress: 85 });

    // === 8. 寫入新版本 ===
    await updateJob(jobId, { currentStep: subtasks[7], progress: 90 });
    await setSubtaskStatus(jobId, subtasks[7], 'running');

    const changeId = newChangeId();
    const needsRetraining = intentsToApply.some(
      (i) => i.impact?.needs_retraining === true,
    );
    await addVersion({
      sopId,
      owner: uid,
      ir: applyResult.ir,
      fromVersion,
      changeId,
      ...(input.changeSummary ? { changeSummary: input.changeSummary } : {}),
      documentMarkdown: markdown,
      documentDocxUrl: docxUpload.downloadUrl,
      documentPdfUrl: pdfUpload.downloadUrl,
      sourceMaterialsUrls: uploadedFiles.map((f) => f.storageUrl),
      imageAssets: mergedAssets,
      needsRetraining,
    });
    await setSubtaskStatus(jobId, subtasks[7], 'completed');

    // === 9. 寫入變更紀錄（含衝突 / 完整性 / 術語對映） ===
    await updateJob(jobId, { currentStep: subtasks[8], progress: 96 });
    await setSubtaskStatus(jobId, subtasks[8], 'running');

    await addChangeWithMergeArtifacts({
      sopId,
      changeId,
      fromVersion,
      toVersion: newVersion,
      appliedBy,
      changeIntents: applyResult.applied,
      skippedIntents: applyResult.skipped,
      conflicts: merge.conflicts,
      completenessIssues: merge.completenessIssues,
      termMappings: dedupTermMappings(allTermMappings),
    });
    await setSubtaskStatus(jobId, subtasks[8], 'completed');

    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      result: { sopId, versionId },
    });

    return {
      sopId,
      versionId,
      changeId,
      appliedCount: applyResult.applied.length,
      conflictCount: merge.conflicts.length,
      completenessIssueCount: merge.completenessIssues.length,
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
// 內部：把 conflicts / completeness / termMappings 一併寫進 changes 文件
// ============================================================

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
  // 用既有 addChange 寫入主結構，再用 setDoc merge 補進額外欄位。
  await addChange({
    sopId: input.sopId,
    changeId: input.changeId,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    appliedBy: input.appliedBy,
    changeIntents: input.changeIntents,
    skippedIntents: input.skippedIntents,
  });

  // 若沒有額外資料就不需再寫一次
  if (
    input.conflicts.length === 0 &&
    input.completenessIssues.length === 0 &&
    input.termMappings.length === 0
  ) {
    return;
  }

  const { setDoc, doc } = await import('@/services/sop');
  const { db } = await import('@/firebase/config');
  const ref = doc(db, `sops/${input.sopId}/changes/${input.changeId}`);
  await setDoc(
    ref,
    {
      conflicts: input.conflicts,
      completenessIssues: input.completenessIssues,
      ...(input.termMappings.length > 0 ? { termMappings: input.termMappings } : {}),
      stats: {
        totalRawIntents:
          input.changeIntents.length +
          input.skippedIntents.length +
          input.conflicts.reduce((s, c) => s + c.options.length, 0),
        consolidated: input.changeIntents.length,
        autoApplied: input.changeIntents.filter((i) => i.auto_apply).length,
        manuallyAccepted: 0,
        rejected: input.skippedIntents.length,
        conflictsResolved: 0,
      },
    },
    { merge: true },
  );
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
