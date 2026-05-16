import { describe, expect, it } from 'vitest';
import { buildIrFromTranscript } from './builder';
import { IrSchema, type Step, type TroubleshootingItem } from './schemas';

const baseOptions = {
  sopId: 'test-sop',
  title: '測試 SOP',
  targetAudience: '工程師',
  authors: ['jin@example.com'],
  createdAt: '2026-05-09T10:00:00+08:00',
  updatedAt: '2026-05-09T10:00:00+08:00',
};

const sampleStep: Step = {
  step_id: 'step-AbCdEf1234',
  section_id: 'section-main',
  order: 0,
  title: '步驟 1',
  actions: [{ text: '操作一' }],
  source_refs: [
    {
      source_file: 'interview.txt',
      extractor_type: 'transcript',
      excerpt: 'sample',
    },
  ],
};

const sampleTrouble: TroubleshootingItem = {
  id: 'trouble-12345abcde',
  symptom: '症狀',
  source_refs: [
    {
      source_file: 'interview.txt',
      extractor_type: 'transcript',
    },
  ],
};

describe('buildIrFromTranscript', () => {
  it('produces an IR that passes the canonical zod schema', () => {
    const ir = buildIrFromTranscript(
      {
        sections: [{ id: 'section-main', title: '主要', order: 0 }],
        steps: [sampleStep],
        troubleshooting: [sampleTrouble],
        glossary: [],
      },
      baseOptions,
    );
    expect(IrSchema.safeParse(ir).success).toBe(true);
    expect(ir.version).toBe('1.0.0');
    expect(ir.schema_version).toBe('1.0.0');
    expect(ir.meta.sop_id).toBe('test-sop');
    expect(ir.steps).toHaveLength(1);
    expect(ir.troubleshooting).toHaveLength(1);
  });

  it('omits glossary/troubleshooting when empty', () => {
    const ir = buildIrFromTranscript(
      {
        sections: [{ id: 'section-main', title: '主要', order: 0 }],
        steps: [sampleStep],
        troubleshooting: [],
        glossary: [],
      },
      baseOptions,
    );
    expect(ir.troubleshooting).toBeUndefined();
    expect(ir.glossary).toBeUndefined();
  });

  it('includes optional meta fields when provided', () => {
    const ir = buildIrFromTranscript(
      {
        sections: [{ id: 'section-main', title: '主要', order: 0 }],
        steps: [sampleStep],
        troubleshooting: [],
        glossary: [],
      },
      {
        ...baseOptions,
        category: 'AWS',
        tags: ['ec2'],
        difficulty: '初級',
        estimatedDurationMinutes: 30,
      },
    );
    expect(ir.meta.category).toBe('AWS');
    expect(ir.meta.tags).toEqual(['ec2']);
    expect(ir.meta.difficulty).toBe('初級');
    expect(ir.meta.estimated_duration_minutes).toBe(30);
  });
});
