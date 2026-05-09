import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import type { Section, Step } from '@/core/ir/schemas';

export interface DocumentInput {
  /** docx 或 pdf 的二進位 (ArrayBuffer)；W4 起會在前端用 mammoth/pdf.js 轉成結構化內容 */
  buffer: ArrayBuffer;
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | 'application/pdf';
}

export interface DocumentPayload {
  sections: Section[];
  steps: Step[];
}

/** 既有文件抽取器 — W4 實作 */
export class DocumentExtractor extends BaseExtractor<DocumentInput, DocumentPayload> {
  readonly type = 'document' as const;

  async extract(
    _input: DocumentInput,
    _context: ExtractorContext,
  ): Promise<ExtractorOutput<DocumentPayload>> {
    throw new Error('DocumentExtractor 尚未實作；W4 階段會接 mammoth + pdf.js');
  }
}
