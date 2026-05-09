import type { ChangeIntent, IR } from '@/core/ir/schemas';

export type CompletenessIssueType =
  | 'screenshot_outdated'
  | 'glossary_missing'
  | 'reference_broken'
  | 'troubleshooting_orphan'
  | 'training_impact'
  | 'audience_mismatch'
  | 'cross_step_inconsistency';

export interface CompletenessIssue {
  id: string;
  type: CompletenessIssueType;
  severity: '低' | '中' | '高';
  description: string;
  relatedIntent?: string;
  suggestion?: string;
}

/** W7 實作：7 種完整性問題偵測 */
export function detectCompletenessIssues(
  _ir: IR,
  _intents: ChangeIntent[],
): CompletenessIssue[] {
  throw new Error('Completeness detector 尚未實作；W7 實作');
}
