import { z } from 'zod';
import type { ExtractorType } from '@/core/ir/schemas';

// ---------- Newbie ----------

export const IssueSchema = z.object({
  id: z.string(),
  type: z.enum([
    'missing_purpose',
    'undefined_term',
    'unclear_action',
    'missing_precondition',
    'missing_expected_result',
    'step_jump',
    'audience_mismatch',
  ]),
  target_step_id: z.string().nullable(),
  target_term_id: z.string().nullable(),
  description: z.string(),
  suggestion: z.string().optional(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const NewbieOutputSchema = z.object({
  issues: z.array(IssueSchema).default([]),
  summary: z.string().optional(),
});

// ---------- Enhancer ----------

export const EnhancerActionTypeSchema = z.enum([
  'add_tip',
  'add_warning',
  'set_purpose',
  'set_expected_result',
  'add_glossary_term',
  'mark_needs_human_input',
  'noop',
]);

export const EnhancerSourceRefSchema = z.object({
  source_file: z.string(),
  extractor_type: z.enum(['transcript', 'document', 'screenshot', 'change_list', 'text', 'pdf'] as const satisfies readonly ExtractorType[]),
  location: z.string().optional(),
  excerpt: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const EnhancerActionSchema = z.object({
  id: z.string(),
  issue_id: z.string(),
  type: EnhancerActionTypeSchema,
  target_step_id: z.string().nullable(),
  target_term_id: z.string().nullable(),
  payload: z.record(z.unknown()).default({}),
  source_refs: z.array(EnhancerSourceRefSchema).default([]),
  reason: z.string().optional(),
});
export type EnhancerAction = z.infer<typeof EnhancerActionSchema>;

export const EnhancerOutputSchema = z.object({
  actions: z.array(EnhancerActionSchema).default([]),
});

// ---------- Reviewer ----------

export const ReviewerDecisionSchema = z.object({
  action_id: z.string(),
  decision: z.enum(['approve', 'reject', 'modify']),
  reason: z.string().optional(),
  modification: z
    .object({
      payload: z.record(z.unknown()).optional(),
    })
    .optional(),
});
export type ReviewerDecision = z.infer<typeof ReviewerDecisionSchema>;

export const ReviewerOutputSchema = z.object({
  decisions: z.array(ReviewerDecisionSchema).default([]),
});

// ---------- Loop log ----------

export interface EnhancementRoundLog {
  round: number;
  issues: Issue[];
  actions: EnhancerAction[];
  decisions: ReviewerDecision[];
  appliedActionIds: string[];
}

export interface EnhancementResult {
  appliedActionsCount: number;
  rounds: EnhancementRoundLog[];
  apiCalls: number;
}
