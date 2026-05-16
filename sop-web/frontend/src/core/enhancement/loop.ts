import { nanoid } from 'nanoid';
import type { IR, GlossaryTerm, SourceRef, ExtractorType } from '@/core/ir/schemas';
import { callClaude, FAST_MODEL } from '@/services/claude';
import { extractJsonBlock } from '@/core/extractors/helpers';
import {
  type EnhancerAction,
  type EnhancementResult,
  type EnhancementRoundLog,
  type Issue,
  type ReviewerDecision,
  EnhancerOutputSchema,
  NewbieOutputSchema,
  ReviewerOutputSchema,
} from '@/core/enhancement/types';
import newbieSystemPrompt from '@/core/prompts/newbie-system.md?raw';
import enhancerSystemPrompt from '@/core/prompts/enhancer-system.md?raw';
import reviewerSystemPrompt from '@/core/prompts/reviewer-system.md?raw';

export interface SourceMaterial {
  source_file: string;
  extractor_type: ExtractorType;
  /** 純文字內容（截圖則用 description + ui_elements 拼接） */
  text: string;
}

export interface EnhancementOptions {
  maxRounds?: number;
  /** 每個 source material 內容截斷上限，避免 prompt 爆炸 */
  maxSourceCharsEach?: number;
  onRoundComplete?: (round: EnhancementRoundLog) => void;
}

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_MAX_SOURCE_CHARS = 4000;

/**
 * 內訓增強迴圈：小新 → 小修 → 小審。
 * 直接 mutate ir，回傳統計資料 + 各輪 log。
 */
export async function runEnhancementLoop(
  ir: IR,
  sources: SourceMaterial[],
  options: EnhancementOptions = {},
): Promise<EnhancementResult> {
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const maxChars = options.maxSourceCharsEach ?? DEFAULT_MAX_SOURCE_CHARS;
  const truncatedSources = sources.map((s) => ({
    ...s,
    text: truncate(s.text, maxChars),
  }));

  const rounds: EnhancementRoundLog[] = [];
  let totalApplied = 0;
  let apiCalls = 0;

  for (let r = 1; r <= maxRounds; r++) {
    // ---- Newbie ----
    const issues = await callNewbie(ir);
    apiCalls += 1;
    if (issues.length === 0) {
      // 沒新問題 → 結束
      break;
    }

    // ---- Enhancer ----
    const actions = await callEnhancer(ir, issues, truncatedSources);
    apiCalls += 1;
    if (actions.length === 0) {
      rounds.push({
        round: r,
        issues,
        actions: [],
        decisions: [],
        appliedActionIds: [],
      });
      break;
    }

    // ---- Reviewer ----
    const decisions = await callReviewer(ir, issues, actions, truncatedSources);
    apiCalls += 1;

    // ---- Apply approved/modified ----
    const appliedIds = applyEnhancementActions(ir, actions, decisions);
    totalApplied += appliedIds.length;

    const log: EnhancementRoundLog = {
      round: r,
      issues,
      actions,
      decisions,
      appliedActionIds: appliedIds,
    };
    rounds.push(log);
    options.onRoundComplete?.(log);

    // 如果這輪沒套用任何 action，後面再跑也沒意義
    if (appliedIds.length === 0) break;
  }

  return { appliedActionsCount: totalApplied, rounds, apiCalls };
}

// ============================================================
// Role callers
// ============================================================

async function callNewbie(ir: IR): Promise<Issue[]> {
  try {
    const response = await callClaude({
      system: newbieSystemPrompt,
      // Newbie 需要理解能力，用預設 Opus 比較穩
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `以下是 SOP IR，請以新人視角找問題：\n\n\`\`\`json\n${JSON.stringify(ir)}\n\`\`\``,
        },
      ],
    });
    const json = extractJsonBlock(response.text);
    if (!json) return [];
    const parsed = NewbieOutputSchema.parse(JSON.parse(json));
    return parsed.issues;
  } catch (err) {
    console.warn('[enhancement] newbie failed', err);
    return [];
  }
}

async function callEnhancer(
  ir: IR,
  issues: Issue[],
  sources: SourceMaterial[],
): Promise<EnhancerAction[]> {
  try {
    const userMessage = [
      '## 完整 IR',
      '```json',
      JSON.stringify(ir),
      '```',
      '',
      '## 小新提的問題',
      '```json',
      JSON.stringify({ issues }),
      '```',
      '',
      '## 原素材片段',
      ...sources.map(
        (s, i) =>
          `### Source ${i}: ${s.source_file} (${s.extractor_type})\n${s.text}`,
      ),
    ].join('\n');

    const response = await callClaude({
      system: enhancerSystemPrompt,
      max_tokens: 4096,
      messages: [{ role: 'user', content: userMessage }],
    });
    const json = extractJsonBlock(response.text);
    if (!json) return [];
    const parsed = EnhancerOutputSchema.parse(JSON.parse(json));
    return parsed.actions;
  } catch (err) {
    console.warn('[enhancement] enhancer failed', err);
    return [];
  }
}

async function callReviewer(
  ir: IR,
  issues: Issue[],
  actions: EnhancerAction[],
  sources: SourceMaterial[],
): Promise<ReviewerDecision[]> {
  try {
    const userMessage = [
      '## 完整 IR',
      '```json',
      JSON.stringify(ir),
      '```',
      '',
      '## 小新的問題',
      '```json',
      JSON.stringify({ issues }),
      '```',
      '',
      '## 小修的補強建議',
      '```json',
      JSON.stringify({ actions }),
      '```',
      '',
      '## 原素材片段（檢查 source_refs 真實性用）',
      ...sources.map(
        (s, i) =>
          `### Source ${i}: ${s.source_file} (${s.extractor_type})\n${s.text}`,
      ),
    ].join('\n');

    const response = await callClaude({
      system: reviewerSystemPrompt,
      // Reviewer 是檢查工作，Haiku 應該夠用
      model: FAST_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: userMessage }],
    });
    const json = extractJsonBlock(response.text);
    if (!json) return [];
    const parsed = ReviewerOutputSchema.parse(JSON.parse(json));
    return parsed.decisions;
  } catch (err) {
    console.warn('[enhancement] reviewer failed', err);
    return [];
  }
}

// ============================================================
// Apply
// ============================================================

/**
 * 把通過 review 的 actions 套用到 IR。回傳實際被套用的 action.id。
 * IR 是被 mutate 的（呼叫端應該複製如果不希望被改）。
 */
export function applyEnhancementActions(
  ir: IR,
  actions: EnhancerAction[],
  decisions: ReviewerDecision[],
): string[] {
  const decisionsByActionId = new Map(decisions.map((d) => [d.action_id, d]));
  const appliedIds: string[] = [];

  const stepIndex = new Map(ir.steps.map((s, i) => [s.step_id, i]));

  for (const action of actions) {
    const decision = decisionsByActionId.get(action.id);
    if (!decision) continue;
    if (decision.decision === 'reject') continue;

    // 'modify' 允許 reviewer 改 payload
    const payload =
      decision.decision === 'modify' && decision.modification?.payload
        ? { ...action.payload, ...decision.modification.payload }
        : action.payload;

    const sourceRefs = action.source_refs as readonly SourceRef[];
    const idx = action.target_step_id ? stepIndex.get(action.target_step_id) : undefined;
    const targetStep = idx !== undefined ? ir.steps[idx] : undefined;

    let applied = false;

    switch (action.type) {
      case 'add_tip': {
        if (!targetStep || typeof payload['text'] !== 'string') break;
        targetStep.tips = [...(targetStep.tips ?? []), payload['text'] as string];
        // tips 是 string[]，無欄位攜帶 source_refs；把 refs 加到 step.source_refs
        targetStep.source_refs = mergeSourceRefs(targetStep.source_refs, sourceRefs);
        applied = true;
        break;
      }
      case 'add_warning': {
        if (!targetStep || typeof payload['text'] !== 'string') break;
        targetStep.warnings = [
          ...(targetStep.warnings ?? []),
          payload['text'] as string,
        ];
        targetStep.source_refs = mergeSourceRefs(targetStep.source_refs, sourceRefs);
        applied = true;
        break;
      }
      case 'set_purpose': {
        if (!targetStep || targetStep.purpose) break; // 不覆寫
        if (typeof payload['text'] !== 'string') break;
        targetStep.purpose = payload['text'] as string;
        targetStep.source_refs = mergeSourceRefs(targetStep.source_refs, sourceRefs);
        applied = true;
        break;
      }
      case 'set_expected_result': {
        if (!targetStep || targetStep.expected_result) break;
        if (typeof payload['text'] !== 'string') break;
        targetStep.expected_result = payload['text'] as string;
        targetStep.source_refs = mergeSourceRefs(targetStep.source_refs, sourceRefs);
        applied = true;
        break;
      }
      case 'add_glossary_term': {
        const term = payload['term'];
        const definition = payload['definition'];
        if (typeof term !== 'string' || typeof definition !== 'string') break;
        const aliases = Array.isArray(payload['aliases'])
          ? (payload['aliases'] as string[]).filter((a) => typeof a === 'string')
          : undefined;
        const newTerm: GlossaryTerm = {
          id: `term-${nanoid(10)}`,
          term,
          definition,
          ...(aliases ? { aliases } : {}),
        };
        // 同名術語不重複加
        const existingTerms = ir.glossary ?? [];
        if (existingTerms.some((g) => g.term.trim() === term.trim())) break;
        ir.glossary = [...existingTerms, newTerm];
        applied = true;
        break;
      }
      case 'mark_needs_human_input': {
        if (!targetStep) break;
        targetStep.needs_human_input = true;
        const reason = payload['reason'];
        if (typeof reason === 'string' && reason.trim().length > 0) {
          targetStep.human_input_reason = reason;
        }
        applied = true;
        break;
      }
      case 'noop':
        // 設計上會 approve 但不做事
        applied = true;
        break;
    }

    if (applied) appliedIds.push(action.id);
  }

  return appliedIds;
}

// ============================================================
// Helpers
// ============================================================

function mergeSourceRefs(
  existing: readonly SourceRef[],
  added: readonly SourceRef[],
): SourceRef[] {
  const seen = new Set(
    existing.map((r) => `${r.source_file}|${r.location ?? ''}|${r.excerpt ?? ''}`),
  );
  const out = [...existing];
  for (const r of added) {
    const key = `${r.source_file}|${r.location ?? ''}|${r.excerpt ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n…（已截斷）';
}
