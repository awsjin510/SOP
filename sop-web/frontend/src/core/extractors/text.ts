import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import type { ChangeIntent } from '@/core/ir/schemas';

export interface TextInput {
  text: string;
}

export interface TextPayload {
  /** 文字檔的子類型（會議紀錄 / bug 報告 / 其他） */
  textType: 'meeting_notes' | 'bug_report' | 'other';
  intents: ChangeIntent[];
}

/** 文字檔抽取器（更新流程用）— W7 實作 */
export class TextExtractor extends BaseExtractor<TextInput, TextPayload> {
  readonly type = 'text' as const;

  async extract(
    _input: TextInput,
    _context: ExtractorContext,
  ): Promise<ExtractorOutput<TextPayload>> {
    throw new Error('TextExtractor 尚未實作；W7 階段會分類後抽取');
  }
}
