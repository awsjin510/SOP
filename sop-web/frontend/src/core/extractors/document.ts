import { z } from 'zod';
import { nanoid } from 'nanoid';
import { BaseExtractor } from '@/core/extractors/base';
import type { ExtractorContext, ExtractorOutput } from '@/core/types/extractor';
import type {
  Section,
  Step,
  TroubleshootingItem,
  GlossaryTerm,
} from '@/core/ir/schemas';
import { ActionSchema } from '@/core/ir/schemas';
import {
  renderTemplate,
  extractJsonBlock,
  attachSourceRefBase,
} from '@/core/extractors/helpers';
import systemPrompt from '@/core/prompts/document-system.md?raw';
import userTemplate from '@/core/prompts/document-user.md?raw';

export type DocumentFormat = 'docx' | 'pdf';

export interface DocumentInput {
  buffer: ArrayBuffer;
  format: DocumentFormat;
  title: string;
  targetAudience: string;
}

export interface DocumentPayload {
  sections: Section[];
  steps: Step[];
  troubleshooting: TroubleshootingItem[];
  glossary: GlossaryTerm[];
}

// 與 transcript 相同形狀但 extractor_type 不同
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

const RawDocumentOutputSchema = z.object({
  sections: z.array(RawSectionSchema).default([]),
  steps: z.array(RawStepSchema).default([]),
  troubleshooting: z.array(RawTroubleshootingSchema).default([]),
  glossary: z.array(RawGlossarySchema).default([]),
});

type RawDocumentOutput = z.infer<typeof RawDocumentOutputSchema>;

// ============================================================
// Implementation
// ============================================================

export class DocumentExtractor extends BaseExtractor<
  DocumentInput,
  DocumentPayload
> {
  readonly type = 'document' as const;

  async extract(
    input: DocumentInput,
    context: ExtractorContext,
  ): Promise<ExtractorOutput<DocumentPayload>> {
    const text =
      input.format === 'docx'
        ? await this.readDocxAsText(input.buffer)
        : await this.readPdfAsText(input.buffer);

    if (text.trim().length === 0) {
      throw new Error(
        `${context.sourceFile} 解析後內容為空（可能是掃描檔或受保護文件）`,
      );
    }

    const userPrompt = renderTemplate(userTemplate, {
      title: input.title,
      target_audience: input.targetAudience,
      source_file: context.sourceFile,
      format: input.format,
      content: text,
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

  // ----- file readers (lazy-loaded) -----

  private async readDocxAsText(buffer: ArrayBuffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  private async readPdfAsText(buffer: ArrayBuffer): Promise<string> {
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

  // ----- helpers -----

  private async parseAndValidate(rawText: string): Promise<RawDocumentOutput> {
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
    const result = RawDocumentOutputSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        'Claude 輸出不符合 schema：' +
          result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return result.data;
  }

  private shapeOutput(
    raw: RawDocumentOutput,
    context: ExtractorContext,
  ): DocumentPayload {
    const sourceRefBase = {
      source_file: context.sourceFile,
      extractor_type: this.type,
    } as const;

    const sections: Section[] =
      raw.sections.length > 0
        ? raw.sections
        : [{ id: 'section-doc-main', title: '文件主要內容', order: 0 }];

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

