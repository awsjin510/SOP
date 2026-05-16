import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));
vi.mock('@/services/claude', () => ({
  callClaude: vi.fn(),
  DEFAULT_MODEL: 'claude-opus-4-7',
  FAST_MODEL: 'claude-haiku-4-5-20251001',
}));

import { TextExtractor } from './text';
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

describe('TextExtractor', () => {
  beforeEach(() => mockedCallClaude.mockReset());

  it('classifies textType and attaches text source_refs', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          textType: 'meeting_notes',
          intents: [
            {
              type: 'modify_step',
              target: { step_id: 'step-AAA' },
              description: '會議決議改用 IAM Role',
              after: '改用 IAM Role',
              source_refs: [
                { location: '第 2 段', excerpt: '決議：改用 IAM Role', confidence: 0.8 },
              ],
              confidence: 0.8,
            },
          ],
        }),
      ),
    );

    const extractor = new TextExtractor();
    const out = await extractor.extract(
      { text: '決議：改用 IAM Role', baseIr },
      { sourceFile: 'meeting.txt' },
    );

    expect(out.payload.textType).toBe('meeting_notes');
    expect(out.payload.intents).toHaveLength(1);
    const intent = out.payload.intents[0]!;
    expect(intent.intent_id).toMatch(/^intent-/);
    expect(intent.target.step_id).toBe('step-AAA');
    expect(intent.source_refs[0]!.extractor_type).toBe('text');
    expect(intent.source_refs[0]!.source_file).toBe('meeting.txt');
    expect(intent.status).toBe('pending');
  });

  it('caps confidence at 0.85 even when LLM gives higher', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          textType: 'other',
          intents: [
            {
              type: 'add_tip',
              target: { step_id: 'step-AAA' },
              description: '加 tip',
              after: '注意 region',
              source_refs: [{ excerpt: 'x', confidence: 0.95 }],
              confidence: 0.95,
              auto_apply: true,
            },
          ],
        }),
      ),
    );
    const extractor = new TextExtractor();
    const out = await extractor.extract(
      { text: '注意 region', baseIr },
      { sourceFile: 'note.txt' },
    );
    expect(out.payload.intents[0]!.confidence).toBeLessThanOrEqual(0.85);
  });

  it('strips hallucinated step_id', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          textType: 'other',
          intents: [
            {
              type: 'modify_step',
              target: { step_id: 'step-DOES-NOT-EXIST' },
              description: '指錯了',
              after: 'x',
              source_refs: [{ excerpt: 'x', confidence: 0.6 }],
              confidence: 0.6,
            },
          ],
        }),
      ),
    );
    const extractor = new TextExtractor();
    const out = await extractor.extract(
      { text: 'x', baseIr },
      { sourceFile: 'x.txt' },
    );
    expect(out.payload.intents[0]!.target.step_id).toBeUndefined();
    expect(out.payload.intents[0]!.target.field).toContain(
      'step-DOES-NOT-EXIST',
    );
  });

  it('rejects empty content', async () => {
    const extractor = new TextExtractor();
    await expect(
      extractor.extract({ text: '   ', baseIr }, { sourceFile: 'empty.txt' }),
    ).rejects.toThrow();
  });
});
