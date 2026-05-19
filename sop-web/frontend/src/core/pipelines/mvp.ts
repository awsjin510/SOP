import { nanoid } from 'nanoid';
import { TranscriptExtractor, type TranscriptPayload } from '@/core/extractors/transcript';
import {
  DocumentExtractor,
  type DocumentPayload,
  type DocumentFormat,
} from '@/core/extractors/document';
import {
  ScreenshotExtractor,
  type ScreenshotPayload,
  type ScreenshotMime,
} from '@/core/extractors/screenshot';
import { buildIrFromTranscript } from '@/core/ir/builder';
import { buildIrFromMultiSource } from '@/core/ir/multi-builder';
import type { IR } from '@/core/ir/schemas';
import type { JobUploadedFile, ProgressReporter } from '@/services/job';
import type { SopMetadata } from '@/services/sop';

/**
 * MVP 抽取 pipeline：File[] → IR。
 *
 * 對比舊版 create-sop pipeline，這裡：
 *   - 不上傳 Firebase Storage
 *   - 不寫 Firestore
 *   - 不做 W4 內訓增強（之後可加）
 *   - 不做 Word/PDF 預渲染（result 頁按鈕觸發即時渲染）
 *
 * 只負責 (1) 讀檔 (2) 跑抽取器 (3) build IR (4) 回傳。
 */
export interface RunMvpInput {
  files: JobUploadedFile[];
  title: string;
  targetAudience?: string;
  authors?: string[];
}

export interface RunMvpOutput {
  ir: IR;
  metadata: SopMetadata;
}

const SOP_TITLE_TO_ID = (title: string): string =>
  title.trim().replace(/[\s/\\:*?"<>|]+/g, '-').slice(0, 40) || `sop-${nanoid(6)}`;

export async function runMvpExtractionPipeline(
  input: RunMvpInput,
  reporter: ProgressReporter,
): Promise<RunMvpOutput> {
  const { files, title } = input;
  const targetAudience = input.targetAudience ?? '一般使用者';
  const authors = input.authors ?? ['匿名'];

  if (files.length === 0) {
    throw new Error('至少需要一個輸入檔');
  }

  const sopId = SOP_TITLE_TO_ID(title);

  reporter({ status: 'reading', percent: 5, message: '讀取上傳檔案…' });

  const transcripts: TranscriptPayload[] = [];
  const documents: DocumentPayload[] = [];
  const screenshots: ScreenshotPayload[] = [];

  const transcriptExtractor = new TranscriptExtractor();
  const documentExtractor = new DocumentExtractor();
  const screenshotExtractor = new ScreenshotExtractor();

  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    const pct = 10 + Math.round((i / files.length) * 60);
    reporter({
      status: 'extracting',
      percent: pct,
      message: `分析素材 ${i + 1} / ${files.length}：${f.name}`,
    });

    if (f.type === 'transcript') {
      const text = await f.blob.text();
      const out = await transcriptExtractor.extract(
        { text, title, targetAudience },
        { sourceFile: f.name },
      );
      transcripts.push(out.payload);
    } else if (f.type === 'document') {
      const buffer = await f.blob.arrayBuffer();
      const format: DocumentFormat = detectDocumentFormat(f.name);
      const out = await documentExtractor.extract(
        { buffer, format, title, targetAudience },
        { sourceFile: f.name },
      );
      documents.push(out.payload);
    } else if (f.type === 'screenshot') {
      const mimeType: ScreenshotMime = detectScreenshotMime(f.name, f.blob.type);
      const out = await screenshotExtractor.extract(
        { blob: f.blob, mimeType },
        { sourceFile: f.name },
      );
      screenshots.push(out.payload);
    }
  }

  reporter({ status: 'building_ir', percent: 75, message: '組合 SOP 結構…' });

  const createdAt = new Date().toISOString();

  let ir: IR;
  if (transcripts.length === 1 && documents.length === 0 && screenshots.length === 0) {
    // 單檔訪談稿快速路徑
    ir = buildIrFromTranscript(transcripts[0]!, {
      sopId,
      title,
      targetAudience,
      authors,
      createdAt,
      updatedAt: createdAt,
    });
  } else {
    const result = await buildIrFromMultiSource(
      { transcripts, documents, screenshots },
      {
        sopId,
        title,
        targetAudience,
        authors,
        createdAt,
        updatedAt: createdAt,
        // MVP 預設關掉這兩個 Claude 呼叫，省 token；想要的話之後加 settings 開關
        enableDedup: transcripts.length + documents.length > 1,
        enableScreenshotPairing: screenshots.length > 0,
      },
    );
    ir = result.ir;
  }

  reporter({ status: 'completed', percent: 100, message: '完成' });

  const metadata: SopMetadata = {
    title,
    targetAudience,
    sourceFiles: files.map((f) => ({
      name: f.name,
      type: f.type,
      extractedAt: createdAt,
    })),
  };

  return { ir, metadata };
}

function detectDocumentFormat(filename: string): DocumentFormat {
  return filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';
}

function detectScreenshotMime(filename: string, mime: string): ScreenshotMime {
  if (mime === 'image/jpeg' || /\.jpe?g$/i.test(filename)) return 'image/jpeg';
  if (mime === 'image/webp' || /\.webp$/i.test(filename)) return 'image/webp';
  return 'image/png';
}

export function classifyUploadedFile(file: File): JobUploadedFile['type'] {
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
  return 'transcript';
}
