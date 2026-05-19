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
import systemPrompt from '@/core/prompts/change-list-system.md?raw';
import userTemplate from '@/core/prompts/change-list-user.md?raw';

export type ChangeListFormat = 'docx' | 'markdown';

export interface ChangeListInput {
  /** docx → ArrayBuffer；markdown → 用 text 欄位 */
  buffer?: ArrayBuffer;
  text?: string;
  format: ChangeListFormat;
  /** 既有 IR，給 prompt 帶上下文 */
  baseIr: IR;
}

export interface ChangeListPayload {
  intents: ChangeIntent[];
}

// LLM raw output（無 intent_id，TS 端補；source_refs 沒 source_file，TS 端補）
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
  intents: z.array(RawIntentSchema).default([]),
});

export class ChangeListExtractor extends BaseExtractor<
  ChangeListInput,
  ChangeListPayload
> {
  readonly type = 'change_list' as const;

  async extract(
    input: ChangeListInput,
    context: ExtractorContext,
  ): Promise<ExtractorOutput<ChangeListPayload>> {
    const content =
      input.format === 'docx' && input.buffer
        ? await readDocxAsText(input.buffer)
        : (input.text ?? '');

    if (content.trim().length === 0) {
      throw new Error(
        `${context.sourceFile} 解析後內容為空（可能是掃描檔或受保護文件）`,
      );
    }

    const userPrompt = renderTemplate(userTemplate, {
      title: input.baseIr.meta.title,
      version: input.baseIr.version,
      target_audience: input.baseIr.meta.target_audience,
      source_file: context.sourceFile,
      format: input.format,
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
      max_tokens: 8192,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const json = extractJsonBlock(response.text);
    if (!json) {
      throw new Error('Claude 回應中找不到 JSON block');
    }
    const parsed = RawOutputSchema.parse(JSON.parse(json));

    const validStepIds = new Set(input.baseIr.steps.map((s) => s.step_id));
    const validTroubleIds = new Set(input.baseIr.troubleshooting?.map((t) => t.id) ?? []);
    const validTermIds = new Set(input.baseIr.glossary?.map((g) => g.id) ?? []);

    const sourceRefBase = {
      source_file: context.sourceFile,
      extractor_type: this.type,
    } as const;

    const intents: ChangeIntent[] = parsed.intents.map((raw): ChangeIntent => {
      // ID 驗證：對 modify/remove/add_tip 等需要既有目標的類型，target ID 必須真實存在
      const target = sanitizeTarget(
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
          extractor_type: 'change_list',
        })),
        confidence: raw.confidence,
        ...(raw.auto_apply !== undefined ? { auto_apply: raw.auto_apply } : {}),
        status: 'pending',
      };
    });

    return this.makeOutput(context, { intents });
  }
}

/**
 * 對映目標 ID：去掉幻覺。對需要既有目標的 intent type 嚴格驗證。
 */
function sanitizeTarget(
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

  // 需要 step_id 的 intent type，但 ID 對映不上 → 留空，merger 會降級為 needs_review
  if (
    (type === 'modify_step' ||
      type === 'remove_step' ||
      type === 'reorder_step' ||
      type === 'add_tip' ||
      type === 'add_warning' ||
      type === 'replace_screenshot') &&
    !out.step_id &&
    target.step_id // model 試圖指 ID 但對不上
  ) {
    // 標出來但不阻擋抽取
    out.field = `unknown_step_id:${target.step_id}`;
  }
  return out;
}

// Lazy mammoth import — 與 DocumentExtractor 共用
async function readDocxAsText(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}
