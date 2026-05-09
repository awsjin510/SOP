import { z } from 'zod';
import { nanoid } from 'nanoid';
import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import type {
  Section,
  Step,
  TroubleshootingItem,
  GlossaryTerm,
  SourceRef,
} from '@/core/ir/schemas';
import { ActionSchema } from '@/core/ir/schemas';
// Vite 的 ?raw import：把 markdown 內容當字串引入，不在 .ts 裡塞 prompt
import systemPrompt from '@/core/prompts/transcript-system.md?raw';
import userTemplate from '@/core/prompts/transcript-user.md?raw';

// ============================================================
// Public API
// ============================================================

export interface TranscriptInput {
  /** 訪談逐字稿純文字 */
  text: string;
  /** SOP 標題（讓 prompt 有上下文） */
  title: string;
  /** 適用對象（讓 prompt 有上下文） */
  targetAudience: string;
}

export interface TranscriptPayload {
  sections: Section[];
  steps: Step[];
  troubleshooting: TroubleshootingItem[];
  glossary: GlossaryTerm[];
}

// ============================================================
// LLM Output schema（無 ID 版本，TS 端補）
// ============================================================

const RawSourceRefSchema = z.object({
  location: z.string().optional(),
  excerpt: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const RawStepSchema = z.object({
  section_id: z.string(),
  order: z.number().int().min(0).optional(),
  title: z.string().max(200),
  purpose: z.string().optional(),
  preconditions: z.array(z.string()).optional(),
  actions: z.array(ActionSchema).default([]),
  expected_result: z.string().optional(),
  common_mistakes: z.array(z.string()).optional(),
  tips: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  estimated_duration_minutes: z.number().int().min(0).optional(),
  source_refs: z.array(RawSourceRefSchema).min(1),
  needs_human_input: z.boolean().optional(),
  human_input_reason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const RawTroubleshootingSchema = z.object({
  symptom: z.string(),
  cause: z.string().optional(),
  solution: z.string().optional(),
  related_step_titles: z.array(z.string()).optional(),
  severity: z.enum(['低', '中', '高', '嚴重']).optional(),
  source_refs: z.array(RawSourceRefSchema).min(1),
  confidence: z.number().min(0).max(1).optional(),
});

const RawSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int().min(0),
  description: z.string().optional(),
});

const RawGlossarySchema = z.object({
  term: z.string(),
  definition: z.string(),
  aliases: z.array(z.string()).optional(),
});

const RawTranscriptOutputSchema = z.object({
  sections: z.array(RawSectionSchema).default([]),
  steps: z.array(RawStepSchema).default([]),
  troubleshooting: z.array(RawTroubleshootingSchema).default([]),
  glossary: z.array(RawGlossarySchema).default([]),
});

type RawTranscriptOutput = z.infer<typeof RawTranscriptOutputSchema>;

// ============================================================
// Implementation
// ============================================================

export class TranscriptExtractor extends BaseExtractor<
  TranscriptInput,
  TranscriptPayload
> {
  readonly type = 'transcript' as const;

  async extract(
    input: TranscriptInput,
    context: ExtractorContext,
  ): Promise<ExtractorOutput<TranscriptPayload>> {
    const userPrompt = renderTemplate(userTemplate, {
      title: input.title,
      target_audience: input.targetAudience,
      source_file: context.sourceFile,
      transcript: input.text,
    });

    const response = await this.callClaude({
      system: systemPrompt,
      max_tokens: 8192,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = await this.parseAndValidate(response.text);

    const payload = this.shapeOutput(raw, context);

    return this.makeOutput(context, payload);
  }

  // ----- helpers -----

  private async parseAndValidate(rawText: string): Promise<RawTranscriptOutput> {
    const json = extractJsonBlock(rawText);
    if (!json) {
      throw new Error('Claude 回應中找不到 ```json fenced block');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new Error(
        `JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const result = RawTranscriptOutputSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        'Claude 輸出不符合 schema：' +
          result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return result.data;
  }

  private shapeOutput(
    raw: RawTranscriptOutput,
    context: ExtractorContext,
  ): TranscriptPayload {
    const sourceRefBase = {
      source_file: context.sourceFile,
      extractor_type: this.type,
    } as const;

    const sections: Section[] =
      raw.sections.length > 0
        ? raw.sections
        : [
            {
              id: 'section-main',
              title: '主要步驟',
              order: 0,
            },
          ];

    const steps: Step[] = raw.steps.map((s, idx) => ({
      step_id: `step-${nanoid(10)}`,
      section_id: s.section_id || sections[0]!.id,
      order: s.order ?? idx,
      title: s.title,
      ...(s.purpose ? { purpose: s.purpose } : {}),
      ...(s.preconditions ? { preconditions: s.preconditions } : {}),
      actions: s.actions ?? [],
      ...(s.expected_result ? { expected_result: s.expected_result } : {}),
      ...(s.common_mistakes ? { common_mistakes: s.common_mistakes } : {}),
      ...(s.tips ? { tips: s.tips } : {}),
      ...(s.warnings ? { warnings: s.warnings } : {}),
      ...(s.estimated_duration_minutes
        ? { estimated_duration_minutes: s.estimated_duration_minutes }
        : {}),
      source_refs: s.source_refs.map((r) => attachSourceRefBase(r, sourceRefBase)),
      ...(s.needs_human_input ? { needs_human_input: true } : {}),
      ...(s.human_input_reason ? { human_input_reason: s.human_input_reason } : {}),
      ...(s.confidence !== undefined ? { confidence: s.confidence } : {}),
    }));

    // 把 raw troubleshooting 的 related_step_titles 對映到剛產生的 step_id
    const titleToId = new Map(steps.map((s) => [s.title.trim(), s.step_id]));
    const troubleshooting: TroubleshootingItem[] = raw.troubleshooting.map((t) => ({
      id: `trouble-${nanoid(10)}`,
      symptom: t.symptom,
      ...(t.cause ? { cause: t.cause } : {}),
      ...(t.solution ? { solution: t.solution } : {}),
      ...(t.related_step_titles
        ? {
            related_step_ids: t.related_step_titles
              .map((title) => titleToId.get(title.trim()))
              .filter((x): x is string => Boolean(x)),
          }
        : {}),
      ...(t.severity ? { severity: t.severity } : {}),
      source_refs: t.source_refs.map((r) => attachSourceRefBase(r, sourceRefBase)),
      ...(t.confidence !== undefined ? { confidence: t.confidence } : {}),
    }));

    const glossary: GlossaryTerm[] = raw.glossary.map((g) => ({
      id: `term-${nanoid(10)}`,
      term: g.term,
      definition: g.definition,
      ...(g.aliases ? { aliases: g.aliases } : {}),
    }));

    return { sections, steps, troubleshooting, glossary };
  }
}

// ============================================================
// Pure helpers (exported for tests)
// ============================================================

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

/**
 * 從 Claude 回應中萃取 ```json fenced block 的內容。
 * 容錯：若沒有 fence，回傳整段（讓 caller 嘗試 parse）；找不到合理 JSON 則回傳 null。
 */
export function extractJsonBlock(text: string): string | null {
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) return fenceMatch[1]!.trim();

  // fallback：找第一個 { 到對應的最後一個 }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return null;
}

function attachSourceRefBase(
  raw: { location?: string; excerpt?: string; confidence?: number },
  base: Pick<SourceRef, 'source_file' | 'extractor_type'>,
): SourceRef {
  return {
    ...base,
    ...(raw.location !== undefined ? { location: raw.location } : {}),
    ...(raw.excerpt !== undefined ? { excerpt: raw.excerpt } : {}),
    ...(raw.confidence !== undefined ? { confidence: raw.confidence } : {}),
  };
}
