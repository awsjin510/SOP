import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/claude', () => ({
  callClaude: vi.fn(),
  DEFAULT_MODEL: 'claude-opus-4-7',
  FAST_MODEL: 'claude-haiku-4-5-20251001',
}));

import { PdfExtractor } from './pdf';
import { callClaude } from '@/services/claude';
import type { IR } from '@/core/ir/schemas';

const mockedCallClaude = callClaude as unknown as ReturnType<typeof vi.fn>;

const baseIr: IR = {
  schema_version: '1.0.0',
  version: '1.0.0',
  meta: {
    sop_id: 'test',
    title: '測試',
    target_audience: '工程師',
    authors: [],
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-01T10:00:00+08:00',
  },
  sections: [{ id: 'section-main', title: '主', order: 0 }],
  steps: [
    {
      step_id: 'step-AAA',
      section_id: 'section-main',
      order: 0,
      title: '步驟一',
      actions: [{ text: '原操作' }],
      source_refs: [
        { source_file: 'i.txt', extractor_type: 'transcript', excerpt: 'a' },
      ],
    },
  ],
  glossary: [{ id: 'term-SG', term: 'Security Group', definition: '舊定義' }],
};

const fenced = (obj: unknown): string =>
  '```json\n' + JSON.stringify(obj) + '\n```';
const claudeResp = (text: string) => ({
  text,
  model: 'claude-opus-4-7',
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5 },
  cost_usd: 0,
});

describe('PdfExtractor', () => {
  beforeEach(() => mockedCallClaude.mockReset());

  it('returns intents and termMappings, deduplicating vendorTerm', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          termMappings: [
            { vendorTerm: 'Network Security Profile', internalTerm: 'Security Group' },
            { vendorTerm: 'Network Security Profile', internalTerm: 'Security Group' },
          ],
          intents: [
            {
              type: 'modify_step',
              target: { step_id: 'step-AAA' },
              description: 'API endpoint 升版',
              after: 'v2 endpoint',
              source_refs: [
                { location: '第 1 頁', excerpt: 'v1 deprecated', confidence: 0.9 },
              ],
              confidence: 0.9,
              auto_apply: false,
            },
          ],
        }),
      ),
    );

    const extractor = new PdfExtractor();
    const out = await extractor.extract(
      { text: 'PDF text content', baseIr },
      { sourceFile: 'release.pdf' },
    );

    expect(out.payload.termMappings).toHaveLength(1);
    expect(out.payload.termMappings[0]!.vendorTerm).toBe('Network Security Profile');
    expect(out.payload.intents[0]!.source_refs[0]!.extractor_type).toBe('pdf');
    expect(out.payload.intents[0]!.source_refs[0]!.source_file).toBe('release.pdf');
    expect(out.payload.intents[0]!.confidence).toBeLessThanOrEqual(0.9);
  });

  it('rejects empty content', async () => {
    const extractor = new PdfExtractor();
    await expect(
      extractor.extract({ text: '', baseIr }, { sourceFile: 'empty.pdf' }),
    ).rejects.toThrow();
  });

  it('strips hallucinated step_id', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          termMappings: [],
          intents: [
            {
              type: 'modify_step',
              target: { step_id: 'step-NOPE' },
              description: '',
              after: 'x',
              source_refs: [{ excerpt: 'x', confidence: 0.6 }],
              confidence: 0.6,
            },
          ],
        }),
      ),
    );
    const extractor = new PdfExtractor();
    const out = await extractor.extract(
      { text: 'pdf', baseIr },
      { sourceFile: 'x.pdf' },
    );
    expect(out.payload.intents[0]!.target.step_id).toBeUndefined();
    expect(out.payload.intents[0]!.target.field).toContain('step-NOPE');
  });
});
