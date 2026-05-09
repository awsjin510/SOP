import { ChangeListExtractor } from '@/core/extractors/change-list';
import { applyChangeIntents } from '@/core/merger/apply';
import { bumpForIntents } from '@/core/merger/version';
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

export type UpdateChangeListFormat = 'docx' | 'markdown';

export interface UpdateSopJobInput {
  jobId: string;
  uid: string;
  sopId: string;
  /** W6 只支援單一修改清單；W7 支援多素材 */
  changeListFile: File;
  changeListFormat: UpdateChangeListFormat;
  changeSummary?: string;
  appliedBy: string;
}

export const UPDATE_SOP_SUBTASKS = [
  '上傳素材',
  '讀取現有 IR',
  '抽取 change_intents',
  '套用變更',
  '產出 Markdown',
  '產出 Word/PDF',
  '寫入新版本',
  '寫入變更紀錄',
] as const;

/**
 * 更新 SOP 主流程（W6 基礎版）。
 *
 * 流程：上傳 → 讀現 IR → 抽 intents → 套用 → 渲染 → 寫新版本 + change record
 *
 * W6 簡化：所有 intent 直接套用（無人工審核閘門，留 W8）；無匯流／衝突偵測（W7）。
 */
export async function runUpdateSopPipeline(
  input: UpdateSopJobInput,
): Promise<{ sopId: string; versionId: string; changeId: string }> {
  const { jobId, uid, sopId, changeListFile, changeListFormat, appliedBy } =
    input;
  const subtasks = UPDATE_SOP_SUBTASKS;

  try {
    // === 1. 上傳素材 ===
    await updateJob(jobId, {
      status: 'uploading',
      currentStep: subtasks[0],
      progress: 5,
    });
    await setSubtaskStatus(jobId, subtasks[0], 'running');

    const uploaded = await uploadJobFile(uid, jobId, changeListFile);
    const uploadedFiles: JobUploadedFile[] = [
      {
        name: changeListFile.name,
        type: 'change_list',
        storageUrl: uploaded.downloadUrl,
        storagePath: uploaded.storagePath,
        size: changeListFile.size,
        contentType: changeListFile.type || 'application/octet-stream',
      },
    ];
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
    if (!latest) {
      throw new Error(`找不到 SOP ${sopId} 的版本`);
    }
    const baseIr = latest.ir;
    const fromVersion = baseIr.version;
    await setSubtaskStatus(
      jobId,
      subtasks[1],
      'completed',
      `已讀取 v${fromVersion}（${baseIr.steps.length} 步驟）`,
    );

    // === 3. 抽取 change_intents ===
    await updateJob(jobId, {
      currentStep: subtasks[2],
      progress: 30,
    });
    await setSubtaskStatus(jobId, subtasks[2], 'running');

    const extractor = new ChangeListExtractor();
    const buffer =
      changeListFormat === 'docx' ? await changeListFile.arrayBuffer() : undefined;
    const text =
      changeListFormat === 'markdown'
        ? await readFileAsText(changeListFile)
        : undefined;

    const out = await extractor.extract(
      {
        format: changeListFormat,
        ...(buffer ? { buffer } : {}),
        ...(text !== undefined ? { text } : {}),
        baseIr,
      },
      { sourceFile: changeListFile.name },
    );
    const intents: ChangeIntent[] = out.payload.intents;
    await setSubtaskStatus(
      jobId,
      subtasks[2],
      'completed',
      `抽出 ${intents.length} 項變更`,
    );

    if (intents.length === 0) {
      throw new Error('修改清單未抽出任何變更意圖（請檢查清單內容是否清楚）');
    }

    // === 4. 套用變更 ===
    await updateJob(jobId, {
      status: 'merging',
      currentStep: subtasks[3],
      progress: 45,
    });
    await setSubtaskStatus(jobId, subtasks[3], 'running');

    const { newVersion } = bumpForIntents(fromVersion, intents);
    const nowIso = new Date().toISOString();
    const result = applyChangeIntents(baseIr, intents, {
      newVersion,
      updatedAt: nowIso,
    });

    await setSubtaskStatus(
      jobId,
      subtasks[3],
      'completed',
      `套用 ${result.applied.length} 項；跳過 ${result.skipped.length} 項；新版本 v${newVersion}`,
    );

    // === 5. 產 Markdown ===
    await updateJob(jobId, {
      status: 'rendering',
      currentStep: subtasks[4],
      progress: 60,
    });
    await setSubtaskStatus(jobId, subtasks[4], 'running');
    const markdown = renderMarkdown(result.ir);
    await setSubtaskStatus(jobId, subtasks[4], 'completed');

    // === 6. 產 Word / PDF ===
    await updateJob(jobId, { currentStep: subtasks[5], progress: 70 });
    await setSubtaskStatus(jobId, subtasks[5], 'running');

    // 提供圖片 resolver：從 latest version 的 imageAssets 拿 URL，再 fetch bytes
    const imageAssets = latest.imageAssets;
    const resolveImage = async (imageId: string) => {
      const asset = imageAssets[imageId];
      if (!asset) return null;
      try {
        const bytes = await fetchAsBytes(asset.downloadUrl);
        return { bytes, contentType: asset.contentType };
      } catch (err) {
        console.warn('[update-sop] image fetch failed', imageId, err);
        return null;
      }
    };

    const docxBlob = await renderDocx(result.ir, { resolveImage });
    const versionId = `v${result.ir.version}`;
    const docxUpload = await uploadRenderedDoc(uid, sopId, versionId, docxBlob, 'docx');
    await updateJob(jobId, { progress: 80 });

    const pdfBlob = await renderPdf(result.ir, { resolveImage });
    const pdfUpload = await uploadRenderedDoc(uid, sopId, versionId, pdfBlob, 'pdf');
    await setSubtaskStatus(jobId, subtasks[5], 'completed');
    await updateJob(jobId, { progress: 88 });

    // === 7. 寫入新版本 ===
    await updateJob(jobId, { currentStep: subtasks[6], progress: 92 });
    await setSubtaskStatus(jobId, subtasks[6], 'running');

    const changeId = newChangeId();
    await addVersion({
      sopId,
      owner: uid,
      ir: result.ir,
      fromVersion,
      changeId,
      ...(input.changeSummary ? { changeSummary: input.changeSummary } : {}),
      documentMarkdown: markdown,
      documentDocxUrl: docxUpload.downloadUrl,
      documentPdfUrl: pdfUpload.downloadUrl,
      sourceMaterialsUrls: uploadedFiles.map((f) => f.storageUrl),
      imageAssets: latest.imageAssets,
      needsRetraining: intents.some((i) => i.impact?.needs_retraining === true),
    });
    await setSubtaskStatus(jobId, subtasks[6], 'completed');

    // === 8. 寫入變更紀錄 ===
    await updateJob(jobId, { currentStep: subtasks[7], progress: 96 });
    await setSubtaskStatus(jobId, subtasks[7], 'running');

    await addChange({
      sopId,
      changeId,
      fromVersion,
      toVersion: newVersion,
      appliedBy,
      changeIntents: result.applied,
      skippedIntents: result.skipped,
    });
    await setSubtaskStatus(jobId, subtasks[7], 'completed');

    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      result: { sopId, versionId },
    });

    return { sopId, versionId, changeId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: 'failed',
      error: { message, code: 'pipeline_error' },
    });
    throw err;
  }
}
