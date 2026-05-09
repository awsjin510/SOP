import type { IR } from '@/core/ir/schemas';

/** W5 實作：用 pdf-lib 產 PDF */
export async function renderPdf(_ir: IR): Promise<Blob> {
  throw new Error('PDF renderer 尚未實作；W5 階段會接 pdf-lib');
}
