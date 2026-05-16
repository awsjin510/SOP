import { describe, expect, it } from 'vitest';
import { renderChangelogDocx } from './changelog-docx';
import type { ChangeRecord } from '@/services/sop';

const fakeChange: ChangeRecord = {
  id: 'change-test',
  fromVersion: '1.0.0',
  toVersion: '1.1.0',
  appliedBy: 'tester@x',
  changeIntents: [
    {
      intent_id: 'intent-A',
      type: 'modify_step',
      target: { step_id: 'step-A' },
      description: '改 step A',
      before: '原 A',
      after: '新 A',
      rationale: '因為 X',
      impact: { breaking_change: true, needs_retraining: true },
      confidence: 0.92,
      source_refs: [
        { source_file: 'changes.md', extractor_type: 'change_list', excerpt: '改 step A' },
      ],
      status: 'accepted',
    },
    {
      intent_id: 'intent-B',
      type: 'add_step',
      target: {},
      description: '新增 step',
      after: '新 step 描述',
      confidence: 0.8,
      source_refs: [
        { source_file: 'changes.md', extractor_type: 'change_list', excerpt: 'add' },
      ],
      status: 'accepted',
    },
  ],
  skippedIntents: [
    {
      intent: {
        intent_id: 'intent-C',
        type: 'remove_step',
        target: { step_id: 'step-X' },
        description: '刪除',
        confidence: 0.5,
        source_refs: [
          { source_file: 'meeting.txt', extractor_type: 'text' },
        ],
      },
      reason: 'target step 不存在',
    },
  ],
  conflicts: [
    {
      id: 'conflict-1',
      type: 'source_contradiction',
      description: '兩份素材意見不一',
    },
  ],
  completenessIssues: [
    {
      id: 'issue-1',
      type: 'screenshot_outdated',
      severity: '高',
      description: '截圖未更新',
    },
  ],
  createdAt: null,
};

describe('renderChangelogDocx', () => {
  it('produces a non-empty docx blob with the correct MIME type', async () => {
    const blob = await renderChangelogDocx({
      sopTitle: '測試 SOP',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      appliedBy: 'tester@x',
      appliedAt: '2026-05-09T10:00:00',
      change: fakeChange,
    });
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('renders empty change cleanly', async () => {
    const empty: ChangeRecord = {
      id: 'change-empty',
      fromVersion: '1.0.0',
      toVersion: '1.0.1',
      appliedBy: 'tester@x',
      changeIntents: [],
      skippedIntents: [],
      createdAt: null,
    };
    const blob = await renderChangelogDocx({
      sopTitle: '空變更',
      fromVersion: '1.0.0',
      toVersion: '1.0.1',
      appliedBy: 'tester@x',
      change: empty,
    });
    expect(blob.size).toBeGreaterThan(500);
  });
});
