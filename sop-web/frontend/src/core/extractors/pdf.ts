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
import systemPrompt from '@/core/prompts/pdf-system.md?raw';
import userTemplate from '@/core/prompts/pdf-user.md?raw';

// ============================================================
// Public API
// ============================================================

export interface PdfInput {
  /** PDF 已解析的純文字（caller 要先用 pdf.js 解析過） */
  text?: string;
  /** 或直接給 buffer，由 extractor 自己用 pdf.js 解析 */
  buffer?: ArrayBuffer;
  /** 既有 IR — 給 prompt 上下文 */
  baseIr: IR;
}

export interface TermMapping {
  vendorTerm: string;
  internalTerm: string;
}

export interface PdfPayload {
  intents: ChangeIntent[];
  termMappings: TermMapping[];
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

const RawTermMappingSchema = z.object({
  vendorTerm: z.string(),
  internalTerm: z.string(),
});

const RawOutputSchema = z.object({
  termMappings: z.array(RawTermMappingSchema).default([]),
  intents: z.array(RawIntentSchema).default([]),
});

// ============================================================
// Implementation
// ============================================================

export class PdfExtractor extends BaseExtractor<PdfInput, PdfPayload> {
  readonly type = 'pdf' as const;

  async extract(
    input: PdfInput,
    context: ExtractorContext,
  ): Promise<ExtractorOutput<PdfPayload>> {
    const content = input.text ?? (input.buffer ? await readPdfAsText(input.buffer) : '');
    if (content.trim().length === 0) {
      throw new Error(
        `${context.sourceFile} 解析後內容為空（可能是掃描檔或受保護 PDF）`,
      );
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
      max_tokens: 6144,
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
      const target = sanitizePdfTarget(
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
          extractor_type: 'pdf' as const,
        })),
        confidence: Math.min(raw.confidence, 0.9),
        auto_apply: raw.auto_apply ?? false,
        status: 'pending',
      };
    });

    // 去重術語對映：以 vendorTerm 為 key
    const termMap = new Map<string, TermMapping>();
    for (const m of parsed.termMappings) {
      const key = m.vendorTerm.trim().toLowerCase();
      if (!key) continue;
      if (!termMap.has(key)) {
        termMap.set(key, {
          vendorTerm: m.vendorTerm.trim(),
          internalTerm: m.internalTerm.trim(),
        });
      }
    }

    return this.makeOutput(context, {
      intents,
      termMappings: Array.from(termMap.values()),
    });
  }
}

function sanitizePdfTarget(
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

// Lazy pdf.js import — 與 DocumentExtractor 對齊（不重複實作）
async function readPdfAsText(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
      .default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    pageTexts.push(`[第 ${i} 頁]\n${pageText}`);
  }
  return pageTexts.join('\n\n');
}
