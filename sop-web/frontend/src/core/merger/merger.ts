import type { ChangeIntent, IR } from '@/core/ir/schemas';
import type { Conflict } from '@/core/merger/conflict';
import type { CompletenessIssue } from '@/core/merger/completeness';

export interface MergeResult {
  /** 去重 + 多源印證提升信心後的 intents */
  intents: ChangeIntent[];
  conflicts: Conflict[];
  completenessIssues: CompletenessIssue[];
}

/**
 * 匯流引擎：把多個抽取器產的 raw intents 整合。
 * W7 實作。
 */
export function mergeChangeIntents(
  _baseIr: IR,
  _rawIntents: ChangeIntent[][],
): MergeResult {
  throw new Error('Merger 尚未實作；W7 階段會做去重、衝突偵測、完整性檢查');
}
