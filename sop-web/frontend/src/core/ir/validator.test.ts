import { describe, expect, it } from 'vitest';
import sampleIr from '../../../../schemas/examples/sample-ir.json';
import { parseIr, validateIr, validateIrConsistency } from './validator';
import { IrValidationError } from './validator';
import type { IR } from './schemas';

describe('IR validator', () => {
  it('accepts the canonical sample-ir.json', () => {
    const result = validateIr(sampleIr);
    if (!result.ok) {
      console.error(result.issues);
    }
    expect(result.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data?.meta.sop_id).toBe('ec2-provisioning');
    expect(result.data?.steps.length).toBeGreaterThan(0);
  });

  it('rejects a step missing source_refs', () => {
    const ir = JSON.parse(JSON.stringify(sampleIr)) as IR;
    ir.steps[0]!.source_refs = [];
    const result = validateIr(ir);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) =>
          i.path.includes('source_refs') &&
          /至少|min|至少一個/i.test(i.message),
      ),
    ).toBe(true);
  });

  it('rejects an invalid step_id format', () => {
    const ir = JSON.parse(JSON.stringify(sampleIr)) as IR;
    ir.steps[0]!.step_id = '1';
    const result = validateIr(ir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path.includes('step_id'))).toBe(true);
  });

  it('parseIr throws IrValidationError on bad input', () => {
    expect(() => parseIr({ schema_version: '1.0.0' })).toThrow(IrValidationError);
  });

  it('detects orphan section_id in consistency check', () => {
    const ir = parseIr(sampleIr);
    ir.steps[0]!.section_id = 'section-does-not-exist';
    const issues = validateIrConsistency(ir);
    expect(
      issues.some(
        (i) =>
          i.code === 'orphan_section_ref' && i.path === 'steps[0].section_id',
      ),
    ).toBe(true);
  });

  it('detects duplicate step_ids', () => {
    const ir = parseIr(sampleIr);
    const dupe = JSON.parse(JSON.stringify(ir.steps[0])) as (typeof ir.steps)[0];
    ir.steps.push(dupe);
    const issues = validateIrConsistency(ir);
    expect(issues.some((i) => i.code === 'duplicate_step_id')).toBe(true);
  });
});
