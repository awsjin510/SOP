import { describe, expect, it } from 'vitest';
import { buildSopJsonBlob, parseSopJson, slugify } from './sop';
import type { SopState } from './sop';
import type { IR } from '@/core/ir/schemas';

function makeIr(): IR {
  return {
    schema_version: '1.0.0',
    version: '1.0.0',
    meta: {
      sop_id: 'sop-test',
      title: '測試 SOP',
      target_audience: '測試人員',
      authors: ['tester'],
      created_at: '2026-05-19T00:00:00+08:00',
      updated_at: '2026-05-19T00:00:00+08:00',
    },
    sections: [
      { id: 'main', title: '主要步驟', order: 1 },
    ],
    steps: [
      {
        step_id: 'step-aaa',
        section_id: 'main',
        title: '示範步驟',
        actions: [{ text: '執行 echo hello' }],
        source_refs: [
          {
            source_file: 'demo.txt',
            extractor_type: 'transcript',
            location: 'line 1',
            confidence: 0.9,
          },
        ],
      },
    ],
    troubleshooting: [],
    glossary: [],
  };
}

describe('SOP.json round-trip', () => {
  it('buildSopJsonBlob + parseSopJson preserves IR & metadata', async () => {
    const before: SopState = {
      ir: makeIr(),
      metadata: {
        title: '測試 SOP',
        targetAudience: '測試人員',
        sourceFiles: [
          { name: 'demo.txt', type: 'transcript', extractedAt: '2026-05-19T00:00:00Z' },
        ],
      },
    };
    const blob = buildSopJsonBlob(before);
    expect(blob.type).toBe('application/json');

    const file = new File([blob], 'demo.sop.json', { type: 'application/json' });
    const after = await parseSopJson(file);

    expect(after.ir.meta.sop_id).toBe(before.ir.meta.sop_id);
    expect(after.ir.steps).toHaveLength(1);
    expect(after.ir.steps[0]?.step_id).toBe('step-aaa');
    expect(after.metadata.title).toBe('測試 SOP');
    expect(after.metadata.sourceFiles[0]?.name).toBe('demo.txt');
  });

  it('parseSopJson rejects non-JSON', async () => {
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    await expect(parseSopJson(file)).rejects.toThrow(/合法的 JSON/);
  });

  it('parseSopJson rejects wrong schema', async () => {
    const file = new File(['{"foo":1}'], 'bad.json', { type: 'application/json' });
    await expect(parseSopJson(file)).rejects.toThrow(/格式不符/);
  });
});

describe('slugify', () => {
  it('replaces unsafe chars', () => {
    expect(slugify('My SOP / Test * Doc')).toBe('My-SOP-Test-Doc');
  });
  it('falls back when result would be empty', () => {
    expect(slugify('////', 'fallback')).toBe('fallback');
  });
});
