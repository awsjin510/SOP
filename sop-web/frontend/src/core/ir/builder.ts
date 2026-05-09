import type { IR } from '@/core/ir/schemas';

/**
 * IR Builder：把多個 extractor 的輸出合併成單一 IR。
 * W4 才有實作；W2 只是骨架。
 */
export function buildIr(_inputs: unknown): IR {
  throw new Error('IR builder 尚未實作；W4 起會接上多素材合併');
}
