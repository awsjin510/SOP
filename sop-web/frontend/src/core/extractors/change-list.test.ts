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

import { ChangeListExtractor } from './change-list';
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

describe('ChangeListExtractor', () => {
  beforeEach(() => mockedCallClaude.mockReset());

  it('attaches change_list source_refs and a TS-side intent_id', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          intents: [
            {
              type: 'modify_step',
              target: { step_id: 'step-AAA' },
              description: '修改步驟一',
              after: '新操作',
              source_refs: [
                { location: '第 1 段', excerpt: 'modify step', confidence: 0.9 },
              ],
              confidence: 0.9,
              auto_apply: true,
            },
          ],
        }),
      ),
    );

    const extractor = new ChangeListExtractor();
    const out = await extractor.extract(
      { format: 'markdown', text: '修改清單', baseIr },
      { sourceFile: 'changes.md' },
    );

    const intent = out.payload.intents[0]!;
    expect(intent.intent_id).toMatch(/^intent-[a-zA-Z0-9_-]+$/);
    expect(intent.target.step_id).toBe('step-AAA');
    expect(intent.source_refs[0]!.source_file).toBe('changes.md');
    expect(intent.source_refs[0]!.extractor_type).toBe('change_list');
    expect(intent.status).toBe('pending');
  });

  it('strips hallucinated step_id (keeps the unknown trace in target.field)', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          intents: [
            {
              type: 'modify_step',
              target: { step_id: 'step-NOT-EXIST' },
              description: '指錯了',
              after: 'x',
              source_refs: [
                { location: '第 1 段', excerpt: 'x', confidence: 0.7 },
              ],
              confidence: 0.7,
            },
          ],
        }),
      ),
    );

    const extractor = new ChangeListExtractor();
    const out = await extractor.extract(
      { format: 'markdown', text: 'x', baseIr },
      { sourceFile: 'changes.md' },
    );

    const intent = out.payload.intents[0]!;
    expect(intent.target.step_id).toBeUndefined();
    expect(intent.target.field).toContain('step-NOT-EXIST');
  });

  it('throws on schema-violating raw output', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          intents: [
            {
              type: 'modify_step',
              target: { step_id: 'step-AAA' },
              description: 'no source_refs',
              source_refs: [], // 違規
              confidence: 0.9,
            },
          ],
        }),
      ),
    );

    const extractor = new ChangeListExtractor();
    await expect(
      extractor.extract(
        { format: 'markdown', text: 'x', baseIr },
        { sourceFile: 'changes.md' },
      ),
    ).rejects.toThrow();
  });
});
