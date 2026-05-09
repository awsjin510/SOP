import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import type { Step, TroubleshootingItem } from '@/core/ir/schemas';

export interface TranscriptInput {
  /** 訪談逐字稿純文字 */
  text: string;
}

export interface TranscriptPayload {
  steps: Step[];
  troubleshooting: TroubleshootingItem[];
}

/**
 * 訪談逐字稿抽取器 — W3 階段實作。
 */
export class TranscriptExtractor extends BaseExtractor<
  TranscriptInput,
  TranscriptPayload
> {
  readonly type = 'transcript' as const;

  async extract(
    _input: TranscriptInput,
    _context: ExtractorContext,
  ): Promise<ExtractorOutput<TranscriptPayload>> {
    throw new Error('TranscriptExtractor 尚未實作；W3 階段會接上 Claude prompt');
  }
}
