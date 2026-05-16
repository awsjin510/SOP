import { z } from 'zod';
import { nanoid } from 'nanoid';
import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import type { ChangeIntent, IR } from '@/core/ir/schemas';
import { ChangeIntentTypeSchema } from '@/core/ir/schemas';
import {
  renderTemplate,
  extractJsonBlock,
  attachSourceRefBase,
} from '@/core/extractors/helpers';
import systemPrompt from '@/core/prompts/text-system.md?raw';
import userTemplate from '@/core/prompts/text-user.md?raw';

// ============================================================
// Public API
// ============================================================

export type TextType = 'meeting_notes' | 'bug_report' | 'other';

export interface TextInput {
  /** 文字檔內容 */
  text: string;
  /** 既有 IR — 給 prompt 上下文 */
  baseIr: IR;
}

export interface TextPayload {
  textType: TextType;
  intents: ChangeIntent[];
}

// ============================================================
// LLM raw schema（無 ID；TS 端補）
// ============================================================

const RawSourceRefSchema = z.object({
  location: z.string().optional(),
  excerpt: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const RawIntentSchema = z.object({
  type: ChangeIntentTypeSchema,
  target: z
    .object({
      step_id: z.string().optional(),
      trouble_id: z.string().optional(),
      term_id: z.string().optional(),
      section_id: z.string().optional(),
      field: z.string().optional(),
    })
    .default({}),
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
  source_refs: z.array(RawSourceRefSchema).min(1),
  confidence: z.number().min(0).max(1),
  auto_apply: z.boolean().optional(),
});

const RawOutputSchema = z.object({
  textType: z.enum(['meeting_notes', 'bug_report', 'other']).default('other'),
  intents: z.array(RawIntentSchema).default([]),
});

// ============================================================
// Implementation
// ============================================================

export class TextExtractor extends BaseExtractor<TextInput, TextPayload> {
  readonly type = 'text' as const;

  async extract(
    input: TextInput,
    context: ExtractorContext,
  ): Promise<ExtractorOutput<TextPayload>> {
    const content = input.text;
    if (content.trim().length === 0) {
      throw new Error(`${context.sourceFile} 內容為空`);
    }

    const userPrompt = renderTemplate(userTemplate, {
      title: input.baseIr.meta.title,
      version: input.baseIr.version,
      target_audience: input.baseIr.meta.target_audience,
      source_file: context.sourceFile,
      content,
      steps_summary: JSON.stringify(
        input.baseIr.steps.map((s) => ({
          step_id: s.step_id,
          title: s.title,
          purpose: s.purpose ?? '',
          section_id: s.section_id,
        })),
        null,
        2,
      ),
      trouble_summary: JSON.stringify(
        input.baseIr.troubleshooting?.map((t) => ({
          trouble_id: t.id,
          symptom: t.symptom,
        })) ?? [],
        null,
        2,
      ),
      glossary_summary: JSON.stringify(
        input.baseIr.glossary?.map((g) => ({
          term_id: g.id,
          term: g.term,
        })) ?? [],
        null,
        2,
      ),
    });

    const response = await this.callClaude({
      system: systemPrompt,
      max_tokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const json = extractJsonBlock(response.text);
    if (!json) {
      throw new Error('Claude 回應中找不到 JSON block');
    }
    const parsed = RawOutputSchema.parse(JSON.parse(json));

    const validStepIds = new Set(input.baseIr.steps.map((s) => s.step_id));
    const validTroubleIds = new Set(
      input.baseIr.troubleshooting?.map((t) => t.id) ?? [],
    );
    const validTermIds = new Set(input.baseIr.glossary?.map((g) => g.id) ?? []);

    const sourceRefBase = {
      source_file: context.sourceFile,
      extractor_type: this.type,
    } as const;

    const intents: ChangeIntent[] = parsed.intents.map((raw): ChangeIntent => {
      const target = sanitizeTextTarget(
        raw.type,
        raw.target,
        validStepIds,
        validTroubleIds,
        validTermIds,
      );
      return {
        intent_id: `intent-${nanoid(10)}`,
        type: raw.type,
        target,
        description: raw.description,
        ...(raw.before !== undefined ? { before: raw.before } : {}),
        ...(raw.after !== undefined ? { after: raw.after } : {}),
        ...(raw.diff !== undefined ? { diff: raw.diff } : {}),
        ...(raw.rationale !== undefined ? { rationale: raw.rationale } : {}),
        ...(raw.impact ? { impact: raw.impact } : {}),
        source_refs: raw.source_refs.map((r) => ({
          ...attachSourceRefBase(r, sourceRefBase),
          extractor_type: 'text' as const,
        })),
        // text 型抽取上限：confidence 不超過 0.85
        confidence: Math.min(raw.confidence, 0.85),
        auto_apply: raw.auto_apply === true && raw.confidence >= 0.85,
        status: 'pending',
      };
    });

    return this.makeOutput(context, {
      textType: parsed.textType,
      intents,
    });
  }
}

function sanitizeTextTarget(
  type: ChangeIntent['type'],
  target: ChangeIntent['target'],
  validStepIds: Set<string>,
  validTroubleIds: Set<string>,
  validTermIds: Set<string>,
): ChangeIntent['target'] {
  const out: ChangeIntent['target'] = {};
  if (target.step_id && validStepIds.has(target.step_id)) {
    out.step_id = target.step_id;
  }
  if (target.trouble_id && validTroubleIds.has(target.trouble_id)) {
    out.trouble_id = target.trouble_id;
  }
  if (target.term_id && validTermIds.has(target.term_id)) {
    out.term_id = target.term_id;
  }
  if (target.section_id) out.section_id = target.section_id;
  if (target.field) out.field = target.field;

  if (
    (type === 'modify_step' ||
      type === 'remove_step' ||
      type === 'reorder_step' ||
      type === 'add_tip' ||
      type === 'add_warning' ||
      type === 'replace_screenshot') &&
    !out.step_id &&
    target.step_id
  ) {
    out.field = `unknown_step_id:${target.step_id}`;
  }
  return out;
}
