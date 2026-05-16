/**
 * Lightweight text similarity utilities used by the merger.
 *
 * 不仰賴 LLM；純結構性比較。
 * - normalize：忽略大小寫、全/半形空白、標點。
 * - jaccard：以 word/char-bigram 集合的交集除以聯集。中文以 char-bigram 為主。
 */

export function normalizeForCompare(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/[，。、；：！？「」『』（）()【】\[\]『』""''`~,.!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokens(input: string): Set<string> {
  const norm = normalizeForCompare(input);
  if (!norm) return new Set();
  // Mix word tokens (英數) + 中文 bigram，能同時處理中英混雜文字
  const words = norm.match(/[a-z0-9]+/g) ?? [];
  const cjk = norm.replace(/[^一-鿿]+/g, '');
  const bigrams: string[] = [];
  for (let i = 0; i + 2 <= cjk.length; i++) {
    bigrams.push(cjk.slice(i, i + 2));
  }
  return new Set([...words, ...bigrams]);
}

export function jaccardSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 兩個 intent 的「after」文字是否視為一致 */
export function isAfterConsistent(a: string, b: string, threshold = 0.7): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na === nb) return true;
  return jaccardSimilarity(a, b) >= threshold;
}
