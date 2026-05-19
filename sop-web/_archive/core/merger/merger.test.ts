import { describe, expect, it } from 'vitest';
import { mergeChangeIntents } from './merger';
import type { ChangeIntent, IR } from '@/core/ir/schemas';

const baseIr: IR = {
  schema_version: '1.0.0',
  version: '1.2.0',
  meta: {
    sop_id: 'test-sop',
    title: '測試',
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
      actions: [{ text: '原操作', screenshot_refs: ['img-1'] }],
      source_refs: [
        { source_file: 'i.txt', extractor_type: 'transcript', excerpt: 'a' },
      ],
    },
  ],
};

const mkIntent = (overrides: Partial<ChangeIntent>): ChangeIntent => ({
  intent_id: `intent-${Math.random().toString(36).slice(2, 12)}`,
  type: 'modify_step',
  target: { step_id: 'step-AAA' },
  description: '改步驟',
  after: '改用 IAM Role 進行授權',
  source_refs: [
    { source_file: 'a.md', extractor_type: 'change_list', excerpt: 'x', confidence: 0.8 },
  ],
  confidence: 0.8,
  status: 'pending',
  ...overrides,
});

describe('mergeChangeIntents', () => {
  it('merges consistent multi-source intents and boosts confidence', () => {
    const a = mkIntent({
      after: '改用 IAM Role 進行授權',
      confidence: 0.8,
      source_refs: [
        { source_file: 'a.md', extractor_type: 'change_list', excerpt: 'x', confidence: 0.8 },
      ],
    });
    const b = mkIntent({
      after: '改用 IAM 角色進行授權',
      confidence: 0.75,
      source_refs: [
        { source_file: 'b.txt', extractor_type: 'text', excerpt: 'y', confidence: 0.75 },
      ],
    });

    const result = mergeChangeIntents(baseIr, [[a], [b]]);
    expect(result.stats.rawCount).toBe(2);
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]!.source_refs).toHaveLength(2);
    expect(result.intents[0]!.confidence).toBeGreaterThan(0.8);
    expect(result.conflicts).toHaveLength(0);
  });

  it('emits source_contradiction when after texts diverge across sources', () => {
    const a = mkIntent({
      after: '改用 IAM Role',
      source_refs: [
        { source_file: 'a.md', extractor_type: 'change_list', excerpt: 'x' },
      ],
    });
    const b = mkIntent({
      after: '繼續用 IAM User',
      source_refs: [
        { source_file: 'b.txt', extractor_type: 'text', excerpt: 'y' },
      ],
    });
    const result = mergeChangeIntents(baseIr, [[a], [b]]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.type).toBe('source_contradiction');
    expect(result.intents).toHaveLength(0);
  });

  it('emits temporal_conflict when same source disagrees', () => {
    const a = mkIntent({
      after: '改用 IAM Role',
      source_refs: [
        {
          source_file: 'meeting.txt',
          extractor_type: 'text',
          location: '第 1 段',
          excerpt: 'x',
        },
      ],
    });
    const b = mkIntent({
      after: '暫緩，繼續用 IAM User',
      source_refs: [
        {
          source_file: 'meeting.txt',
          extractor_type: 'text',
          location: '第 5 段',
          excerpt: 'y',
        },
      ],
    });
    const result = mergeChangeIntents(baseIr, [[a, b]]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.type).toBe('temporal_conflict');
  });

  it('detects screenshot_outdated completeness issue', () => {
    const intent = mkIntent({ type: 'modify_step', after: '新操作' });
    const result = mergeChangeIntents(baseIr, [[intent]]);
    const screenshotIssue = result.completenessIssues.find(
      (i) => i.type === 'screenshot_outdated',
    );
    expect(screenshotIssue).toBeDefined();
    expect(screenshotIssue!.targetId).toBe('step-AAA');
  });

  it('detects training_impact when breaking_change present', () => {
    const intent = mkIntent({
      impact: { breaking_change: true },
    });
    const result = mergeChangeIntents(baseIr, [[intent]]);
    const issue = result.completenessIssues.find((i) => i.type === 'training_impact');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('高');
  });

  it('detects semantic_inconsistency when removed step is referenced by trouble', () => {
    const irWithRef: IR = {
      ...baseIr,
      troubleshooting: [
        {
          id: 'trouble-T1',
          symptom: '某問題',
          related_step_ids: ['step-AAA'],
          source_refs: [
            { source_file: 'i.txt', extractor_type: 'transcript' },
          ],
        },
      ],
    };
    const removeIntent = mkIntent({
      type: 'remove_step',
      target: { step_id: 'step-AAA' },
      after: '',
    });
    const result = mergeChangeIntents(irWithRef, [[removeIntent]]);
    const semantic = result.conflicts.find((c) => c.type === 'semantic_inconsistency');
    expect(semantic).toBeDefined();
  });
});
