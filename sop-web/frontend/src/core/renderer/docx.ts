import type { IR } from '@/core/ir/schemas';

/** W5 實作：用 docx 套件產 Word 文件 */
export async function renderDocx(_ir: IR): Promise<Blob> {
  throw new Error('Docx renderer 尚未實作；W5 階段會接 docx 套件');
}
