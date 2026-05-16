import { z } from 'zod';
import { nanoid } from 'nanoid';
import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import { extractJsonBlock } from '@/core/extractors/helpers';
import systemPrompt from '@/core/prompts/screenshot-system.md?raw';

export type ScreenshotMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ScreenshotInput {
  /** 原始圖檔 bytes 或預先 resize 過的版本 */
  blob: Blob;
  mimeType: ScreenshotMime;
}

export interface ScreenshotPayload {
  /** 系統產的穩定 image_id */
  image_id: string;
  /** 原始檔名 */
  source_file: string;
  description: string;
  ui_elements: string[];
  annotations: string[];
  likely_step_titles: string[];
  ocr_text_excerpt: string;
  confidence: number;
}

const RawScreenshotOutputSchema = z.object({
  description: z.string(),
  ui_elements: z.array(z.string()).default([]),
  annotations: z.array(z.string()).default([]),
  likely_step_titles: z.array(z.string()).default([]),
  ocr_text_excerpt: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.7),
});

/** Vision API 建議邊長上限；超過會自動縮放 */
export const VISION_MAX_DIMENSION = 1568;
/** Vision API 單張上限 5MB（base64 編碼前的位元組大小做估算） */
export const VISION_MAX_BYTES = 5 * 1024 * 1024;

export class ScreenshotExtractor extends BaseExtractor<
  ScreenshotInput,
  ScreenshotPayload
> {
  readonly type = 'screenshot' as const;

  async extract(
    input: ScreenshotInput,
    context: ExtractorContext,
  ): Promise<ExtractorOutput<ScreenshotPayload>> {
    // 1. 縮放與壓縮（必要時）
    const resized = await this.resizeIfNeeded(input.blob, input.mimeType);

    // 2. base64 編碼
    const base64 = await blobToBase64(resized.blob);

    // 3. 呼叫 Claude Vision
    const response = await this.callClaude({
      system: systemPrompt,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: resized.mimeType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: `素材檔名：${context.sourceFile}\n請依系統指示產出 JSON。`,
            },
          ],
        },
      ],
    });

    // 4. 解析 JSON
    const json = extractJsonBlock(response.text);
    if (!json) {
      throw new Error('Claude Vision 回應中找不到 JSON block');
    }
    const parsed = RawScreenshotOutputSchema.parse(JSON.parse(json));

    const payload: ScreenshotPayload = {
      image_id: `img-${nanoid(10)}`,
      source_file: context.sourceFile,
      description: parsed.description,
      ui_elements: parsed.ui_elements,
      annotations: parsed.annotations,
      likely_step_titles: parsed.likely_step_titles,
      ocr_text_excerpt: parsed.ocr_text_excerpt,
      confidence: parsed.confidence,
    };

    return this.makeOutput(context, payload);
  }

  /**
   * 用 OffscreenCanvas（瀏覽器）做一次縮放壓縮，超過限制才縮。
   * 測試環境（happy-dom）沒有 OffscreenCanvas，這時直接回原圖（測試會 mock callClaude）。
   */
  private async resizeIfNeeded(
    blob: Blob,
    mimeType: ScreenshotMime,
  ): Promise<{ blob: Blob; mimeType: ScreenshotMime }> {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      return { blob, mimeType };
    }
    if (blob.size <= VISION_MAX_BYTES) {
      const dim = await getImageDimensions(blob);
      if (dim.width <= VISION_MAX_DIMENSION && dim.height <= VISION_MAX_DIMENSION) {
        return { blob, mimeType };
      }
    }
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(
      1,
      VISION_MAX_DIMENSION / bitmap.width,
      VISION_MAX_DIMENSION / bitmap.height,
    );
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { blob, mimeType };
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();
    // PNG 轉成 JPEG 以縮小檔案；保留 webp 為 webp
    const outMime: ScreenshotMime = mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const out = await canvas.convertToBlob({ type: outMime, quality: 0.85 });
    return { blob: out, mimeType: outMime };
  }
}

// ============================================================
// Helpers
// ============================================================

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  // 用 chunk 處理避免大字串 stack overflow（每 32KB 一段）
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  return btoa(binary);
}

async function getImageDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const dim = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dim;
}
