import type { IR } from '@/core/ir/schemas';

/**
 * 把 IR 渲染成 Markdown（預覽用）。
 * W3 實作。
 */
export function renderMarkdown(_ir: IR): string {
  throw new Error('Markdown renderer 尚未實作；W3 階段會接');
}
