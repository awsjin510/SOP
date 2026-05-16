import { nanoid } from 'nanoid';
import type { ChangeIntent, IR } from '@/core/ir/schemas';
import { isAfterConsistent } from '@/core/merger/similarity';
import { intentSignature } from '@/core/merger/signature';

export type ConflictType =
  | 'source_contradiction'
  | 'temporal_conflict'
  | 'semantic_inconsistency';

export interface Conflict {
  id: string;
  type: ConflictType;
  description: string;
  /** 牽涉的 intents（衝突候選） */
  options: ChangeIntent[];
  /** 推薦的選項 index（在 options 陣列中） */
  recommendedOptionIndex?: number;
  rationale?: string;
}

/**
 * 偵測 3 類衝突：
 *
 * 1. source_contradiction：多份來源針對同個目標給出不同的 after
 * 2. temporal_conflict：同一來源前後對同一目標表達不同的 after（excerpt 不同段落）
 * 3. semantic_inconsistency：與既有 IR 邏輯不相容（如 remove_step 仍被引用）
 */
export function detectConflicts(
  intents: ChangeIntent[],
  baseIr?: IR,
): Conflict[] {
  const conflicts: Conflict[] = [];

  // ---- 1 & 2：以 (type + target) 分組，比 after ----
  const groups = new Map<string, ChangeIntent[]>();
  for (const i of intents) {
    const key = intentSignature(i);
    const arr = groups.get(key);
    if (arr) arr.push(i);
    else groups.set(key, [i]);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    // 用 after（或 description）作為衝突判斷字串
    const text = (i: ChangeIntent) => i.after ?? i.description ?? '';
    const head = group[0]!;
    const headTxt = text(head);
    const allConsistent = group.every((g) => isAfterConsistent(headTxt, text(g)));
    if (allConsistent) continue;

    // 檢查是否來自同一份來源檔（temporal_conflict）
    const sourceFiles = new Set(
      group.flatMap((i) => i.source_refs.map((r) => r.source_file)),
    );
    const isTemporal =
      sourceFiles.size === 1 &&
      // 來源檔相同但 source_refs.location（段落）不同 → 同檔前後矛盾
      new Set(
        group.flatMap((i) =>
          i.source_refs.map((r) => `${r.source_file}|${r.location ?? ''}`),
        ),
      ).size > 1;

    const recommendedIdx = pickRecommendedIndex(group);

    conflicts.push({
      id: `conflict-${nanoid(10)}`,
      type: isTemporal ? 'temporal_conflict' : 'source_contradiction',
      description: isTemporal
        ? `同一來源（${[...sourceFiles].join(', ')}）對同一目標出現前後矛盾的描述`
        : `${sourceFiles.size} 份素材對同一目標給出不一致的內容`,
      options: group,
      recommendedOptionIndex: recommendedIdx,
      rationale: '預設採用信心最高 / 最新的 intent；可由人工複核選擇。',
    });
  }

  // ---- 3：semantic_inconsistency 與既有 IR 的依賴關係 ----
  if (baseIr) {
    const removingStepIds = new Set(
      intents
        .filter((i) => i.type === 'remove_step' && i.target.step_id)
        .map((i) => i.target.step_id as string),
    );
    if (removingStepIds.size > 0) {
      // 收集既有 IR 中對這些 step 的引用
      for (const stepId of removingStepIds) {
        const referrers: string[] = [];

        // troubleshooting.related_step_ids
        baseIr.troubleshooting?.forEach((t) => {
          if (t.related_step_ids?.includes(stepId)) {
            referrers.push(`troubleshooting:${t.id}`);
          }
        });

        // 其他 step 在 actions.text 中以 step_id 形式直接引用（少見但保險檢查）
        baseIr.steps.forEach((s) => {
          if (s.step_id === stepId) return;
          const all = [
            ...s.actions.flatMap((a) => [a.text, a.command ?? '']),
            s.purpose ?? '',
            s.expected_result ?? '',
            ...(s.tips ?? []),
            ...(s.warnings ?? []),
          ].join(' ');
          if (all.includes(stepId)) {
            referrers.push(`step:${s.step_id}`);
          }
        });

        if (referrers.length > 0) {
          const removeIntents = intents.filter(
            (i) => i.type === 'remove_step' && i.target.step_id === stepId,
          );
          conflicts.push({
            id: `conflict-${nanoid(10)}`,
            type: 'semantic_inconsistency',
            description: `要求刪除 ${stepId}，但仍被以下項目引用：${referrers.join(', ')}`,
            options: removeIntents,
            rationale: '建議先處理依賴（修改引用方）再刪除步驟。',
          });
        }
      }
    }
  }

  return conflicts;
}

function pickRecommendedIndex(intents: ChangeIntent[]): number {
  // 取信心最高；同分取 source_refs 較多的；再同分取第一個。
  let best = 0;
  for (let i = 1; i < intents.length; i++) {
    const a = intents[best]!;
    const b = intents[i]!;
    if (b.confidence > a.confidence) {
      best = i;
    } else if (b.confidence === a.confidence) {
      if (b.source_refs.length > a.source_refs.length) best = i;
    }
  }
  return best;
}
