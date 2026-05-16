/**
 * W8：審核操作的純邏輯單元測試（不打 Firestore）。
 *
 * 由於 patchIntent / resolveConflict / acknowledgeIssue 內部用 Firestore
 * read-modify-write，這裡用 vi.mock 整個 firebase/firestore，
 * 把 getDoc 回傳預設 fixture，驗證 updateDoc 的 payload 正確。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateDocMock = vi.fn();
const getDocMock = vi.fn();
const docMock = vi.fn((..._args: unknown[]) => ({ id: 'job-test' }));

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => docMock(...a),
  collection: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: (...a: unknown[]) => updateDocMock(...a),
  onSnapshot: vi.fn(),
  serverTimestamp: () => ({ __ts: true }),
  Timestamp: { now: () => ({ __now: true }) },
  getDoc: (...a: unknown[]) => getDocMock(...a),
}));

vi.mock('@/firebase/config', () => ({
  db: {},
  auth: {},
  storage: {},
  functions: {},
}));

import {
  patchIntent,
  resolveConflict,
  acknowledgeIssue,
  batchPatchIntents,
} from './job';

const baseJob = {
  id: 'job-test',
  intermediate: {
    fromVersion: '1.0.0',
    intents: [
      {
        intent_id: 'intent-A',
        type: 'modify_step',
        target: { step_id: 'step-1' },
        description: 'a',
        confidence: 0.9,
        source_refs: [{ source_file: 'x', extractor_type: 'change_list' }],
        status: 'pending',
      },
      {
        intent_id: 'intent-B',
        type: 'add_tip',
        target: { step_id: 'step-1' },
        description: 'b',
        confidence: 0.4,
        source_refs: [{ source_file: 'y', extractor_type: 'text' }],
        status: 'pending',
      },
    ],
    conflicts: [
      {
        id: 'conflict-X',
        type: 'source_contradiction',
        description: 'x',
        options: [
          { intent_id: 'opt-1', confidence: 0.8 },
          { intent_id: 'opt-2', confidence: 0.7 },
        ],
        recommendedOptionIndex: 0,
      },
    ],
    completenessIssues: [
      {
        id: 'issue-1',
        type: 'screenshot_outdated',
        severity: '高',
        description: 'd',
      },
    ],
    termMappings: [],
    newImageAssets: {},
    appliedBy: 'tester',
    stats: { rawCount: 2, mergedCount: 2, inConflictCount: 0 },
  },
};

describe('job review actions', () => {
  beforeEach(() => {
    updateDocMock.mockReset();
    getDocMock.mockReset();
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => baseJob,
    });
  });

  it('patchIntent updates target intent status', async () => {
    await patchIntent('job-test', 'intent-A', { status: 'accepted' });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>;
    const intents = payload['intermediate.intents'] as Array<{ intent_id: string; status: string }>;
    expect(intents.find((i) => i.intent_id === 'intent-A')?.status).toBe('accepted');
    expect(intents.find((i) => i.intent_id === 'intent-B')?.status).toBe('pending');
  });

  it('resolveConflict picks an option index and clears dismissed', async () => {
    await resolveConflict('job-test', 'conflict-X', { resolvedOptionIndex: 1 });
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>;
    const conflicts = payload['intermediate.conflicts'] as Array<{
      id: string;
      resolvedOptionIndex?: number;
      dismissed?: boolean;
    }>;
    expect(conflicts[0]!.resolvedOptionIndex).toBe(1);
    expect(conflicts[0]!.dismissed).toBe(false);
  });

  it('resolveConflict can dismiss', async () => {
    await resolveConflict('job-test', 'conflict-X', { dismissed: true });
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>;
    const conflicts = payload['intermediate.conflicts'] as Array<{
      dismissed?: boolean;
      resolvedOptionIndex?: number;
    }>;
    expect(conflicts[0]!.dismissed).toBe(true);
    expect(conflicts[0]!.resolvedOptionIndex).toBeUndefined();
  });

  it('acknowledgeIssue toggles flag', async () => {
    await acknowledgeIssue('job-test', 'issue-1', true);
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>;
    const issues = payload['intermediate.completenessIssues'] as Array<{
      id: string;
      acknowledged?: boolean;
    }>;
    expect(issues[0]!.acknowledged).toBe(true);
  });

  it('batchPatchIntents accepts intents above threshold', async () => {
    await batchPatchIntents('job-test', { acceptIfConfidenceAtLeast: 0.85 });
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>;
    const intents = payload['intermediate.intents'] as Array<{
      intent_id: string;
      status: string;
    }>;
    expect(intents.find((i) => i.intent_id === 'intent-A')?.status).toBe('accepted');
    expect(intents.find((i) => i.intent_id === 'intent-B')?.status).toBe('pending');
  });

  it('batchPatchIntents rejects intents below threshold', async () => {
    await batchPatchIntents('job-test', { rejectIfConfidenceBelow: 0.5 });
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>;
    const intents = payload['intermediate.intents'] as Array<{
      intent_id: string;
      status: string;
    }>;
    expect(intents.find((i) => i.intent_id === 'intent-A')?.status).toBe('pending');
    expect(intents.find((i) => i.intent_id === 'intent-B')?.status).toBe('rejected');
  });
});
