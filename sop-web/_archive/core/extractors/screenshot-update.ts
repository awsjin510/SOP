import { z } from 'zod';
import { nanoid } from 'nanoid';
import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import type { ChangeIntent, IR } from '@/core/ir/schemas';
import { ChangeIntentTypeSchema } from '@/core/ir/schemas';
import { extractJsonBlock, attachSourceRefBase } from '@/core/extractors/helpers';
import {
  blobToBase64,
  type ScreenshotMime,
} from '@/core/extractors/screenshot';
import systemPrompt from '@/core/prompts/screenshot-update-system.md?raw';

// ============================================================
// Public API
// ============================================================

export interface UpdateScreenshotInput {
  blob: Blob;
  mimeType: ScreenshotMime;
  baseIr: IR;
}

export type VisualSeverity = 'cosmetic' | 'minor' | 'major';

export interface VisualDiff {
  severity: VisualSeverity;
  changed_regions: string[];
  summary: string;
}

export interface UpdateScreenshotPayload {
  /** 配對到的 step_id；找不到對應步驟為 null */
  matched_step_id: string | null;
  visual_diff: VisualDiff;
  intents: ChangeIntent[];
}

// ============================================================
// LLM raw schema
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

const RawVisualDiffSchema = z.object({
  severity: z.enum(['cosmetic', 'minor', 'major']).default('minor'),
  changed_regions: z.array(z.string()).default([]),
  summary: z.string().default(''),
});

const RawOutputSchema = z.object({
  matched_step_id: z.string().nullable().default(null),
  visual_diff: RawVisualDiffSchema.default({
    severity: 'minor',
    changed_regions: [],
    summary: '',
  }),
  intents: z.array(RawIntentSchema).default([]),
});

// ============================================================
// Implementation
// ============================================================

export class UpdateScreenshotExtractor extends BaseExtractor<
  UpdateScreenshotInput,
  UpdateScreenshotPayload
> {
  readonly type = 'screenshot' as const;

  async extract(
    input: UpdateScreenshotInput,
    context: ExtractorContext,
  ): Promise<ExtractorOutput<UpdateScreenshotPayload>> {
    const base64 = await blobToBase64(input.blob);

    // Build a step summary for the model
    const stepSummary = input.baseIr.steps.map((s) => ({
      step_id: s.step_id,
      title: s.title,
      purpose: s.purpose ?? '',
      has_screenshot: (s.actions ?? []).some(
        (a) => a.screenshot_refs && a.screenshot_refs.length > 0,
      ),
    }));

    const userText = [
      '## 既有 SOP 步驟摘要',
      '```json',
      JSON.stringify(stepSummary, null, 2),
      '```',
      '',
      `## SOP 標題：${input.baseIr.meta.title}`,
      `## 適用對象：${input.baseIr.meta.target_audience}`,
      '',
      `## 待分析的新截圖：${context.sourceFile}`,
      '',
      '請依系統指示產出 JSON。',
    ].join('\n');

    const response = await this.callClaude({
      system: systemPrompt,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: input.mimeType,
                data: base64,
              },
            },
            { type: 'text', text: userText },
          ],
        },
      ],
    });

    const json = extractJsonBlock(response.text);
    if (!json) {
      throw new Error('Claude Vision 回應中找不到 JSON block');
    }
    const parsed = RawOutputSchema.parse(JSON.parse(json));

    const validStepIds = new Set(input.baseIr.steps.map((s) => s.step_id));
    const matched =
      parsed.matched_step_id && validStepIds.has(parsed.matched_step_id)
        ? parsed.matched_step_id
        : null;

    const sourceRefBase = {
      source_file: context.sourceFile,
      extractor_type: this.type,
    } as const;

    const intents: ChangeIntent[] = parsed.intents.flatMap((raw): ChangeIntent[] => {
      // 強制把 target.step_id 限定在 matched 或 validStepIds
      const target: ChangeIntent['target'] = {};
      if (raw.target.step_id && validStepIds.has(raw.target.step_id)) {
        target.step_id = raw.target.step_id;
      } else if (matched) {
        target.step_id = matched;
      }
      if (raw.target.section_id) target.section_id = raw.target.section_id;
      if (raw.target.field) target.field = raw.target.field;

      // 對於 replace_screenshot / modify_step / add_tip 等需要 step_id 的類型，沒有就丟棄
      const needsStep =
        raw.type === 'modify_step' ||
        raw.type === 'replace_screenshot' ||
        raw.type === 'add_tip' ||
        raw.type === 'add_warning' ||
        raw.type === 'remove_step' ||
        raw.type === 'reorder_step';
      if (needsStep && !target.step_id) {
        return [];
      }

      const intent: ChangeIntent = {
        intent_id: `intent-${nanoid(10)}`,
        type: raw.type,
        target,
        description: raw.description,
        ...(raw.before !== undefined ? { before: raw.before } : {}),
        ...(raw.after !== undefined ? { after: raw.after } : {}),
        ...(raw.diff !== undefined ? { diff: raw.diff } : {}),
        ...(raw.rationale !== undefined ? { rationale: raw.rationale } : {}),
        impact: {
          ...(raw.impact ?? {}),
          needs_screenshot_update: true,
        },
        source_refs: raw.source_refs.map((r) => ({
          ...attachSourceRefBase(r, sourceRefBase),
          extractor_type: 'screenshot' as const,
        })),
        confidence: Math.min(raw.confidence, 0.85),
        auto_apply: raw.auto_apply ?? false,
        status: 'pending',
      };
      return [intent];
    });

    return this.makeOutput(context, {
      matched_step_id: matched,
      visual_diff: parsed.visual_diff,
      intents,
    });
  }
}
