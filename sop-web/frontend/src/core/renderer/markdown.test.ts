import { describe, expect, it } from 'vitest';
import sampleIr from '../../../../schemas/examples/sample-ir.json';
import { IrSchema, type IR } from '../ir/schemas';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  const ir: IR = IrSchema.parse(sampleIr);

  it('renders the SOP title as H1', () => {
    const md = renderMarkdown(ir);
    expect(md).toMatch(/^# EC2 啟動 SOP/);
  });

  it('includes target audience banner', () => {
    const md = renderMarkdown(ir);
    expect(md).toContain('適用對象：');
    expect(md).toContain(ir.meta.target_audience);
  });

  it('renders each section as H2 with its title', () => {
    const md = renderMarkdown(ir);
    for (const section of ir.sections) {
      expect(md).toContain(`## ${section.order + 1}. ${section.title}`);
    }
  });

  it('renders each step as H3 and includes its actions', () => {
    const md = renderMarkdown(ir);
    for (const step of ir.steps) {
      expect(md).toContain(`### ${step.title}`);
      for (const action of step.actions) {
        expect(md).toContain(action.text);
      }
    }
  });

  it('renders troubleshooting section when present', () => {
    const md = renderMarkdown(ir);
    if (ir.troubleshooting && ir.troubleshooting.length > 0) {
      expect(md).toContain('## Troubleshooting');
      for (const t of ir.troubleshooting) {
        expect(md).toContain(t.symptom);
      }
    }
  });
});
