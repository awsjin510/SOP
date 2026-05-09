/**
 * IR + ChangeIntent zod schemas
 *
 * 對應規格 schemas/ir-schema.json 與 schemas/change-intent-schema.json，
 * zod 是單一來源：runtime 驗證 + TS type 推導皆從此檔。
 */
import { z } from 'zod';

// ============================================================
// Shared
// ============================================================

export const ExtractorTypeSchema = z.enum([
  'transcript',
  'document',
  'screenshot',
  'change_list',
  'text',
  'pdf',
]);

export const SourceRefSchema = z.object({
  source_file: z.string(),
  extractor_type: ExtractorTypeSchema,
  location: z.string().optional(),
  excerpt: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const StepIdSchema = z.string().regex(/^step-[a-zA-Z0-9_-]+$/, {
  message: 'step_id 必須為 step-{nanoid} 格式',
});

const TroubleIdSchema = z
  .string()
  .regex(/^trouble-[a-zA-Z0-9_-]+$/, '若 id 為 trouble-{nanoid} 格式');

const TermIdSchema = z
  .string()
  .regex(/^term-[a-zA-Z0-9_-]+$/, '若 id 為 term-{nanoid} 格式');

// ============================================================
// IR
// ============================================================

export const ActionSchema = z.object({
  text: z.string(),
  command: z.string().optional(),
  screenshot_refs: z.array(z.string()).optional(),
});

export const StepSchema = z.object({
  step_id: StepIdSchema,
  section_id: z.string(),
  order: z.number().int().min(0).optional(),
  title: z.string().max(200),
  purpose: z.string().optional(),
  preconditions: z.array(z.string()).optional(),
  actions: z.array(ActionSchema),
  expected_result: z.string().optional(),
  common_mistakes: z.array(z.string()).optional(),
  tips: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  estimated_duration_minutes: z.number().int().min(0).optional(),
  source_refs: z.array(SourceRefSchema).min(1, {
    message: '每個 step 必須有至少一個 source_ref（不允許編造）',
  }),
  needs_human_input: z.boolean().optional(),
  human_input_reason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const TroubleshootingItemSchema = z.object({
  id: TroubleIdSchema,
  symptom: z.string(),
  cause: z.string().optional(),
  solution: z.string().optional(),
  related_step_ids: z.array(z.string()).optional(),
  severity: z.enum(['低', '中', '高', '嚴重']).optional(),
  source_refs: z.array(SourceRefSchema),
  confidence: z.number().min(0).max(1).optional(),
});

export const GlossaryTermSchema = z.object({
  id: TermIdSchema,
  term: z.string(),
  definition: z.string(),
  aliases: z.array(z.string()).optional(),
  see_also: z.array(z.string()).optional(),
});

export const ChecklistSchema = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string().optional(),
  items: z.array(
    z.object({
      text: z.string(),
      step_ref: z.string().optional(),
    }),
  ),
});

export const SectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int().min(0),
  description: z.string().optional(),
});

export const IrMetaSchema = z.object({
  sop_id: z.string().regex(/^[a-z0-9-]+$/, 'sop_id 必須為 kebab-case'),
  title: z.string().max(200),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  target_audience: z.string(),
  estimated_duration_minutes: z.number().int().min(0).optional(),
  difficulty: z.enum(['初級', '中級', '進階']).optional(),
  authors: z.array(z.string()).optional(),
  created_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
  updated_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
  last_reviewed_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .optional(),
});

export const IrSchema = z.object({
  schema_version: z.literal('1.0.0'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'IR.version 必須為 semver'),
  meta: IrMetaSchema,
  sections: z.array(SectionSchema),
  steps: z.array(StepSchema),
  troubleshooting: z.array(TroubleshootingItemSchema).optional(),
  glossary: z.array(GlossaryTermSchema).optional(),
  checklists: z.array(ChecklistSchema).optional(),
  appendix: z
    .object({
      references: z.array(z.string()).optional(),
      related_sops: z.array(z.string()).optional(),
    })
    .optional(),
});

// ============================================================
// ChangeIntent
// ============================================================

export const ChangeIntentTypeSchema = z.enum([
  'add_step',
  'modify_step',
  'remove_step',
  'reorder_step',
  'add_troubleshooting',
  'modify_troubleshooting',
  'remove_troubleshooting',
  'add_glossary',
  'modify_glossary',
  'modify_meta',
  'replace_screenshot',
  'add_warning',
  'add_tip',
]);

export const ChangeIntentTargetSchema = z.object({
  step_id: z.string().optional(),
  trouble_id: z.string().optional(),
  term_id: z.string().optional(),
  section_id: z.string().optional(),
  field: z.string().optional(),
});

export const ChangeIntentSourceRefSchema = z.object({
  source_file: z.string(),
  extractor_type: z.enum(['change_list', 'text', 'pdf', 'screenshot']),
  location: z.string().optional(),
  excerpt: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const ChangeIntentSchema = z.object({
  intent_id: z.string(),
  type: ChangeIntentTypeSchema,
  target: ChangeIntentTargetSchema,
  description: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
  diff: z.string().optional(),
  rationale: z.string().optional(),
  impact: z
    .object({
      affected_steps: z.array(z.string()).optional(),
      affected_sections: z.array(z.string()).optional(),
      needs_screenshot_update: z.boolean().optional(),
      breaking_change: z.boolean().optional(),
      needs_retraining: z.boolean().optional(),
    })
    .optional(),
  source_refs: z.array(ChangeIntentSourceRefSchema).min(1),
  confidence: z.number().min(0).max(1),
  auto_apply: z.boolean().optional(),
  needs_review: z.boolean().optional(),
  status: z
    .enum(['pending', 'accepted', 'rejected', 'modified', 'skipped'])
    .optional(),
  user_modification: z
    .object({
      after: z.string(),
      modified_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
    })
    .optional(),
});

// ============================================================
// Inferred TS types — 從 zod 推導，避免重複定義
// ============================================================

export type ExtractorType = z.infer<typeof ExtractorTypeSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Step = z.infer<typeof StepSchema>;
export type TroubleshootingItem = z.infer<typeof TroubleshootingItemSchema>;
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export type Checklist = z.infer<typeof ChecklistSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type IrMeta = z.infer<typeof IrMetaSchema>;
export type IR = z.infer<typeof IrSchema>;

export type ChangeIntentType = z.infer<typeof ChangeIntentTypeSchema>;
export type ChangeIntentTarget = z.infer<typeof ChangeIntentTargetSchema>;
export type ChangeIntent = z.infer<typeof ChangeIntentSchema>;
