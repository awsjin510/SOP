import { describe, expect, it, vi, beforeEach } from 'vitest';
import sampleIr from '../../../../schemas/examples/sample-ir.json';
import { IrSchema, type IR } from '@/core/ir/schemas';
import { renderPdf } from './pdf';

// 預設 fetch mock：模擬字型下載失敗，逼 renderer 走 Helvetica fallback。
// 這讓單元測試能在 happy-dom 中跑（沒有真的網路）。
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string) => {
      throw new Error('network unavailable in test');
    }),
  );
});

describe('renderPdf', () => {
  const ir: IR = IrSchema.parse(sampleIr);

  it('produces a PDF Blob with correct MIME type', async () => {
    const blob = await renderPdf(ir);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
    expect(blob.type).toBe('application/pdf');
  });

  it('starts with %PDF- magic bytes', async () => {
    const blob = await renderPdf(ir);
    const buf = new Uint8Array(await blob.arrayBuffer());
    // %PDF = 0x25 0x50 0x44 0x46
    expect(buf[0]).toBe(0x25);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x44);
    expect(buf[3]).toBe(0x46);
    expect(buf[4]).toBe(0x2d);
  });

  it('does not throw when troubleshooting / glossary missing', async () => {
    const minimal: IR = JSON.parse(JSON.stringify(ir));
    delete (minimal as { troubleshooting?: unknown }).troubleshooting;
    delete (minimal as { glossary?: unknown }).glossary;
    const blob = await renderPdf(minimal);
    expect(blob.size).toBeGreaterThan(500);
  });
});
