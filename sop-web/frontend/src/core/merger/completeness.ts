import { nanoid } from 'nanoid';
import type { ChangeIntent, IR } from '@/core/ir/schemas';
import { applyChangeIntents } from '@/core/merger/apply';

export type CompletenessIssueType =
  | 'screenshot_outdated'
  | 'glossary_missing'
  | 'reference_broken'
  | 'troubleshooting_orphan'
  | 'training_impact'
  | 'audience_mismatch'
  | 'cross_step_inconsistency';

export type CompletenessSeverity = '低' | '中' | '高';

export interface CompletenessIssue {
  id: string;
  type: CompletenessIssueType;
  severity: CompletenessSeverity;
  description: string;
  /** 受影響的 step_id / trouble_id 等 */
  targetId?: string;
  /** 觸發的 intent_id（如有） */
  relatedIntentId?: string;
  suggestion?: string;
}

/**
 * 7 種完整性問題偵測。所有檢查都是純結構性，不需 LLM。
 *
 * 設計原則：
 * - 偵測「套用 intents 之後」會出現的問題（先 simulate apply，再檢查）
 * - 對檢查不到的曖昧情境（如 audience_mismatch）保守標警，避免誤報
 */
export function detectCompletenessIssues(
  baseIr: IR,
  intents: ChangeIntent[],
): CompletenessIssue[] {
  const issues: CompletenessIssue[] = [];

  // ---- 模擬套用 ----
  let projected: IR;
  try {
    const result = applyChangeIntents(baseIr, intents, {
      newVersion: bumpForSimulation(baseIr.version),
      updatedAt: baseIr.meta.updated_at,
    });
    projected = result.ir;
  } catch {
    // 套用失敗就跳過（其他層會處理）
    return issues;
  }

  // ---- 1. screenshot_outdated ----
  // 規則：modify_step 後 step 仍有 screenshot_refs，但 intents 中沒有對應的 replace_screenshot
  const replaceScreenshotByStep = new Set(
    intents
      .filter((i) => i.type === 'replace_screenshot' && i.target.step_id)
      .map((i) => i.target.step_id as string),
  );
  for (const intent of intents) {
    if (intent.type !== 'modify_step' || !intent.target.step_id) continue;
    const stepId = intent.target.step_id;
    const step = projected.steps.find((s) => s.step_id === stepId);
    if (!step) continue;
    const hasScreenshot = step.actions.some(
      (a) => a.screenshot_refs && a.screenshot_refs.length > 0,
    );
    if (!hasScreenshot) continue;
    if (replaceScreenshotByStep.has(stepId)) continue;
    issues.push({
      id: `issue-${nanoid(10)}`,
      type: 'screenshot_outdated',
      severity: '高',
      description: `${step.title}（${stepId}）的文字已修改，但截圖未隨之更新`,
      targetId: stepId,
      relatedIntentId: intent.intent_id,
      suggestion:
        '上傳新版截圖、保留舊圖標記為「待更新」、或忽略此提醒',
    });
  }

  // ---- 2. glossary_missing ----
  // 規則：intents 內出現但既有 glossary 沒收錄、且這次也沒 add_glossary 的「術語候選」
  const existingTerms = new Set(
    (projected.glossary ?? []).map((g) => g.term.toLowerCase()),
  );
  // 收集 intents 文字中可能的術語（簡單 heuristic：英文大寫詞 + 連字組）
  const termCandidates = new Set<string>();
  const TERM_RE = /\b([A-Z][A-Za-z0-9]+(?:[ -][A-Z][A-Za-z0-9]+)*)\b/g;
  for (const i of intents) {
    if (i.type === 'add_glossary' || i.type === 'modify_glossary') continue;
    const text = `${i.description} ${i.after ?? ''}`;
    for (const m of text.matchAll(TERM_RE)) {
      const term = m[1]!;
      // 過濾掉常見英文單字（簡化：只收長度 ≥ 3 的）
      if (term.length < 3) continue;
      if (!existingTerms.has(term.toLowerCase())) termCandidates.add(term);
    }
  }
  // 候選太多就只取前 5 個提醒，避免炸 UI
  const limited = [...termCandidates].slice(0, 5);
  for (const term of limited) {
    issues.push({
      id: `issue-${nanoid(10)}`,
      type: 'glossary_missing',
      severity: '中',
      description: `變更內容提到「${term}」，但未收錄於術語表`,
      suggestion: '若為新術語請補充定義到 glossary；若已知可忽略',
    });
  }

  // ---- 3. reference_broken ----
  // 規則：被 remove_step 的 step_id 仍被其他 step / troubleshooting 引用
  const removedStepIds = new Set(
    intents
      .filter((i) => i.type === 'remove_step' && i.target.step_id)
      .map((i) => i.target.step_id as string),
  );
  for (const stepId of removedStepIds) {
    const refs: string[] = [];
    projected.steps.forEach((s) => {
      const all = [
        ...s.actions.flatMap((a) => [a.text, a.command ?? '']),
        s.purpose ?? '',
        s.expected_result ?? '',
        ...(s.tips ?? []),
        ...(s.warnings ?? []),
      ].join(' ');
      if (all.includes(stepId)) refs.push(`step:${s.step_id}`);
    });
    if (refs.length > 0) {
      issues.push({
        id: `issue-${nanoid(10)}`,
        type: 'reference_broken',
        severity: '高',
        description: `${stepId} 已被刪除，但仍被引用：${refs.join(', ')}`,
        targetId: stepId,
        suggestion: '更新引用方的描述，移除對已刪除步驟的指涉',
      });
    }
  }

  // ---- 4. troubleshooting_orphan ----
  // 規則：troubleshooting.related_step_ids 中含已刪除的 step_id
  const allStepIds = new Set(projected.steps.map((s) => s.step_id));
  (projected.troubleshooting ?? []).forEach((t) => {
    const orphans = (t.related_step_ids ?? []).filter((id) => !allStepIds.has(id));
    if (orphans.length > 0) {
      issues.push({
        id: `issue-${nanoid(10)}`,
        type: 'troubleshooting_orphan',
        severity: '中',
        description: `troubleshooting「${t.symptom}」（${t.id}）關聯到已不存在的步驟：${orphans.join(', ')}`,
        targetId: t.id,
        suggestion: '更新 troubleshooting 的 related_step_ids，或移除此項目',
      });
    }
  });

  // ---- 5. training_impact ----
  // 規則：任何 intent 標 needs_retraining 或 breaking_change → 一張高嚴重度提醒
  const trainingTriggers = intents.filter(
    (i) => i.impact?.needs_retraining === true || i.impact?.breaking_change === true,
  );
  if (trainingTriggers.length > 0) {
    issues.push({
      id: `issue-${nanoid(10)}`,
      type: 'training_impact',
      severity: '高',
      description: `本次變更含 ${trainingTriggers.length} 項可能需要重新訓練的內容`,
      suggestion: '確認是否需要安排重新訓練 / 通知執行者',
    });
  }

  // ---- 6. audience_mismatch ----
  // 規則：intents 描述的詞彙顯著難於 target_audience（heuristic：含 ≥ 2 個底層術語但 audience 標「初級 / 業務 / 客服」）
  const audience = projected.meta.target_audience.toLowerCase();
  const noviceMarkers = ['初級', '入門', '新人', '業務', '客服', 'support', 'sales', 'beginner'];
  const isNovice = noviceMarkers.some((m) => audience.includes(m));
  if (isNovice) {
    const TECH_RE = /\b(api|cli|ssh|tls|dns|iam|vpc|vpn|jwt|oauth|sdk|grpc|http(?:s)?|tcp|udp|kubernetes|docker|terraform)\b/gi;
    let techHits = 0;
    for (const i of intents) {
      const text = `${i.description} ${i.after ?? ''}`;
      const m = text.match(TECH_RE);
      if (m) techHits += m.length;
    }
    if (techHits >= 2) {
      issues.push({
        id: `issue-${nanoid(10)}`,
        type: 'audience_mismatch',
        severity: '低',
        description: `適用對象為「${projected.meta.target_audience}」，但變更內容含較多技術術語（命中 ${techHits} 次）`,
        suggestion: '建議檢查是否需要簡化或加上術語表',
      });
    }
  }

  // ---- 7. cross_step_inconsistency ----
  // 規則：同一個術語在不同 step 的 modify 後文字中拼法不一致（例：IAM Role / IAM 角色 / iam-role）
  const variantBuckets = new Map<string, Set<string>>();
  for (const i of intents) {
    if (i.type !== 'modify_step' && i.type !== 'add_step') continue;
    const text = `${i.description} ${i.after ?? ''}`;
    for (const m of text.matchAll(/\b([A-Z][A-Za-z]+(?:[ -][A-Z][A-Za-z]+)+)\b/g)) {
      const variant = m[1]!;
      const key = variant.toLowerCase().replace(/[\s-]/g, '');
      if (!variantBuckets.has(key)) variantBuckets.set(key, new Set());
      variantBuckets.get(key)!.add(variant);
    }
  }
  for (const [, variants] of variantBuckets) {
    if (variants.size >= 2) {
      issues.push({
        id: `issue-${nanoid(10)}`,
        type: 'cross_step_inconsistency',
        severity: '低',
        description: `跨步驟出現同義不同寫法：${[...variants].join(' / ')}`,
        suggestion: '建議統一用詞（採用術語表或最常用寫法）',
      });
    }
  }

  return issues;
}

function bumpForSimulation(version: string): string {
  // 模擬用，回 patch+1；具體 bump 由 caller 決定
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return version;
  return `${m[1]}.${m[2]}.${parseInt(m[3]!, 10) + 1}`;
}
