import { describe, expect, it } from 'vitest';
import sampleIr from '../../../../schemas/examples/sample-ir.json';
import { IrSchema, type IR } from '@/core/ir/schemas';
import { renderDocx } from './docx';

describe('renderDocx', () => {
  const ir: IR = IrSchema.parse(sampleIr);

  it('produces a non-empty .docx Blob with correct MIME type', async () => {
    const blob = await renderDocx(ir);
    expect(blob).toBeInstanceOf(Blob);
    // .docx is a zip — should be at least a few KB
    expect(blob.size).toBeGreaterThan(1024);
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('starts with the ZIP magic bytes (PK\\x03\\x04)', async () => {
    const blob = await renderDocx(ir);
    const buf = new Uint8Array(await blob.arrayBuffer());
    // PK\x03\x04 = 0x50 0x4B 0x03 0x04
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
  });

  it('runs even when the IR has no troubleshooting/glossary', async () => {
    const minimal: IR = {
      ...ir,
      ...(ir.troubleshooting ? {} : {}),
    };
    delete (minimal as { troubleshooting?: unknown }).troubleshooting;
    delete (minimal as { glossary?: unknown }).glossary;
    const blob = await renderDocx(minimal);
    expect(blob.size).toBeGreaterThan(1024);
  });

  it('falls back gracefully when image resolver returns null', async () => {
    const blob = await renderDocx(ir, {
      resolveImage: async () => null,
    });
    expect(blob.size).toBeGreaterThan(1024);
  });
});
