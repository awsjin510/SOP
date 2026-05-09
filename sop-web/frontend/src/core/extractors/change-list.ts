import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import type { ChangeIntent } from '@/core/ir/schemas';

export interface ChangeListInput {
  /** docx ArrayBuffer 或 markdown 純文字 */
  buffer?: ArrayBuffer;
  text?: string;
  format: 'docx' | 'markdown';
}

export interface ChangeListPayload {
  intents: ChangeIntent[];
}

/** 修改清單抽取器（更新流程用）— W6 實作 */
export class ChangeListExtractor extends BaseExtractor<
  ChangeListInput,
  ChangeListPayload
> {
  readonly type = 'change_list' as const;

  async extract(
    _input: ChangeListInput,
    _context: ExtractorContext,
  ): Promise<ExtractorOutput<ChangeListPayload>> {
    throw new Error('ChangeListExtractor 尚未實作；W6 階段會接 Word 表格 / 追蹤修訂解析');
  }
}
