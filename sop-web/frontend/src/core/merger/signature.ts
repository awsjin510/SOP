import type { ChangeIntent } from '@/core/ir/schemas';
import { normalizeForCompare } from '@/core/merger/similarity';

/**
 * Group key for an intent — same signature means "potentially the same change".
 *
 * 規則：
 * - type 相同
 * - target 的關鍵 ID（step_id / trouble_id / term_id / section_id）相同
 * - 如果都沒有 ID（例：add_step），用 description 的正規化前綴當代理鍵
 * - 對 modify_step 等同 step_id 的多個 intent，再以 target.field 區隔（可能改不同欄位）
 */
export function intentSignature(intent: ChangeIntent): string {
  const t = intent.target;
  const ids = [
    t.step_id ?? '',
    t.trouble_id ?? '',
    t.term_id ?? '',
    t.section_id ?? '',
    t.field ?? '',
  ].join('|');

  if (ids.replace(/\|/g, '').length === 0) {
    // 無 ID（多半 add_*）：用描述前 60 字當代理鍵
    const desc = normalizeForCompare(intent.description).slice(0, 60);
    return `${intent.type}|nodescID|${desc}`;
  }
  return `${intent.type}|${ids}`;
}
