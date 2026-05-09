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

import { UpdateScreenshotExtractor } from './screenshot-update';
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
      actions: [{ text: '原操作', screenshot_refs: ['img-old'] }],
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

const fakeBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

describe('UpdateScreenshotExtractor', () => {
  beforeEach(() => mockedCallClaude.mockReset());

  it('returns visual_diff and replace_screenshot intent for matched step', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          matched_step_id: 'step-AAA',
          visual_diff: {
            severity: 'minor',
            changed_regions: ['icon 改版'],
            summary: 'UI 微調',
          },
          intents: [
            {
              type: 'replace_screenshot',
              target: { step_id: 'step-AAA' },
              description: '更新步驟一的截圖',
              source_refs: [
                { location: 'screenshot', excerpt: 'icon 改版', confidence: 0.85 },
              ],
              confidence: 0.85,
            },
          ],
        }),
      ),
    );

    const extractor = new UpdateScreenshotExtractor();
    const out = await extractor.extract(
      { blob: fakeBlob, mimeType: 'image/png', baseIr },
      { sourceFile: 'new.png' },
    );

    expect(out.payload.matched_step_id).toBe('step-AAA');
    expect(out.payload.visual_diff.severity).toBe('minor');
    expect(out.payload.intents).toHaveLength(1);
    const intent = out.payload.intents[0]!;
    expect(intent.type).toBe('replace_screenshot');
    expect(intent.target.step_id).toBe('step-AAA');
    expect(intent.impact?.needs_screenshot_update).toBe(true);
    expect(intent.source_refs[0]!.extractor_type).toBe('screenshot');
    expect(intent.confidence).toBeLessThanOrEqual(0.85);
  });

  it('drops intents needing step_id when no match', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          matched_step_id: null,
          visual_diff: { severity: 'cosmetic', changed_regions: [], summary: '' },
          intents: [
            {
              type: 'modify_step',
              target: {},
              description: '???',
              source_refs: [{ excerpt: 'x', confidence: 0.5 }],
              confidence: 0.5,
            },
          ],
        }),
      ),
    );
    const extractor = new UpdateScreenshotExtractor();
    const out = await extractor.extract(
      { blob: fakeBlob, mimeType: 'image/png', baseIr },
      { sourceFile: 'new.png' },
    );
    expect(out.payload.matched_step_id).toBeNull();
    expect(out.payload.intents).toHaveLength(0);
  });

  it('falls back to matched_step_id when raw target.step_id is invalid', async () => {
    mockedCallClaude.mockResolvedValueOnce(
      claudeResp(
        fenced({
          matched_step_id: 'step-AAA',
          visual_diff: { severity: 'major', changed_regions: ['x'], summary: 'big' },
          intents: [
            {
              type: 'replace_screenshot',
              target: { step_id: 'step-WRONG' },
              description: 'x',
              source_refs: [{ excerpt: 'x', confidence: 0.7 }],
              confidence: 0.7,
            },
          ],
        }),
      ),
    );
    const extractor = new UpdateScreenshotExtractor();
    const out = await extractor.extract(
      { blob: fakeBlob, mimeType: 'image/png', baseIr },
      { sourceFile: 'new.png' },
    );
    expect(out.payload.intents[0]!.target.step_id).toBe('step-AAA');
  });
});
