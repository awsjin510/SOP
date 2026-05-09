import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import type { ChangeIntent } from '@/core/ir/schemas';

export interface PdfInput {
  buffer: ArrayBuffer;
}

export interface PdfPayload {
  intents: ChangeIntent[];
  /** 廠商用語 ↔ 內部用語對映 */
  termMappings?: Array<{ vendorTerm: string; internalTerm: string }>;
}

/** PDF 抽取器（更新流程用，廠商通知）— W7 實作 */
export class PdfExtractor extends BaseExtractor<PdfInput, PdfPayload> {
  readonly type = 'pdf' as const;

  async extract(
    _input: PdfInput,
    _context: ExtractorContext,
  ): Promise<ExtractorOutput<PdfPayload>> {
    throw new Error('PdfExtractor 尚未實作；W7 階段會接 pdf.js + 術語對映');
  }
}
