import { describe, expect, it } from 'vitest';
import { applyChangeIntents } from './apply';
import { IrSchema, type ChangeIntent, type IR } from '@/core/ir/schemas';

const baseIr: IR = {
  schema_version: '1.0.0',
  version: '1.2.0',
  meta: {
    sop_id: 'test-sop',
    title: '原標題',
    target_audience: '工程師',
    authors: ['jin@x'],
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
    {
      step_id: 'step-BBB',
      section_id: 'section-main',
      order: 1,
      title: '步驟二',
      actions: [{ text: '原操作 2' }],
      source_refs: [
        { source_file: 'i.txt', extractor_type: 'transcript', excerpt: 'b' },
      ],
    },
  ],
  troubleshooting: [
    {
      id: 'trouble-XYZ',
      symptom: '原症狀',
      source_refs: [
        { source_file: 'i.txt', extractor_type: 'transcript', excerpt: 's' },
      ],
    },
  ],
  glossary: [
    { id: 'term-IAM', term: 'IAM', definition: '舊定義' },
  ],
};

const intent = (overrides: Partial<ChangeIntent>): ChangeIntent => ({
  intent_id: `intent-${Math.random().toString(36).slice(2, 12)}`,
  type: 'add_tip',
  target: {},
  description: 'desc',
  source_refs: [
    { source_file: 'c.md', extractor_type: 'change_list', excerpt: 'cite' },
  ],
  confidence: 0.9,
  status: 'pending',
  ...overrides,
});

const opts = (newVersion = '1.3.0') => ({
  newVersion,
  updatedAt: '2026-05-09T10:00:00+08:00',
});

describe('applyChangeIntents', () => {
  it('preserves existing step_ids across apply', () => {
    const r = applyChangeIntents(
      baseIr,
      [
        intent({
          type: 'modify_step',
          target: { step_id: 'step-AAA' },
          after: '新操作',
        }),
      ],
      opts(),
    );
    expect(r.applied).toHaveLength(1);
    expect(r.skipped).toHaveLength(0);
    expect(r.ir.steps[0]!.step_id).toBe('step-AAA');
    expect(r.ir.steps[0]!.actions[0]!.text).toBe('新操作');
    // 原 source_refs 仍在 + 新 ref 加入
    expect(r.ir.steps[0]!.source_refs.length).toBe(2);
  });

  it('does not mutate the input ir', () => {
    const original = structuredClone(baseIr);
    applyChangeIntents(
      baseIr,
      [
        intent({
          type: 'modify_step',
          target: { step_id: 'step-AAA' },
          after: '改了',
        }),
      ],
      opts(),
    );
    expect(baseIr).toEqual(original);
  });

  it('add_step appends a new step with a fresh nanoid step_id', () => {
    const r = applyChangeIntents(
      baseIr,
      [
        intent({
          type: 'add_step',
          target: { section_id: 'section-main' },
          description: '新增確認 region',
          after: '在 EC2 console 確認 region 為 ap-northeast-1',
        }),
      ],
      opts(),
    );
    expect(r.applied).toHaveLength(1);
    expect(r.ir.steps).toHaveLength(3);
    const newStep = r.ir.steps[2]!;
    expect(newStep.step_id).toMatch(/^step-[a-zA-Z0-9_-]+$/);
    // 既有 step_id 沒被換
    expect(r.ir.steps[0]!.step_id).toBe('step-AAA');
    expect(r.ir.steps[1]!.step_id).toBe('step-BBB');
  });

  it('remove_step deletes the targeted step', () => {
    const r = applyChangeIntents(
      baseIr,
      [intent({ type: 'remove_step', target: { step_id: 'step-AAA' } })],
      opts(),
    );
    expect(r.applied).toHaveLength(1);
    expect(r.ir.steps.find((s) => s.step_id === 'step-AAA')).toBeUndefined();
    expect(r.ir.steps).toHaveLength(1);
  });

  it('skips intents whose target_id is not found', () => {
    const r = applyChangeIntents(
      baseIr,
      [
        intent({
          type: 'modify_step',
          target: { step_id: 'step-DOES-NOT-EXIST' },
          after: 'x',
        }),
      ],
      opts(),
    );
    expect(r.applied).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.reason).toMatch(/找不到/);
  });

  it('add_tip appends to step.tips', () => {
    const r = applyChangeIntents(
      baseIr,
      [
        intent({
          type: 'add_tip',
          target: { step_id: 'step-AAA' },
          after: '可以用 CLI',
        }),
      ],
      opts(),
    );
    expect(r.ir.steps[0]!.tips).toEqual(['可以用 CLI']);
  });

  it('modify_meta updates SOP title', () => {
    const r = applyChangeIntents(
      baseIr,
      [
        intent({
          type: 'modify_meta',
          target: { field: 'title' },
          after: '新標題',
        }),
      ],
      opts(),
    );
    expect(r.ir.meta.title).toBe('新標題');
  });

  it('add_glossary refuses duplicate term names', () => {
    const r = applyChangeIntents(
      baseIr,
      [
        intent({
          type: 'add_glossary',
          description: 'IAM',
          after: '新的 IAM 定義',
        }),
      ],
      opts(),
    );
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0]!.reason).toMatch(/已存在/);
  });

  it('produces a result IR that still passes the canonical IrSchema', () => {
    const r = applyChangeIntents(
      baseIr,
      [
        intent({
          type: 'modify_step',
          target: { step_id: 'step-AAA' },
          after: '新操作',
        }),
        intent({
          type: 'add_step',
          target: { section_id: 'section-main' },
          description: '新增第三步',
          after: '操作三',
        }),
        intent({
          type: 'remove_step',
          target: { step_id: 'step-BBB' },
        }),
      ],
      opts('1.3.1'),
    );
    expect(IrSchema.safeParse(r.ir).success).toBe(true);
    expect(r.ir.version).toBe('1.3.1');
    expect(r.ir.meta.updated_at).toBe('2026-05-09T10:00:00+08:00');
  });

  it('updates new version + updatedAt regardless of what intents touched', () => {
    const r = applyChangeIntents(
      baseIr,
      [
        intent({
          type: 'add_tip',
          target: { step_id: 'step-AAA' },
          after: 'tip',
        }),
      ],
      opts('1.2.1'),
    );
    expect(r.ir.version).toBe('1.2.1');
    expect(r.ir.meta.updated_at).toBe('2026-05-09T10:00:00+08:00');
  });
});
