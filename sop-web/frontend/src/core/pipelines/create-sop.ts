import { TranscriptExtractor } from '@/core/extractors/transcript';
import { buildIrFromTranscript } from '@/core/ir/builder';
import { renderMarkdown } from '@/core/renderer/markdown';
import {
  uploadJobFile,
  readFileAsText,
  type UploadResult,
} from '@/services/storage';
import {
  updateJob,
  setSubtaskStatus,
  type JobUploadedFile,
} from '@/services/job';
import { createSopWithVersion } from '@/services/sop';

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

export interface CreateSopJobInput {
  jobId: string;
  uid: string;
  /** W3：只接受訪談類型 */
  transcriptFile: File;
  meta: CreateSopMeta;
}

export const CREATE_SOP_SUBTASKS = [
  '上傳素材',
  '分析訪談逐字稿',
  '建構 IR',
  '產出 Markdown 預覽',
  '寫入 Firestore',
] as const;

/**
 * 建立 SOP 的單一素材 pipeline。
 * W3 只支援單一訪談；W4 起會擴展為多素材並引入內訓增強。
 */
export async function runCreateSopPipeline(
  input: CreateSopJobInput,
): Promise<{ sopId: string; versionId: string }> {
  const { jobId, uid, transcriptFile, meta } = input;
  const subtasks = CREATE_SOP_SUBTASKS;

  try {
    // === 1. 上傳到 Storage ===
    await updateJob(jobId, {
      status: 'uploading',
      currentStep: subtasks[0],
      progress: 5,
    });
    await setSubtaskStatus(jobId, subtasks[0], 'running');

    const uploaded = await uploadJobFile(uid, jobId, transcriptFile, (p) => {
      // 直接覆寫 progress 欄位（總進度的 5–25%）
      const total = 5 + Math.round(p.percent * 0.2);
      void updateJob(jobId, { progress: total });
    });

    const uploadedFiles: JobUploadedFile[] = [
      {
        name: transcriptFile.name,
        type: 'transcript',
        storageUrl: uploaded.downloadUrl,
        storagePath: uploaded.storagePath,
        size: transcriptFile.size,
        contentType: transcriptFile.type || 'text/plain',
      },
    ];

    await updateJob(jobId, { uploadedFiles, progress: 25 });
    await setSubtaskStatus(jobId, subtasks[0], 'completed');

    // === 2. 抽取訪談 ===
    await updateJob(jobId, {
      status: 'extracting',
      currentStep: subtasks[1],
      progress: 30,
    });
    await setSubtaskStatus(jobId, subtasks[1], 'running');

    const text = await readFileAsText(transcriptFile);
    const extractor = new TranscriptExtractor();
    const result = await extractor.extract(
      {
        text,
        title: meta.title,
        targetAudience: meta.targetAudience,
      },
      { sourceFile: transcriptFile.name },
    );

    await updateJob(jobId, { progress: 60 });
    await setSubtaskStatus(
      jobId,
      subtasks[1],
      'completed',
      `抽取出 ${result.payload.steps.length} 個步驟、${result.payload.troubleshooting.length} 個 troubleshooting`,
    );

    // === 3. 建構 IR ===
    await updateJob(jobId, {
      status: 'building_ir',
      currentStep: subtasks[2],
      progress: 70,
    });
    await setSubtaskStatus(jobId, subtasks[2], 'running');

    const nowIso = new Date().toISOString();
    const ir = buildIrFromTranscript(result.payload, {
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
    });
    await setSubtaskStatus(jobId, subtasks[2], 'completed');

    // === 4. 產 Markdown ===
    await updateJob(jobId, {
      status: 'rendering',
      currentStep: subtasks[3],
      progress: 85,
    });
    await setSubtaskStatus(jobId, subtasks[3], 'running');
    const markdown = renderMarkdown(ir);
    await setSubtaskStatus(jobId, subtasks[3], 'completed');

    // === 5. 寫入 Firestore ===
    await updateJob(jobId, {
      currentStep: subtasks[4],
      progress: 95,
    });
    await setSubtaskStatus(jobId, subtasks[4], 'running');

    const written = await createSopWithVersion({
      sopId: meta.sopId,
      owner: uid,
      ir,
      documentMarkdown: markdown,
      sourceMaterialsUrls: uploadedFiles.map((f) => f.storageUrl),
    });

    await setSubtaskStatus(jobId, subtasks[4], 'completed');
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

// 給其他模組（例如測試、Storage 介面）用
export { type UploadResult };
