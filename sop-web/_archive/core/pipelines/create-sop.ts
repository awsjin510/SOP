import { TranscriptExtractor } from '@/core/extractors/transcript';
import {
  DocumentExtractor,
  type DocumentFormat,
} from '@/core/extractors/document';
import {
  ScreenshotExtractor,
  type ScreenshotMime,
} from '@/core/extractors/screenshot';
import { buildIrFromTranscript } from '@/core/ir/builder';
import { buildIrFromMultiSource } from '@/core/ir/multi-builder';
import { runEnhancementLoop, type SourceMaterial } from '@/core/enhancement/loop';
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
import { createSopWithVersion } from '@/services/sop';
import type { TranscriptPayload } from '@/core/extractors/transcript';
import type { DocumentPayload } from '@/core/extractors/document';
import type { ScreenshotPayload } from '@/core/extractors/screenshot';
import type { ImageAsset } from '@/types/firestore';

export interface CreateSopMeta {
  sopId: string;
  title: string;
  category?: string;
  tags?: string[];
  targetAudience: string;
  difficulty?: '初級' | '中級' | '進階';
  estimatedDurationMinutes?: number;
  authors: string[];
}

export type ClassifiedFileType =
  | 'transcript'
  | 'document'
  | 'screenshot';

export interface ClassifiedFile {
  file: File;
  type: ClassifiedFileType;
}

export interface CreateSopJobInput {
  jobId: string;
  uid: string;
  files: ClassifiedFile[];
  meta: CreateSopMeta;
}

export const CREATE_SOP_SUBTASKS = [
  '上傳素材',
  '分析訪談',
  '分析文件',
  '描述截圖',
  '多源整合',
  '內訓增強',
  '產出 Word/PDF',
  '寫入 Firestore',
] as const;

/**
 * 自動分類：依檔案 MIME / 副檔名判斷類型。
 */
export function classifyFile(file: File): ClassifiedFileType {
  const mime = file.type;
  const name = file.name.toLowerCase();
  if (mime.startsWith('image/')) return 'screenshot';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/pdf' ||
    name.endsWith('.docx') ||
    name.endsWith('.pdf')
  ) {
    return 'document';
  }
  // 預設：純文字類 → transcript
  return 'transcript';
}

export function detectDocumentFormat(file: File): DocumentFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  return 'docx';
}

export function detectScreenshotMime(file: File): ScreenshotMime {
  if (file.type === 'image/jpeg' || file.name.toLowerCase().match(/\.jpe?g$/))
    return 'image/jpeg';
  if (file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp'))
    return 'image/webp';
  return 'image/png';
}

/**
 * 多素材建立 SOP 主流程。
 */
export async function runCreateSopPipeline(
  input: CreateSopJobInput,
): Promise<{ sopId: string; versionId: string }> {
  const { jobId, uid, files, meta } = input;
  const subtasks = CREATE_SOP_SUBTASKS;

  try {
    // === 1. 上傳所有檔案 ===
    await updateJob(jobId, {
      status: 'uploading',
      currentStep: subtasks[0],
      progress: 5,
    });
    await setSubtaskStatus(jobId, subtasks[0], 'running');

    const uploadedFiles: JobUploadedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const cf = files[i]!;
      const result = await uploadJobFile(uid, jobId, cf.file);
      uploadedFiles.push({
        name: cf.file.name,
        type: cf.type,
        storageUrl: result.downloadUrl,
        storagePath: result.storagePath,
        size: cf.file.size,
        contentType: cf.file.type || 'application/octet-stream',
      });
      const pct = 5 + Math.round(((i + 1) / files.length) * 15);
      await updateJob(jobId, { progress: pct });
    }
    await updateJob(jobId, { uploadedFiles, progress: 20 });
    await setSubtaskStatus(jobId, subtasks[0], 'completed');

    const transcripts = files.filter((f) => f.type === 'transcript');
    const documents = files.filter((f) => f.type === 'document');
    const screenshots = files.filter((f) => f.type === 'screenshot');

    // 收集原素材文字（供內訓增強用）
    const sourceMaterials: SourceMaterial[] = [];

    // === 2. 分析訪談 ===
    const transcriptPayloads: TranscriptPayload[] = [];
    if (transcripts.length === 0) {
      await setSubtaskStatus(jobId, subtasks[1], 'skipped', '無訪談素材');
    } else {
      await updateJob(jobId, {
        status: 'extracting',
        currentStep: subtasks[1],
        progress: 25,
      });
      await setSubtaskStatus(jobId, subtasks[1], 'running');
      const tExtractor = new TranscriptExtractor();
      for (const f of transcripts) {
        const text = await readFileAsText(f.file);
        sourceMaterials.push({
          source_file: f.file.name,
          extractor_type: 'transcript',
          text,
        });
        const out = await tExtractor.extract(
          { text, title: meta.title, targetAudience: meta.targetAudience },
          { sourceFile: f.file.name },
        );
        transcriptPayloads.push(out.payload);
      }
      await setSubtaskStatus(
        jobId,
        subtasks[1],
        'completed',
        `${transcripts.length} 份 / ${transcriptPayloads.reduce((s, p) => s + p.steps.length, 0)} 步驟`,
      );
    }
    await updateJob(jobId, { progress: 40 });

    // === 3. 分析文件 ===
    const documentPayloads: DocumentPayload[] = [];
    if (documents.length === 0) {
      await setSubtaskStatus(jobId, subtasks[2], 'skipped', '無文件素材');
    } else {
      await updateJob(jobId, { currentStep: subtasks[2] });
      await setSubtaskStatus(jobId, subtasks[2], 'running');
      const dExtractor = new DocumentExtractor();
      for (const f of documents) {
        const buffer = await f.file.arrayBuffer();
        const format = detectDocumentFormat(f.file);
        const out = await dExtractor.extract(
          {
            buffer,
            format,
            title: meta.title,
            targetAudience: meta.targetAudience,
          },
          { sourceFile: f.file.name },
        );
        documentPayloads.push(out.payload);
        // 暫存原文（從 mammoth/pdf.js 結果） — 給 enhancer 用
        // 簡化：用 step.actions 的文字當代替（重新讀檔成本高）
        const synthText = out.payload.steps
          .map(
            (s) =>
              `${s.title}\n` +
              s.actions.map((a) => `- ${a.text}`).join('\n'),
          )
          .join('\n\n');
        sourceMaterials.push({
          source_file: f.file.name,
          extractor_type: 'document',
          text: synthText,
        });
      }
      await setSubtaskStatus(
        jobId,
        subtasks[2],
        'completed',
        `${documents.length} 份 / ${documentPayloads.reduce((s, p) => s + p.steps.length, 0)} 步驟`,
      );
    }
    await updateJob(jobId, { progress: 55 });

    // === 4. 描述截圖 ===
    const screenshotPayloads: ScreenshotPayload[] = [];
    // image_id → asset 對映（給後續渲染嵌入截圖用）
    const imageAssets: Record<string, ImageAsset> = {};
    if (screenshots.length === 0) {
      await setSubtaskStatus(jobId, subtasks[3], 'skipped', '無截圖素材');
    } else {
      await updateJob(jobId, { currentStep: subtasks[3] });
      await setSubtaskStatus(jobId, subtasks[3], 'running');
      const sExtractor = new ScreenshotExtractor();
      for (const f of screenshots) {
        const out = await sExtractor.extract(
          { blob: f.file, mimeType: detectScreenshotMime(f.file) },
          { sourceFile: f.file.name },
        );
        screenshotPayloads.push(out.payload);
        // 紀錄 image_id → 上傳路徑與 URL（從 uploadedFiles 找回）
        const uploaded = uploadedFiles.find((u) => u.name === f.file.name);
        if (uploaded) {
          imageAssets[out.payload.image_id] = {
            storagePath: uploaded.storagePath,
            downloadUrl: uploaded.storageUrl,
            contentType: uploaded.contentType,
            sourceFile: f.file.name,
          };
        }
        sourceMaterials.push({
          source_file: f.file.name,
          extractor_type: 'screenshot',
          text: `${out.payload.description}\nUI: ${out.payload.ui_elements.join('; ')}`,
        });
      }
      await setSubtaskStatus(
        jobId,
        subtasks[3],
        'completed',
        `${screenshots.length} 張描述完成`,
      );
    }
    await updateJob(jobId, { progress: 65 });

    // === 5. 整合 IR ===
    await updateJob(jobId, {
      status: 'building_ir',
      currentStep: subtasks[4],
      progress: 70,
    });
    await setSubtaskStatus(jobId, subtasks[4], 'running');

    const nowIso = new Date().toISOString();

    const buildOptions = {
      sopId: meta.sopId,
      title: meta.title,
      ...(meta.category ? { category: meta.category } : {}),
      ...(meta.tags ? { tags: meta.tags } : {}),
      targetAudience: meta.targetAudience,
      ...(meta.difficulty ? { difficulty: meta.difficulty } : {}),
      ...(meta.estimatedDurationMinutes
        ? { estimatedDurationMinutes: meta.estimatedDurationMinutes }
        : {}),
      authors: meta.authors,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    let ir;
    let unassignedImageIds: string[] = [];

    // 若只有單一 transcript，走簡化 single-source builder（便宜）
    if (
      transcriptPayloads.length === 1 &&
      documentPayloads.length === 0 &&
      screenshotPayloads.length === 0
    ) {
      ir = buildIrFromTranscript(transcriptPayloads[0]!, buildOptions);
    } else {
      const result = await buildIrFromMultiSource(
        {
          transcripts: transcriptPayloads,
          documents: documentPayloads,
          screenshots: screenshotPayloads,
        },
        buildOptions,
      );
      ir = result.ir;
      unassignedImageIds = result.unassignedImageIds;
    }

    await setSubtaskStatus(
      jobId,
      subtasks[4],
      'completed',
      `${ir.steps.length} 步驟${unassignedImageIds.length > 0 ? ` / ${unassignedImageIds.length} 張未配對截圖` : ''}`,
    );
    await updateJob(jobId, { progress: 75 });

    // === 6. 內訓增強 ===
    await updateJob(jobId, {
      status: 'enhancing',
      currentStep: subtasks[5],
      progress: 78,
    });
    await setSubtaskStatus(jobId, subtasks[5], 'running');

    const enhancement = await runEnhancementLoop(ir, sourceMaterials);
    await setSubtaskStatus(
      jobId,
      subtasks[5],
      'completed',
      `${enhancement.rounds.length} 輪 / 套用 ${enhancement.appliedActionsCount} 項補強`,
    );
    await updateJob(jobId, { progress: 88 });

    // === 7. 產 Markdown / Word / PDF ===
    await updateJob(jobId, {
      status: 'rendering',
      currentStep: subtasks[6],
      progress: 92,
    });
    await setSubtaskStatus(jobId, subtasks[6], 'running');

    const markdown = renderMarkdown(ir);

    // Image resolver：從 imageAssets 拿 download URL → fetch 成 bytes
    const imageBytesCache = new Map<
      string,
      { bytes: Uint8Array; contentType: string }
    >();
    const resolveImage = async (
      imageId: string,
    ): Promise<{ bytes: Uint8Array; contentType: string } | null> => {
      if (imageBytesCache.has(imageId)) return imageBytesCache.get(imageId)!;
      const asset = imageAssets[imageId];
      if (!asset) return null;
      try {
        const bytes = await fetchAsBytes(asset.downloadUrl);
        const data = { bytes, contentType: asset.contentType };
        imageBytesCache.set(imageId, data);
        return data;
      } catch (err) {
        console.warn(`[render] failed to fetch image ${imageId}`, err);
        return null;
      }
    };

    // 並行渲染 Word + PDF（兩者讀取相同的 image bytes，但快取共用）
    const versionId = `v${ir.version}`;
    const [docxBlob, pdfBlob] = await Promise.all([
      renderDocx(ir, { resolveImage }),
      renderPdf(ir, { resolveImage }),
    ]);

    const [docxUpload, pdfUpload] = await Promise.all([
      uploadRenderedDoc(uid, meta.sopId, versionId, docxBlob, 'docx'),
      uploadRenderedDoc(uid, meta.sopId, versionId, pdfBlob, 'pdf'),
    ]);

    await setSubtaskStatus(
      jobId,
      subtasks[6],
      'completed',
      `Word ${(docxBlob.size / 1024).toFixed(0)}KB / PDF ${(pdfBlob.size / 1024).toFixed(0)}KB`,
    );

    // === 8. 寫入 Firestore ===
    await updateJob(jobId, {
      currentStep: subtasks[7],
      progress: 95,
    });
    await setSubtaskStatus(jobId, subtasks[7], 'running');

    const written = await createSopWithVersion({
      sopId: meta.sopId,
      owner: uid,
      ir,
      documentMarkdown: markdown,
      documentDocxUrl: docxUpload.downloadUrl,
      documentPdfUrl: pdfUpload.downloadUrl,
      sourceMaterialsUrls: uploadedFiles.map((f) => f.storageUrl),
      imageAssets,
    });

    await setSubtaskStatus(jobId, subtasks[7], 'completed');
    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      result: written,
    });

    return written;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: 'failed',
      error: { message, code: 'pipeline_error' },
    });
    throw err;
  }
}
