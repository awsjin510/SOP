import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the claude service before importing the extractor
vi.mock('@/services/claude', () => ({
  callClaude: vi.fn(),
  DEFAULT_MODEL: 'claude-opus-4-7',
  FAST_MODEL: 'claude-haiku-4-5-20251001',
}));

vi.mock('@/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));

import {
  TranscriptExtractor,
  renderTemplate,
  extractJsonBlock,
} from './transcript';
import { callClaude } from '@/services/claude';

const mockedCallClaude = callClaude as unknown as ReturnType<typeof vi.fn>;

describe('renderTemplate', () => {
  it('replaces {{var}} placeholders', () => {
    const out = renderTemplate('hi {{name}} from {{place}}', {
      name: 'Jin',
      place: 'CO',
    });
    expect(out).toBe('hi Jin from CO');
  });

  it('leaves unknown placeholders as-is', () => {
    const out = renderTemplate('{{x}} {{y}}', { x: '1' });
    expect(out).toBe('1 {{y}}');
  });
});

describe('extractJsonBlock', () => {
  it('extracts content from a fenced ```json block', () => {
    const text = '前言\n```json\n{"a":1}\n```\n後話';
    expect(extractJsonBlock(text)).toBe('{"a":1}');
  });

  it('handles bare ``` fences without language tag', () => {
    const text = '```\n{"a":2}\n```';
    expect(extractJsonBlock(text)).toBe('{"a":2}');
  });

  it('falls back to first { ... last } when no fences', () => {
    const text = 'noise {"a":3} more';
    expect(extractJsonBlock(text)).toBe('{"a":3}');
  });

  it('returns null when no json-looking content', () => {
    expect(extractJsonBlock('just text')).toBeNull();
  });
});

describe('TranscriptExtractor.extract', () => {
  beforeEach(() => {
    mockedCallClaude.mockReset();
  });

  it('produces a payload with TS-side step_id, source_refs, and section defaults', async () => {
    mockedCallClaude.mockResolvedValueOnce({
      text:
        '```json\n' +
        JSON.stringify({
          sections: [],
          steps: [
            {
              section_id: 'section-main',
              order: 0,
              title: '確認 IAM 權限',
              purpose: '避免後續 button disabled',
              actions: [{ text: '前往 IAM Console' }],
              source_refs: [
                {
                  location: '第 1 段',
                  excerpt: '先確認權限',
                  confidence: 0.9,
                },
              ],
              confidence: 0.9,
            },
          ],
          troubleshooting: [],
          glossary: [],
        }) +
        '\n```',
      model: 'claude-opus-4-7',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost_usd: 0.01,
    });

    const ext = new TranscriptExtractor();
    const out = await ext.extract(
      {
        text: '逐字稿內容...',
        title: '測試 SOP',
        targetAudience: '新進工程師',
      },
      { sourceFile: 'interview.txt' },
    );

    expect(out.type).toBe('transcript');
    expect(out.payload.steps).toHaveLength(1);

    const step = out.payload.steps[0]!;
    expect(step.step_id).toMatch(/^step-[a-zA-Z0-9_-]+$/);
    expect(step.title).toBe('確認 IAM 權限');
    expect(step.source_refs[0]!.source_file).toBe('interview.txt');
    expect(step.source_refs[0]!.extractor_type).toBe('transcript');
    expect(out.payload.sections).toHaveLength(1);
    expect(out.payload.sections[0]!.id).toBe('section-main');
  });

  it('throws when Claude returns invalid JSON', async () => {
    mockedCallClaude.mockResolvedValueOnce({
      text: '我覺得這沒辦法回答',
      model: 'claude-opus-4-7',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
      cost_usd: 0,
    });

    const ext = new TranscriptExtractor();
    await expect(
      ext.extract(
        { text: '...', title: 'X', targetAudience: 'Y' },
        { sourceFile: 'foo.txt' },
      ),
    ).rejects.toThrow();
  });

  it('throws when raw output violates schema (missing source_refs)', async () => {
    mockedCallClaude.mockResolvedValueOnce({
      text:
        '```json\n' +
        JSON.stringify({
          steps: [
            {
              section_id: 'section-main',
              title: 'no source ref step',
              actions: [{ text: 'do thing' }],
              source_refs: [],
            },
          ],
        }) +
        '\n```',
      model: 'claude-opus-4-7',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
      cost_usd: 0,
    });

    const ext = new TranscriptExtractor();
    await expect(
      ext.extract(
        { text: '...', title: 'X', targetAudience: 'Y' },
        { sourceFile: 'foo.txt' },
      ),
    ).rejects.toThrow(/schema/);
  });

  it('maps related_step_titles to step_ids', async () => {
    mockedCallClaude.mockResolvedValueOnce({
      text:
        '```json\n' +
        JSON.stringify({
          sections: [],
          steps: [
            {
              section_id: 'section-main',
              title: '步驟一',
              actions: [{ text: 'a' }],
              source_refs: [{ location: 's', excerpt: 'e', confidence: 0.9 }],
            },
          ],
          troubleshooting: [
            {
              symptom: '症狀',
              related_step_titles: ['步驟一'],
              source_refs: [{ location: 's', excerpt: 'e', confidence: 0.9 }],
            },
          ],
          glossary: [],
        }) +
        '\n```',
      model: 'claude-opus-4-7',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
      cost_usd: 0,
    });

    const ext = new TranscriptExtractor();
    const out = await ext.extract(
      { text: '...', title: 'X', targetAudience: 'Y' },
      { sourceFile: 'foo.txt' },
    );

    const step = out.payload.steps[0]!;
    const trouble = out.payload.troubleshooting[0]!;
    expect(trouble.related_step_ids).toEqual([step.step_id]);
  });
});
