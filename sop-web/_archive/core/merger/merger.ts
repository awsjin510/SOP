import { nanoid } from 'nanoid';
import type { ChangeIntent, IR } from '@/core/ir/schemas';

type IntentSourceRef = ChangeIntent['source_refs'][number];
import { isAfterConsistent } from '@/core/merger/similarity';
import { intentSignature } from '@/core/merger/signature';
import { detectConflicts, type Conflict } from '@/core/merger/conflict';
import {
  detectCompletenessIssues,
  type CompletenessIssue,
} from '@/core/merger/completeness';

export interface MergeResult {
  /** 去重 + 多源印證後的 intents（merged，未含落入衝突的那些） */
  intents: ChangeIntent[];
  /** 偵測到的衝突，**衝突中的 intents 不會出現在 intents** 陣列中 */
  conflicts: Conflict[];
  completenessIssues: CompletenessIssue[];
  /** 統計：原始扁平化前的數量 / 合併後 / 落入衝突 */
  stats: {
    rawCount: number;
    mergedCount: number;
    inConflictCount: number;
  };
}

export interface MergeOptions {
  /** 一致性判斷的 Jaccard 門檻（預設 0.7） */
  consistencyThreshold?: number;
  /** 多源印證提升 confidence 的步進（預設 0.05） */
  consensusBoost?: number;
  /** 多源印證提升 confidence 的上限（預設 0.95） */
  confidenceCap?: number;
}

/**
 * 匯流引擎：把多個抽取器產的 raw intents 整合。
 *
 * 流程：
 * 1. 扁平化 + 去明顯重複（同 source_file 同 location 重複抽出 → 視為同一筆）
 * 2. 依 intentSignature 分組
 * 3. 群組內：
 *    - after 一致 → 合併成一筆，source_refs 累加，confidence boost
 *    - after 不一致 → 全部移到 conflicts，主結果集不含
 * 4. 跑衝突偵測（含 semantic_inconsistency 跨 IR 檢查）
 * 5. 跑完整性檢查（7 種）
 */
export function mergeChangeIntents(
  baseIr: IR,
  rawIntents: ChangeIntent[][],
  options: MergeOptions = {},
): MergeResult {
  const threshold = options.consistencyThreshold ?? 0.5;
  const boost = options.consensusBoost ?? 0.05;
  const cap = options.confidenceCap ?? 0.95;

  // ---- 1. 扁平化 + 去重複 source_ref ----
  const flat: ChangeIntent[] = [];
  for (const arr of rawIntents) flat.push(...arr);
  const rawCount = flat.length;

  // ---- 2. 按 signature 分組 ----
  const groups = new Map<string, ChangeIntent[]>();
  for (const intent of flat) {
    const sig = intentSignature(intent);
    const arr = groups.get(sig);
    if (arr) arr.push(intent);
    else groups.set(sig, [intent]);
  }

  // ---- 3. 群組內處理 ----
  const merged: ChangeIntent[] = [];
  const inConflict: ChangeIntent[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }

    // 拿群組中第一筆的 after / description 當基準
    const head = group[0]!;
    const baseTxt = head.after ?? head.description ?? '';
    const allConsistent = group.every((g) =>
      isAfterConsistent(baseTxt, g.after ?? g.description ?? '', threshold),
    );

    if (allConsistent) {
      // 合併
      merged.push(consolidate(group, boost, cap));
    } else {
      // 不一致 → 全部移入 conflicts（將由 detectConflicts 標記類型）
      inConflict.push(...group);
    }
  }

  // ---- 4. 衝突偵測 ----
  // 注意：把 inConflict + merged 都丟進 detector，讓它分類。
  // 不一致群組已經整組移過去，merged 中可能還有 semantic_inconsistency。
  const conflicts = detectConflicts([...merged, ...inConflict], baseIr);

  // 從 merged 移除被 conflicts.options 收編的 intent_id（避免重複套用）
  const conflictedIds = new Set(
    conflicts.flatMap((c) => c.options.map((o) => o.intent_id)),
  );
  const finalMerged = merged.filter((i) => !conflictedIds.has(i.intent_id));

  // ---- 5. 完整性檢查 ----
  const completenessIssues = detectCompletenessIssues(baseIr, finalMerged);

  return {
    intents: finalMerged,
    conflicts,
    completenessIssues,
    stats: {
      rawCount,
      mergedCount: finalMerged.length,
      inConflictCount: conflicts.reduce((acc, c) => acc + c.options.length, 0),
    },
  };
}

/**
 * 把 group 中的 intents 合成一筆：保留 head 的 type/target/after，
 * source_refs 並集，confidence 隨多源印證提升（每多 1 源加 boost，封頂 cap）。
 */
function consolidate(
  group: ChangeIntent[],
  boost: number,
  cap: number,
): ChangeIntent {
  // 排序：先信心高的當主，這樣 description / rationale 會比較穩
  const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
  const head = sorted[0]!;

  // source_refs 並集（依 source_file + location + excerpt 去重）
  const allRefs: IntentSourceRef[] = [];
  const seen = new Set<string>();
  for (const i of sorted) {
    for (const r of i.source_refs) {
      const key = `${r.source_file}|${r.location ?? ''}|${r.excerpt ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allRefs.push({ ...r });
    }
  }

  // 多源印證：每多 1 個獨立來源 +boost
  const distinctSources = new Set(allRefs.map((r) => r.source_file)).size;
  const newConfidence = Math.min(cap, head.confidence + boost * (distinctSources - 1));

  // 合併 impact：欄位 OR
  const impact = mergeImpacts(group);

  return {
    ...head,
    intent_id: `intent-${nanoid(10)}`, // 給合併版新 ID，標示是 merged
    source_refs: allRefs,
    confidence: Number(newConfidence.toFixed(4)),
    ...(impact ? { impact } : {}),
    auto_apply:
      newConfidence >= 0.85 && distinctSources >= 2 && impact?.breaking_change !== true,
  };
}

function mergeImpacts(intents: ChangeIntent[]): ChangeIntent['impact'] | undefined {
  const all = intents.map((i) => i.impact).filter((x): x is NonNullable<typeof x> => !!x);
  if (all.length === 0) return undefined;
  const mergedAffectedSteps = new Set<string>();
  const mergedAffectedSections = new Set<string>();
  let needs_screenshot_update = false;
  let breaking_change = false;
  let needs_retraining = false;
  for (const x of all) {
    x.affected_steps?.forEach((id) => mergedAffectedSteps.add(id));
    x.affected_sections?.forEach((id) => mergedAffectedSections.add(id));
    if (x.needs_screenshot_update) needs_screenshot_update = true;
    if (x.breaking_change) breaking_change = true;
    if (x.needs_retraining) needs_retraining = true;
  }
  return {
    ...(mergedAffectedSteps.size > 0
      ? { affected_steps: [...mergedAffectedSteps] }
      : {}),
    ...(mergedAffectedSections.size > 0
      ? { affected_sections: [...mergedAffectedSections] }
      : {}),
    ...(needs_screenshot_update ? { needs_screenshot_update: true } : {}),
    ...(breaking_change ? { breaking_change: true } : {}),
    ...(needs_retraining ? { needs_retraining: true } : {}),
  };
}
