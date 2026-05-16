import type { SourceRef } from '@/core/ir/schemas';

/** {{var}} 模板替換 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

/**
 * 從 LLM 回應中萃取 JSON：優先 ```json fenced block；fallback 到第一個 { 至最後一個 }。
 */
export function extractJsonBlock(text: string): string | null {
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) return fenceMatch[1]!.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return null;
}

/** 把抽取器原始 source_ref 加上 base（source_file + extractor_type） */
export function attachSourceRefBase(
  raw: { location?: string; excerpt?: string; confidence?: number },
  base: Pick<SourceRef, 'source_file' | 'extractor_type'>,
): SourceRef {
  return {
    ...base,
    ...(raw.location !== undefined ? { location: raw.location } : {}),
    ...(raw.excerpt !== undefined ? { excerpt: raw.excerpt } : {}),
    ...(raw.confidence !== undefined ? { confidence: raw.confidence } : {}),
  };
}
