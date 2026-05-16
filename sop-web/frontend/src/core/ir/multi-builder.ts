import { z } from 'zod';
import { IrSchema, type IR, type Step, type Action } from '@/core/ir/schemas';
import type { TranscriptPayload } from '@/core/extractors/transcript';
import type { DocumentPayload } from '@/core/extractors/document';
import type { ScreenshotPayload } from '@/core/extractors/screenshot';
import type { SingleSourceBuildOptions } from '@/core/ir/builder';
import { extractJsonBlock } from '@/core/extractors/helpers';
import { callClaude, FAST_MODEL } from '@/services/claude';
import dedupSystemPrompt from '@/core/prompts/dedup-system.md?raw';
import pairSystemPrompt from '@/core/prompts/screenshot-pair-system.md?raw';

// ============================================================
// Public API
// ============================================================

export interface MultiSourceInputs {
  transcripts: TranscriptPayload[];
  documents: DocumentPayload[];
  screenshots: ScreenshotPayload[];
}

export interface BuildMultiOptions extends SingleSourceBuildOptions {
  /** 是否用 Claude 做去重；無 transcript+document 同時存在時可關 */
  enableDedup?: boolean;
  /** 是否用 Claude 配對截圖到步驟 */
  enableScreenshotPairing?: boolean;
}

export interface MultiBuildResult {
  ir: IR;
  /** 配對後仍未指派的 image_id（可放入 SOP 附錄或之後人工處理） */
  unassignedImageIds: string[];
  /** 使用了多少次 Claude 呼叫 */
  apiCalls: number;
}

/**
 * 多源 IR 建構：去重 + 截圖配對 + 章節整合。
 */
export async function buildIrFromMultiSource(
  inputs: MultiSourceInputs,
  options: BuildMultiOptions,
): Promise<MultiBuildResult> {
  let apiCalls = 0;

  // ---- 1. 整合 sections ----
  const sections = reconcileSections(inputs);

  // ---- 2. 收集所有 steps（標記來源 ref）----
  type Tagged = { ref: string; step: Step };
  const tagged: Tagged[] = [];
  inputs.transcripts.forEach((p, t) =>
    p.steps.forEach((s, i) => tagged.push({ ref: `T${t}_${i}`, step: s })),
  );
  inputs.documents.forEach((p, d) =>
    p.steps.forEach((s, i) => tagged.push({ ref: `D${d}_${i}`, step: s })),
  );

  // ---- 3. 去重（多源同一動作合併）----
  let mergedSteps: Step[] = tagged.map((t) => t.step);
  if (
    options.enableDedup !== false &&
    inputs.transcripts.length + inputs.documents.length > 1 &&
    tagged.length > 1
  ) {
    const groups = await callDedup(tagged);
    apiCalls += 1;
    if (groups) {
      mergedSteps = applyDedup(tagged, groups);
    }
  }

  // ---- 4. 截圖配對 ----
  let assignedSteps = mergedSteps;
  let unassignedImageIds: string[] = inputs.screenshots.map((s) => s.image_id);
  if (options.enableScreenshotPairing !== false && inputs.screenshots.length > 0) {
    const pairing = await callScreenshotPairing(mergedSteps, inputs.screenshots);
    apiCalls += 1;
    if (pairing) {
      const result = applyScreenshotPairing(mergedSteps, inputs.screenshots, pairing);
      assignedSteps = result.steps;
      unassignedImageIds = result.unassigned;
    }
  }

  // ---- 5. 把 step 重新指派 section（修正 dedup 後 section_id 可能消失）----
  const validSectionIds = new Set(sections.map((s) => s.id));
  const fallbackSectionId = sections[0]!.id;
  assignedSteps = assignedSteps.map((s) =>
    validSectionIds.has(s.section_id) ? s : { ...s, section_id: fallbackSectionId },
  );

  // ---- 6. 整合 troubleshooting + glossary（簡單合併）----
  const troubleshooting = [
    ...inputs.transcripts.flatMap((p) => p.troubleshooting),
    ...inputs.documents.flatMap((p) => p.troubleshooting),
  ];
  const glossary = dedupGlossaryByTerm([
    ...inputs.transcripts.flatMap((p) => p.glossary),
    ...inputs.documents.flatMap((p) => p.glossary),
  ]);

  // ---- 7. 組成 IR ----
  const ir: IR = {
    schema_version: '1.0.0',
    version: '1.0.0',
    meta: {
      sop_id: options.sopId,
      title: options.title,
      ...(options.category ? { category: options.category } : {}),
      ...(options.tags ? { tags: options.tags } : {}),
      target_audience: options.targetAudience,
      ...(options.estimatedDurationMinutes
        ? { estimated_duration_minutes: options.estimatedDurationMinutes }
        : {}),
      ...(options.difficulty ? { difficulty: options.difficulty } : {}),
      authors: options.authors,
      created_at: options.createdAt,
      updated_at: options.updatedAt,
    },
    sections,
    steps: assignedSteps,
    ...(troubleshooting.length > 0 ? { troubleshooting } : {}),
    ...(glossary.length > 0 ? { glossary } : {}),
  };

  return {
    ir: IrSchema.parse(ir),
    unassignedImageIds,
    apiCalls,
  };
}

// ============================================================
// Helpers (exported for tests)
// ============================================================

export function reconcileSections(inputs: MultiSourceInputs): IR['sections'] {
  const all = [
    ...inputs.transcripts.flatMap((p) => p.sections),
    ...inputs.documents.flatMap((p) => p.sections),
  ];
  if (all.length === 0) {
    return [{ id: 'section-main', title: '主要步驟', order: 0 }];
  }
  // 去重：相同 id 保留第一個
  const seen = new Map<string, IR['sections'][number]>();
  for (const s of all) {
    if (!seen.has(s.id)) seen.set(s.id, s);
  }
  return Array.from(seen.values()).sort((a, b) => a.order - b.order);
}

export function dedupGlossaryByTerm(
  glossaries: IR['glossary'] extends infer G ? (G extends Array<infer X> ? X[] : never) : never,
): IR['glossary'] extends infer G ? (G extends Array<infer X> ? X[] : never) : never {
  const seen = new Map<string, (typeof glossaries)[number]>();
  for (const g of glossaries) {
    const key = g.term.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, g);
  }
  return Array.from(seen.values()) as typeof glossaries;
}

// ============================================================
// Dedup
// ============================================================

const DedupGroupSchema = z.object({
  merged_title: z.string(),
  members: z.array(z.string()).min(1),
  preferred_ref: z.string(),
  rationale: z.string().optional(),
});
const DedupOutputSchema = z.object({
  groups: z.array(DedupGroupSchema),
});
type DedupGroup = z.infer<typeof DedupGroupSchema>;

async function callDedup(
  tagged: Array<{ ref: string; step: Step }>,
): Promise<DedupGroup[] | null> {
  const stepsJson = tagged.map((t) => ({
    ref: t.ref,
    title: t.step.title,
    purpose: t.step.purpose ?? '',
  }));
  const userMessage = JSON.stringify({ steps: stepsJson });
  try {
    const response = await callClaude({
      system: dedupSystemPrompt,
      // Haiku 對於這種結構化 reasoning 夠用，省錢
      model: FAST_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: userMessage }],
    });
    const json = extractJsonBlock(response.text);
    if (!json) return null;
    const parsed = DedupOutputSchema.parse(JSON.parse(json));
    return parsed.groups;
  } catch (err) {
    console.warn('[multi-builder] dedup failed; skipping', err);
    return null;
  }
}

export function applyDedup(
  tagged: Array<{ ref: string; step: Step }>,
  groups: DedupGroup[],
): Step[] {
  const byRef = new Map(tagged.map((t) => [t.ref, t.step]));
  const usedRefs = new Set<string>();
  const out: Step[] = [];

  for (const g of groups) {
    const validMembers = g.members.filter((m) => byRef.has(m));
    if (validMembers.length === 0) continue;
    const preferred =
      validMembers.find((m) => m === g.preferred_ref) ?? validMembers[0]!;
    const base = byRef.get(preferred)!;
    const merged = mergeSteps(
      validMembers.map((m) => byRef.get(m)!),
      base,
    );
    out.push(merged);
    validMembers.forEach((m) => usedRefs.add(m));
  }

  // 任何沒在 group 中出現的 step（model 漏了）也要保留
  for (const t of tagged) {
    if (!usedRefs.has(t.ref)) out.push(t.step);
  }
  return out;
}

/** 多個語意相同的 step 合併：保留 base 的 step_id 與骨架，source_refs 全部累加，欄位取較完整者 */
export function mergeSteps(allMembers: Step[], base: Step): Step {
  const allSourceRefs = allMembers.flatMap((m) => m.source_refs);
  const others = allMembers.filter((m) => m !== base);

  const merged: Step = {
    ...base,
    source_refs: dedupSourceRefs([...base.source_refs, ...allSourceRefs]),
  };

  // 欄位補齊：base 缺則從其他成員補
  for (const o of others) {
    if (!merged.purpose && o.purpose) merged.purpose = o.purpose;
    if (!merged.expected_result && o.expected_result)
      merged.expected_result = o.expected_result;
    if ((!merged.preconditions || merged.preconditions.length === 0) && o.preconditions)
      merged.preconditions = [...o.preconditions];
    merged.tips = uniqueStrings([...(merged.tips ?? []), ...(o.tips ?? [])]);
    merged.warnings = uniqueStrings([
      ...(merged.warnings ?? []),
      ...(o.warnings ?? []),
    ]);
    merged.common_mistakes = uniqueStrings([
      ...(merged.common_mistakes ?? []),
      ...(o.common_mistakes ?? []),
    ]);
    // actions: 取 base 為主；其他來源的 actions 不合併進來避免重複
  }

  // 多源印證：信心提升（base + 0.05 * 其他來源數，capped 0.95）
  if (others.length > 0) {
    const baseConf = base.confidence ?? 0.7;
    merged.confidence = Math.min(0.95, baseConf + 0.05 * others.length);
  }

  // 清掉空陣列
  if (merged.tips && merged.tips.length === 0) delete (merged as Partial<Step>).tips;
  if (merged.warnings && merged.warnings.length === 0)
    delete (merged as Partial<Step>).warnings;
  if (merged.common_mistakes && merged.common_mistakes.length === 0)
    delete (merged as Partial<Step>).common_mistakes;

  return merged;
}

function dedupSourceRefs(refs: Step['source_refs']): Step['source_refs'] {
  const seen = new Set<string>();
  const out: Step['source_refs'] = [];
  for (const r of refs) {
    const key = `${r.source_file}|${r.location ?? ''}|${r.excerpt ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function uniqueStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

// ============================================================
// Screenshot pairing
// ============================================================

const PairingOutputSchema = z.object({
  assignments: z.array(
    z.object({
      step_id: z.string(),
      image_ids: z.array(z.string()),
    }),
  ),
  unassigned: z.array(z.string()).default([]),
});

async function callScreenshotPairing(
  steps: Step[],
  screenshots: ScreenshotPayload[],
): Promise<z.infer<typeof PairingOutputSchema> | null> {
  const stepsJson = steps.map((s) => ({
    step_id: s.step_id,
    title: s.title,
    first_action: s.actions[0]?.text ?? '',
  }));
  const screensJson = screenshots.map((s) => ({
    image_id: s.image_id,
    description: s.description,
    ui_elements: s.ui_elements,
    likely_step_titles: s.likely_step_titles,
  }));

  try {
    const response = await callClaude({
      system: pairSystemPrompt,
      model: FAST_MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ steps: stepsJson, screenshots: screensJson }),
        },
      ],
    });
    const json = extractJsonBlock(response.text);
    if (!json) return null;
    return PairingOutputSchema.parse(JSON.parse(json));
  } catch (err) {
    console.warn('[multi-builder] screenshot pairing failed; skipping', err);
    return null;
  }
}

export function applyScreenshotPairing(
  steps: Step[],
  screenshots: ScreenshotPayload[],
  pairing: z.infer<typeof PairingOutputSchema>,
): { steps: Step[]; unassigned: string[] } {
  const screensById = new Map(screenshots.map((s) => [s.image_id, s]));
  const stepIndex = new Map(steps.map((s, i) => [s.step_id, i]));

  const updated = steps.map((s) => ({ ...s }));

  for (const assn of pairing.assignments) {
    const idx = stepIndex.get(assn.step_id);
    if (idx === undefined) continue;
    const step = updated[idx]!;
    // 把 image_id 加到第一個 action 的 screenshot_refs（W4 簡化策略；
    // W5 可改為附在指定 action）
    const validImageIds = assn.image_ids.filter((id) => screensById.has(id));
    if (validImageIds.length === 0) continue;
    if (step.actions.length === 0) {
      // 沒 action 時加一個含截圖參考的 placeholder
      step.actions = [{ text: '（參考截圖）', screenshot_refs: validImageIds }];
    } else {
      const first = step.actions[0]!;
      const merged: Action = {
        ...first,
        screenshot_refs: Array.from(
          new Set([...(first.screenshot_refs ?? []), ...validImageIds]),
        ),
      };
      step.actions = [merged, ...step.actions.slice(1)];
    }
  }

  return { steps: updated, unassigned: pairing.unassigned ?? [] };
}
