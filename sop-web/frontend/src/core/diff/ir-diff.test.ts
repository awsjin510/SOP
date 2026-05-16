import { describe, expect, it } from 'vitest';
import { diffIr } from './ir-diff';
import type { IR } from '@/core/ir/schemas';

const baseIr: IR = {
  schema_version: '1.0.0',
  version: '1.0.0',
  meta: {
    sop_id: 'test',
    title: '原標題',
    target_audience: '工程師',
    difficulty: '中級',
    authors: ['a@x'],
    tags: ['ec2'],
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-01T10:00:00+08:00',
  },
  sections: [{ id: 'section-main', title: '主', order: 0 }],
  steps: [
    {
      step_id: 'step-A',
      section_id: 'section-main',
      order: 0,
      title: '步驟 A',
      actions: [{ text: '原 A 操作' }],
      source_refs: [{ source_file: 'i.txt', extractor_type: 'transcript' }],
    },
    {
      step_id: 'step-B',
      section_id: 'section-main',
      order: 1,
      title: '步驟 B',
      actions: [{ text: '原 B 操作' }],
      source_refs: [{ source_file: 'i.txt', extractor_type: 'transcript' }],
    },
  ],
  troubleshooting: [
    {
      id: 'trouble-1',
      symptom: '原症狀',
      source_refs: [{ source_file: 'i.txt', extractor_type: 'transcript' }],
    },
  ],
  glossary: [{ id: 'term-IAM', term: 'IAM', definition: '原定義' }],
};

describe('diffIr', () => {
  it('detects added / removed / changed steps', () => {
    const after: IR = {
      ...baseIr,
      version: '1.1.0',
      steps: [
        // step-A 改動
        {
          ...baseIr.steps[0]!,
          actions: [{ text: '新 A 操作' }],
        },
        // step-C 新增
        {
          step_id: 'step-C',
          section_id: 'section-main',
          order: 2,
          title: '步驟 C',
          actions: [{ text: 'C 操作' }],
          source_refs: [{ source_file: 'x', extractor_type: 'change_list' }],
        },
        // step-B 刪除（不在 after.steps）
      ],
    };
    const d = diffIr(baseIr, after);
    expect(d.steps.added.map((s) => s.step_id)).toEqual(['step-C']);
    expect(d.steps.removed.map((s) => s.step_id)).toEqual(['step-B']);
    expect(d.steps.changed.map((s) => s.step_id)).toEqual(['step-A']);
    expect(d.summary.addedSteps).toBe(1);
    expect(d.summary.removedSteps).toBe(1);
    expect(d.summary.changedSteps).toBe(1);
  });

  it('detects reorder', () => {
    const after: IR = {
      ...baseIr,
      steps: [
        { ...baseIr.steps[1]!, order: 0 },
        { ...baseIr.steps[0]!, order: 1 },
      ],
    };
    const d = diffIr(baseIr, after);
    expect(d.steps.reordered.length).toBe(2);
    expect(d.summary.changedSteps).toBe(0); // 只是 order 變
  });

  it('detects troubleshooting and glossary changes', () => {
    const after: IR = {
      ...baseIr,
      troubleshooting: [
        {
          ...baseIr.troubleshooting![0]!,
          solution: '新加的解法',
        },
        {
          id: 'trouble-2',
          symptom: '新症狀',
          source_refs: [{ source_file: 'x', extractor_type: 'change_list' }],
        },
      ],
      glossary: [
        { id: 'term-IAM', term: 'IAM', definition: '更新的定義' },
        { id: 'term-VPC', term: 'VPC', definition: '新術語' },
      ],
    };
    const d = diffIr(baseIr, after);
    expect(d.troubleshooting.added.length).toBe(1);
    expect(d.troubleshooting.changed.length).toBe(1);
    expect(d.glossary.added.length).toBe(1);
    expect(d.glossary.changed.length).toBe(1);
  });

  it('detects meta changes', () => {
    const after: IR = {
      ...baseIr,
      meta: {
        ...baseIr.meta,
        title: '新標題',
        difficulty: '進階',
      },
    };
    const d = diffIr(baseIr, after);
    expect(d.meta.fields.find((f) => f.field === 'title')).toBeDefined();
    expect(d.meta.fields.find((f) => f.field === 'difficulty')).toBeDefined();
    expect(d.summary.metaFields).toBe(2);
  });

  it('returns empty diff for identical IRs', () => {
    const d = diffIr(baseIr, baseIr);
    expect(d.summary.addedSteps).toBe(0);
    expect(d.summary.removedSteps).toBe(0);
    expect(d.summary.changedSteps).toBe(0);
    expect(d.summary.metaFields).toBe(0);
  });
});
