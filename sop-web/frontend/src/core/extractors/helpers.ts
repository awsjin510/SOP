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
  // 截斷的 fenced block：抓 ```json 之後到結尾的內容
  const openFenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*)$/);
  if (openFenceMatch) return openFenceMatch[1]!.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return null;
}

/**
 * 給 JSON.parse 失敗的場景產生人話錯誤訊息：偵測截斷 + 提示重試。
 */
export function formatJsonParseError(
  rawText: string,
  jsonStr: string,
  err: unknown,
): string {
  const errMsg = err instanceof Error ? err.message : String(err);
  const hints: string[] = [];

  // 截斷偵測：常見訊息
  const truncationSignals = [
    'Unexpected end of JSON input',
    'Expected',
    'Unterminated string',
  ];
  const looksTruncated = truncationSignals.some((s) => errMsg.includes(s));

  if (looksTruncated) {
    hints.push(
      'Claude 的回應可能被截斷（原素材太長，超出單次輸出上限）。建議：',
      '  ① 把素材檔切小（單檔 < 8000 字最穩）',
      '  ② 或在 Settings 切到 Sonnet/Haiku 重試（產量較大）',
    );
  }

  const len = jsonStr.length;
  hints.push(`（回應 JSON 共 ${len} 字元，原始文字 ${rawText.length} 字元）`);

  return `JSON 解析失敗：${errMsg}\n${hints.join('\n')}`;
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
