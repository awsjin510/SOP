import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import { runEnhancementLoop, applyEnhancementActions } from './loop';
import { callClaude } from '@/services/claude';
import type { IR } from '@/core/ir/schemas';

const mockedCallClaude = callClaude as unknown as ReturnType<typeof vi.fn>;

const baseIr: IR = {
  schema_version: '1.0.0',
  version: '1.0.0',
  meta: {
    sop_id: 'test-sop',
    title: '測試',
    target_audience: '工程師',
    authors: [],
    created_at: '2026-05-09T10:00:00+08:00',
    updated_at: '2026-05-09T10:00:00+08:00',
  },
  sections: [{ id: 'section-main', title: '主', order: 0 }],
  steps: [
    {
      step_id: 'step-AAA',
      section_id: 'section-main',
      order: 0,
      title: '步驟一',
      actions: [{ text: '操作' }],
      source_refs: [
        { source_file: 's.txt', extractor_type: 'transcript', excerpt: '...' },
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

describe('applyEnhancementActions', () => {
  it('applies an approved add_tip and merges source_refs into the step', () => {
    const ir: IR = JSON.parse(JSON.stringify(baseIr));
    const applied = applyEnhancementActions(
      ir,
      [
        {
          id: 'act-1',
          issue_id: 'issue-1',
          type: 'add_tip',
          target_step_id: 'step-AAA',
          target_term_id: null,
          payload: { text: '可用 CLI 加速' },
          source_refs: [
            {
              source_file: 's.txt',
              extractor_type: 'transcript',
              excerpt: '用 CLI 比較快',
              confidence: 0.9,
            },
          ],
        },
      ],
      [{ action_id: 'act-1', decision: 'approve' }],
    );
    expect(applied).toEqual(['act-1']);
    expect(ir.steps[0]!.tips).toEqual(['可用 CLI 加速']);
    expect(ir.steps[0]!.source_refs.length).toBeGreaterThan(1);
  });

  it('skips rejected actions', () => {
    const ir: IR = JSON.parse(JSON.stringify(baseIr));
    const applied = applyEnhancementActions(
      ir,
      [
        {
          id: 'act-2',
          issue_id: 'i',
          type: 'add_tip',
          target_step_id: 'step-AAA',
          target_term_id: null,
          payload: { text: 'rejected tip' },
          source_refs: [],
        },
      ],
      [{ action_id: 'act-2', decision: 'reject', reason: 'fabricated' }],
    );
    expect(applied).toEqual([]);
    expect(ir.steps[0]!.tips).toBeUndefined();
  });

  it('does not overwrite existing purpose with set_purpose', () => {
    const ir: IR = JSON.parse(JSON.stringify(baseIr));
    ir.steps[0]!.purpose = 'existing';
    applyEnhancementActions(
      ir,
      [
        {
          id: 'act-3',
          issue_id: 'i',
          type: 'set_purpose',
          target_step_id: 'step-AAA',
          target_term_id: null,
          payload: { text: 'new purpose' },
          source_refs: [
            {
              source_file: 's.txt',
              extractor_type: 'transcript',
              excerpt: 'x',
            },
          ],
        },
      ],
      [{ action_id: 'act-3', decision: 'approve' }],
    );
    expect(ir.steps[0]!.purpose).toBe('existing');
  });

  it('applies modify decision with reviewer payload override', () => {
    const ir: IR = JSON.parse(JSON.stringify(baseIr));
    applyEnhancementActions(
      ir,
      [
        {
          id: 'act-4',
          issue_id: 'i',
          type: 'add_tip',
          target_step_id: 'step-AAA',
          target_term_id: null,
          payload: { text: 'original tip' },
          source_refs: [
            {
              source_file: 's.txt',
              extractor_type: 'transcript',
              excerpt: 'x',
            },
          ],
        },
      ],
      [
        {
          action_id: 'act-4',
          decision: 'modify',
          modification: { payload: { text: 'edited tip' } },
        },
      ],
    );
    expect(ir.steps[0]!.tips).toEqual(['edited tip']);
  });

  it('marks needs_human_input with reason', () => {
    const ir: IR = JSON.parse(JSON.stringify(baseIr));
    applyEnhancementActions(
      ir,
      [
        {
          id: 'act-5',
          issue_id: 'i',
          type: 'mark_needs_human_input',
          target_step_id: 'step-AAA',
          target_term_id: null,
          payload: { reason: '原素材未提及 X' },
          source_refs: [],
        },
      ],
      [{ action_id: 'act-5', decision: 'approve' }],
    );
    expect(ir.steps[0]!.needs_human_input).toBe(true);
    expect(ir.steps[0]!.human_input_reason).toBe('原素材未提及 X');
  });

  it('adds glossary terms (idempotent on identical term)', () => {
    const ir: IR = JSON.parse(JSON.stringify(baseIr));
    applyEnhancementActions(
      ir,
      [
        {
          id: 'act-6',
          issue_id: 'i',
          type: 'add_glossary_term',
          target_step_id: null,
          target_term_id: null,
          payload: { term: 'IAM', definition: '身分管理' },
          source_refs: [
            {
              source_file: 's.txt',
              extractor_type: 'transcript',
              excerpt: 'IAM = ...',
            },
          ],
        },
        {
          id: 'act-7',
          issue_id: 'i',
          type: 'add_glossary_term',
          target_step_id: null,
          target_term_id: null,
          payload: { term: 'IAM', definition: '同樣是身分管理' },
          source_refs: [
            { source_file: 's.txt', extractor_type: 'transcript' },
          ],
        },
      ],
      [
        { action_id: 'act-6', decision: 'approve' },
        { action_id: 'act-7', decision: 'approve' },
      ],
    );
    expect(ir.glossary).toHaveLength(1);
    expect(ir.glossary![0]!.term).toBe('IAM');
  });
});

describe('runEnhancementLoop', () => {
  beforeEach(() => mockedCallClaude.mockReset());

  it('terminates immediately when newbie reports no issues', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(fenced({ issues: [] })),
    );
    const ir: IR = JSON.parse(JSON.stringify(baseIr));
    const result = await runEnhancementLoop(ir, [], { maxRounds: 3 });
    expect(result.appliedActionsCount).toBe(0);
    expect(result.rounds).toEqual([]);
    expect(result.apiCalls).toBe(1);
  });

  it('runs newbie + enhancer + reviewer and applies approved actions', async () => {
    mockedCallClaude
      .mockResolvedValueOnce(
        claudeResp(
          fenced({
            issues: [
              {
                id: 'issue-1',
                type: 'missing_purpose',
                target_step_id: 'step-AAA',
                target_term_id: null,
                description: '缺 purpose',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        claudeResp(
          fenced({
            actions: [
              {
                id: 'act-1',
                issue_id: 'issue-1',
                type: 'set_purpose',
                target_step_id: 'step-AAA',
                target_term_id: null,
                payload: { text: '為了 X' },
                source_refs: [
                  {
                    source_file: 's.txt',
                    extractor_type: 'transcript',
                    excerpt: '為了 X',
                  },
                ],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        claudeResp(
          fenced({
            decisions: [
              { action_id: 'act-1', decision: 'approve', reason: 'ok' },
            ],
          }),
        ),
      )
      // round 2 newbie 報無新 issue
      .mockResolvedValueOnce(claudeResp(fenced({ issues: [] })));

    const ir: IR = JSON.parse(JSON.stringify(baseIr));
    const result = await runEnhancementLoop(
      ir,
      [
        {
          source_file: 's.txt',
          extractor_type: 'transcript',
          text: '為了 X 才這樣做',
        },
      ],
      { maxRounds: 3 },
    );
    expect(ir.steps[0]!.purpose).toBe('為了 X');
    expect(result.appliedActionsCount).toBe(1);
    expect(result.rounds).toHaveLength(1);
    expect(result.apiCalls).toBe(4);
  });

  it('respects maxRounds', async () => {
    // 每一輪都回報 issue + enhancer 給空 actions（=> 立刻 break）
    for (let i = 0; i < 6; i++) {
      mockedCallClaude.mockResolvedValueOnce(
        claudeResp(
          fenced({
            issues: [
              {
                id: 'i-' + i,
                type: 'missing_purpose',
                target_step_id: 'step-AAA',
                target_term_id: null,
                description: 'x',
              },
            ],
          }),
        ),
      );
      mockedCallClaude.mockResolvedValueOnce(
        claudeResp(fenced({ actions: [] })),
      );
    }
    const ir: IR = JSON.parse(JSON.stringify(baseIr));
    const result = await runEnhancementLoop(ir, [], { maxRounds: 3 });
    // enhancer 給空就 break，所以 1 輪 newbie + 1 輪 enhancer = 2 calls
    expect(result.apiCalls).toBe(2);
    expect(result.rounds).toHaveLength(1);
  });
});
