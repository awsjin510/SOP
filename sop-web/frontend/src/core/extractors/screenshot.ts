import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';

export interface ScreenshotInput {
  /** 圖片 base64 與 MIME，由前端讀檔轉換 */
  base64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface ScreenshotPayload {
  /** 系統產的穩定 image_id（assets/images.yaml 的 key） */
  imageId: string;
  /** 文字描述（給內訓 SOP 使用） */
  description: string;
  /** 從圖片中辨識出的 UI 元素標籤；W4 才填 */
  uiElements?: string[];
  confidence: number;
}

/** 截圖抽取器（用 Claude Vision）— W4 實作 */
export class ScreenshotExtractor extends BaseExtractor<
  ScreenshotInput,
  ScreenshotPayload
> {
  readonly type = 'screenshot' as const;

  async extract(
    _input: ScreenshotInput,
    _context: ExtractorContext,
  ): Promise<ExtractorOutput<ScreenshotPayload>> {
    throw new Error('ScreenshotExtractor 尚未實作；W4 階段會接 Claude Vision');
  }
}
