// 統一的 IR 型別出口 — 從 zod schema 推導
export type {
  IR,
  IrMeta,
  Section,
  Step,
  Action,
  TroubleshootingItem,
  GlossaryTerm,
  Checklist,
  SourceRef,
  ExtractorType,
} from '@/core/ir/schemas';

export {
  IrSchema,
  IrMetaSchema,
  SectionSchema,
  StepSchema,
  ActionSchema,
  TroubleshootingItemSchema,
  GlossaryTermSchema,
  ChecklistSchema,
  SourceRefSchema,
  ExtractorTypeSchema,
} from '@/core/ir/schemas';
