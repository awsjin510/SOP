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

import {
  reconcileSections,
  applyDedup,
  applyScreenshotPairing,
  mergeSteps,
  buildIrFromMultiSource,
} from './multi-builder';
import { callClaude } from '@/services/claude';
import type { Step } from './schemas';
import type { TranscriptPayload } from '@/core/extractors/transcript';
import type { DocumentPayload } from '@/core/extractors/document';
import type { ScreenshotPayload } from '@/core/extractors/screenshot';

const mockedCallClaude = callClaude as unknown as ReturnType<typeof vi.fn>;

const makeStep = (overrides: Partial<Step>): Step => ({
  step_id: `step-${Math.random().toString(36).slice(2, 12)}`,
  section_id: 'section-main',
  order: 0,
  title: 'untitled',
  actions: [{ text: 'do' }],
  source_refs: [
    {
      source_file: 'src.txt',
      extractor_type: 'transcript',
      excerpt: 'x',
    },
  ],
  ...overrides,
});

const baseOptions = {
  sopId: 'multi-test',
  title: '多源測試',
  targetAudience: '工程師',
  authors: ['jin@example.com'],
  createdAt: '2026-05-09T10:00:00+08:00',
  updatedAt: '2026-05-09T10:00:00+08:00',
};

describe('reconcileSections', () => {
  it('returns default section when no sources', () => {
    const out = reconcileSections({
      transcripts: [],
      documents: [],
      screenshots: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('section-main');
  });

  it('dedupes sections by id and sorts by order', () => {
    const tp: TranscriptPayload = {
      sections: [
        { id: 'section-b', title: 'B', order: 1 },
        { id: 'section-a', title: 'A', order: 0 },
      ],
      steps: [],
      troubleshooting: [],
      glossary: [],
    };
    const dp: DocumentPayload = {
      sections: [
        { id: 'section-a', title: 'A from doc', order: 0 }, // 重複
        { id: 'section-c', title: 'C', order: 2 },
      ],
      steps: [],
      troubleshooting: [],
      glossary: [],
    };
    const out = reconcileSections({ transcripts: [tp], documents: [dp], screenshots: [] });
    expect(out.map((s) => s.id)).toEqual(['section-a', 'section-b', 'section-c']);
    // 第一個 'section-a' 是來自 transcript 的版本
    expect(out[0]!.title).toBe('A');
  });
});

describe('mergeSteps', () => {
  it('combines source_refs and bumps confidence with multi-source corroboration', () => {
    const a = makeStep({
      step_id: 'step-AAA',
      title: '確認權限',
      confidence: 0.8,
    });
    const b = makeStep({
      step_id: 'step-BBB',
      title: '檢查 IAM 權限',
      purpose: '避免權限不足',
      source_refs: [
        {
          source_file: 'doc.docx',
          extractor_type: 'document',
          excerpt: 'permission check',
        },
      ],
    });
    const merged = mergeSteps([a, b], a);
    expect(merged.step_id).toBe('step-AAA');
    expect(merged.purpose).toBe('避免權限不足');
    expect(merged.source_refs).toHaveLength(2);
    expect(merged.confidence).toBeCloseTo(0.85, 2);
  });

  it('does not over-cap confidence above 0.95', () => {
    const a = makeStep({ step_id: 'step-AAA', confidence: 0.9 });
    const b = makeStep({ step_id: 'step-BBB' });
    const c = makeStep({ step_id: 'step-CCC' });
    const merged = mergeSteps([a, b, c], a);
    expect(merged.confidence).toBeLessThanOrEqual(0.95);
  });
});

describe('applyDedup', () => {
  it('groups members and emits one merged step per group + leftover singletons', () => {
    const t = [
      {
        ref: 'T0_0',
        step: makeStep({
          step_id: 'step-T0',
          title: '確認權限',
          source_refs: [
            { source_file: 'i.txt', extractor_type: 'transcript', excerpt: 'a' },
          ],
        }),
      },
      {
        ref: 'D0_0',
        step: makeStep({
          step_id: 'step-D0',
          title: '檢查 IAM',
          source_refs: [
            { source_file: 'd.docx', extractor_type: 'document', excerpt: 'b' },
          ],
        }),
      },
      { ref: 'T0_1', step: makeStep({ step_id: 'step-T1', title: '啟動 Instance' }) },
    ];
    const out = applyDedup(t, [
      {
        merged_title: '確認 IAM 權限',
        members: ['T0_0', 'D0_0'],
        preferred_ref: 'T0_0',
      },
      {
        merged_title: '啟動 Instance',
        members: ['T0_1'],
        preferred_ref: 'T0_1',
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.step_id).toBe('step-T0');
    expect(out[0]!.source_refs).toHaveLength(2);
  });

  it('keeps unmentioned steps as singletons', () => {
    const t = [
      { ref: 'T0_0', step: makeStep({ step_id: 'step-T0', title: 'A' }) },
      { ref: 'T0_1', step: makeStep({ step_id: 'step-T1', title: 'B' }) },
    ];
    // 模型只報告了 T0_0
    const out = applyDedup(t, [
      { merged_title: 'A', members: ['T0_0'], preferred_ref: 'T0_0' },
    ]);
    expect(out.map((s) => s.step_id).sort()).toEqual(['step-T0', 'step-T1']);
  });
});

describe('applyScreenshotPairing', () => {
  it('attaches image_ids to the first action of each step', () => {
    const steps: Step[] = [
      makeStep({ step_id: 'step-A', actions: [{ text: 'click' }] }),
      makeStep({ step_id: 'step-B', actions: [{ text: 'submit' }] }),
    ];
    const screens: ScreenshotPayload[] = [
      {
        image_id: 'img-001',
        source_file: 's.png',
        description: 'd',
        ui_elements: [],
        annotations: [],
        likely_step_titles: [],
        ocr_text_excerpt: '',
        confidence: 0.9,
      },
      {
        image_id: 'img-002',
        source_file: 's2.png',
        description: 'd',
        ui_elements: [],
        annotations: [],
        likely_step_titles: [],
        ocr_text_excerpt: '',
        confidence: 0.9,
      },
    ];
    const out = applyScreenshotPairing(steps, screens, {
      assignments: [
        { step_id: 'step-A', image_ids: ['img-001', 'img-002'] },
      ],
      unassigned: [],
    });
    expect(out.steps[0]!.actions[0]!.screenshot_refs).toEqual([
      'img-001',
      'img-002',
    ]);
    expect(out.steps[1]!.actions[0]!.screenshot_refs).toBeUndefined();
  });
});

describe('buildIrFromMultiSource (single-source skip dedup)', () => {
  beforeEach(() => mockedCallClaude.mockReset());

  it('produces a valid IR without calling Claude when there is only one source', async () => {
    const transcript: TranscriptPayload = {
      sections: [{ id: 'section-main', title: '主', order: 0 }],
      steps: [makeStep({ step_id: 'step-only' })],
      troubleshooting: [],
      glossary: [],
    };
    const result = await buildIrFromMultiSource(
      { transcripts: [transcript], documents: [], screenshots: [] },
      { ...baseOptions, enableDedup: false, enableScreenshotPairing: false },
    );
    expect(result.ir.steps).toHaveLength(1);
    expect(result.apiCalls).toBe(0);
    expect(mockedCallClaude).not.toHaveBeenCalled();
  });
});
