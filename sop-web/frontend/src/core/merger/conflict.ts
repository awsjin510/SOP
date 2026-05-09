import type { ChangeIntent } from '@/core/ir/schemas';

export type ConflictType =
  | 'source_contradiction'
  | 'temporal_conflict'
  | 'semantic_inconsistency';

export interface Conflict {
  id: string;
  type: ConflictType;
  description: string;
  options: ChangeIntent[];
  recommendedOptionIndex?: number;
  rationale?: string;
}

/** W7 實作：偵測 3 種衝突類型 */
export function detectConflicts(_intents: ChangeIntent[]): Conflict[] {
  throw new Error('Conflict detector 尚未實作；W7 實作');
}
