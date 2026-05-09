import { nanoid } from 'nanoid';
import type {
  ChangeIntent,
  GlossaryTerm,
  IR,
  Section,
  SourceRef,
  Step,
  TroubleshootingItem,
} from '@/core/ir/schemas';

export interface ApplyOptions {
  /** 套用後 IR 的 updated_at（ISO with +08:00） */
  updatedAt: string;
  /** 新版本字串（caller 用 bumpForIntents 算出） */
  newVersion: string;
}

export interface ApplyResult {
  ir: IR;
  applied: ChangeIntent[];
  skipped: Array<{ intent: ChangeIntent; reason: string }>;
}

/**
 * 套用 change_intents 到既有 IR，產出新版本。
 *
 * - **step_id 跨版本不變**（既有 step 的 ID 永遠一樣）
 * - 新增 step / trouble / glossary 用 nanoid 產 ID
 * - 過濾「target 對映不上」的 intents（標到 skipped）
 * - 套用順序：先 add → 再 modify → 最後 remove，避免引用刪除目標
 */
export function applyChangeIntents(
  baseIr: IR,
  intents: ChangeIntent[],
  options: ApplyOptions,
): ApplyResult {
  // 深複製 IR 避免污染原始（structuredClone 在現代瀏覽器都支援）
  const ir: IR = structuredClone(baseIr);
  const applied: ChangeIntent[] = [];
  const skipped: ApplyResult['skipped'] = [];

  // 確保陣列存在
  if (!ir.troubleshooting) ir.troubleshooting = [];
  if (!ir.glossary) ir.glossary = [];

  // 把 intents 依 type 排序（add → modify → add_tip/warning → meta → remove）
  const order: Record<ChangeIntent['type'], number> = {
    add_step: 0,
    add_troubleshooting: 0,
    add_glossary: 0,
    modify_step: 1,
    modify_troubleshooting: 1,
    modify_glossary: 1,
    modify_meta: 1,
    add_tip: 2,
    add_warning: 2,
    replace_screenshot: 2,
    reorder_step: 3,
    remove_step: 4,
    remove_troubleshooting: 4,
  };
  const sorted = [...intents].sort((a, b) => order[a.type] - order[b.type]);

  for (const intent of sorted) {
    const reason = applyOne(ir, intent);
    if (reason) {
      skipped.push({ intent, reason });
    } else {
      applied.push(intent);
    }
  }

  // 把 IR 版本與時間更新
  ir.version = options.newVersion;
  ir.meta.updated_at = options.updatedAt;

  // 若 troubleshooting / glossary 變空就不要保留空陣列（zod schema 是 optional）
  if (ir.troubleshooting.length === 0) delete ir.troubleshooting;
  if (ir.glossary && ir.glossary.length === 0) delete ir.glossary;

  return { ir, applied, skipped };
}

/**
 * 套用單一 intent；若無法套用回傳 reason 字串，成功則回傳 null。
 * 注意：mutates `ir`。
 */
function applyOne(ir: IR, intent: ChangeIntent): string | null {
  const t = intent.type;
  const target = intent.target;
  const after = intent.after ?? '';

  switch (t) {
    case 'add_step': {
      const sectionId = target.section_id ?? ir.sections[0]?.id ?? 'section-main';
      // 確保 section 存在
      if (!ir.sections.find((s) => s.id === sectionId)) {
        ir.sections.push({
          id: sectionId,
          title: '新增章節',
          order: ir.sections.length,
        });
      }
      const newStep: Step = {
        step_id: `step-${nanoid(10)}`,
        section_id: sectionId,
        order: ir.steps.length,
        title: extractTitleFromIntent(intent) ?? '新步驟',
        actions: after ? [{ text: after }] : [],
        source_refs: cloneSourceRefs(intent.source_refs),
        ...(intent.confidence !== undefined ? { confidence: intent.confidence } : {}),
      };
      // 描述若有更多內容可放入 expected_result 等；W6 簡化只放 actions[0].text
      ir.steps.push(newStep);
      return null;
    }

    case 'modify_step': {
      const idx = findStepIdx(ir, target.step_id);
      if (idx === -1) return `找不到 step_id: ${target.step_id ?? '(未指定)'}`;
      const step = ir.steps[idx]!;
      // W6 簡化：把 after 當新的 actions[0].text；保留其他欄位
      if (after) {
        if (target.field === 'purpose') {
          step.purpose = after;
        } else if (target.field === 'expected_result') {
          step.expected_result = after;
        } else if (target.field === 'title') {
          step.title = after;
        } else {
          // 預設視為 action 內容更新；保留原 screenshot_refs / command 不被沖掉
          const head = step.actions[0];
          step.actions = [
            {
              text: after,
              ...(head?.command !== undefined ? { command: head.command } : {}),
              ...(head?.screenshot_refs
                ? { screenshot_refs: head.screenshot_refs }
                : {}),
            },
            ...step.actions.slice(1),
          ];
        }
      }
      step.source_refs = mergeSourceRefs(step.source_refs, intent.source_refs);
      return null;
    }

    case 'remove_step': {
      const idx = findStepIdx(ir, target.step_id);
      if (idx === -1) return `找不到 step_id: ${target.step_id ?? '(未指定)'}`;
      ir.steps.splice(idx, 1);
      return null;
    }

    case 'reorder_step': {
      // W7：依 target.field = "after:step-XYZ" 把目標 step 移到指定 step 之後；
      // 缺 after 指示就放到最末。
      const stepId = target.step_id;
      if (!stepId) return 'reorder_step 缺 step_id';
      const idx = findStepIdx(ir, stepId);
      if (idx === -1) return `找不到 step_id: ${stepId}`;
      const [moved] = ir.steps.splice(idx, 1);
      if (!moved) return `reorder_step 取出失敗: ${stepId}`;
      const afterToken = target.field?.startsWith('after:')
        ? target.field.slice('after:'.length)
        : null;
      if (afterToken) {
        const tIdx = findStepIdx(ir, afterToken);
        if (tIdx === -1) {
          // 找不到參考點 → 放回原位
          ir.steps.splice(idx, 0, moved);
          return `reorder_step 找不到參考點 step_id: ${afterToken}`;
        }
        ir.steps.splice(tIdx + 1, 0, moved);
      } else {
        ir.steps.push(moved);
      }
      // 重排 order
      ir.steps.forEach((s, i) => {
        s.order = i;
      });
      return null;
    }

    case 'add_tip': {
      const idx = findStepIdx(ir, target.step_id);
      if (idx === -1) return `找不到 step_id: ${target.step_id ?? '(未指定)'}`;
      const step = ir.steps[idx]!;
      if (after) {
        step.tips = [...(step.tips ?? []), after];
      }
      step.source_refs = mergeSourceRefs(step.source_refs, intent.source_refs);
      return null;
    }

    case 'add_warning': {
      const idx = findStepIdx(ir, target.step_id);
      if (idx === -1) return `找不到 step_id: ${target.step_id ?? '(未指定)'}`;
      const step = ir.steps[idx]!;
      if (after) {
        step.warnings = [...(step.warnings ?? []), after];
      }
      step.source_refs = mergeSourceRefs(step.source_refs, intent.source_refs);
      return null;
    }

    case 'add_troubleshooting': {
      const newTrouble: TroubleshootingItem = {
        id: `trouble-${nanoid(10)}`,
        symptom: intent.description || '（未填症狀）',
        ...(after ? { solution: after } : {}),
        ...(intent.rationale ? { cause: intent.rationale } : {}),
        source_refs: cloneSourceRefs(intent.source_refs),
        ...(intent.confidence !== undefined ? { confidence: intent.confidence } : {}),
      };
      ir.troubleshooting!.push(newTrouble);
      return null;
    }

    case 'modify_troubleshooting': {
      const tid = target.trouble_id;
      if (!tid) return '缺 trouble_id';
      const idx = ir.troubleshooting!.findIndex((x) => x.id === tid);
      if (idx === -1) return `找不到 trouble_id: ${tid}`;
      const t = ir.troubleshooting![idx]!;
      if (after) t.solution = after;
      if (intent.rationale) t.cause = intent.rationale;
      t.source_refs = mergeSourceRefs(t.source_refs, intent.source_refs);
      return null;
    }

    case 'remove_troubleshooting': {
      const tid = target.trouble_id;
      if (!tid) return '缺 trouble_id';
      const idx = ir.troubleshooting!.findIndex((x) => x.id === tid);
      if (idx === -1) return `找不到 trouble_id: ${tid}`;
      ir.troubleshooting!.splice(idx, 1);
      return null;
    }

    case 'add_glossary': {
      const term = intent.description;
      const definition = after;
      if (!term || !definition) return 'add_glossary 缺 description 或 after';
      // 同名術語不重複加
      if (ir.glossary!.some((g) => g.term.trim() === term.trim())) {
        return `術語 "${term}" 已存在`;
      }
      const newTerm: GlossaryTerm = {
        id: `term-${nanoid(10)}`,
        term,
        definition,
      };
      ir.glossary!.push(newTerm);
      return null;
    }

    case 'modify_glossary': {
      const termId = target.term_id;
      if (!termId) return '缺 term_id';
      const idx = ir.glossary!.findIndex((g) => g.id === termId);
      if (idx === -1) return `找不到 term_id: ${termId}`;
      const g = ir.glossary![idx]!;
      if (after) g.definition = after;
      return null;
    }

    case 'modify_meta': {
      const field = target.field;
      if (!field) return 'modify_meta 缺 target.field';
      const m = ir.meta as unknown as Record<string, unknown>;
      switch (field) {
        case 'title':
          if (after) m['title'] = after;
          return null;
        case 'category':
          m['category'] = after || undefined;
          return null;
        case 'target_audience':
          if (after) m['target_audience'] = after;
          return null;
        case 'difficulty':
          if (after === '初級' || after === '中級' || after === '進階')
            m['difficulty'] = after;
          return null;
        default:
          return `不支援的 meta field: ${field}`;
      }
    }

    case 'replace_screenshot': {
      // W7：把指定 step 的截圖換成新 image_id。
      // 新 image_id 透過 target.field = "image_id:img-XYZ" 帶入。
      const stepId = target.step_id;
      if (!stepId) return 'replace_screenshot 缺 step_id';
      const idx = findStepIdx(ir, stepId);
      if (idx === -1) return `找不到 step_id: ${stepId}`;
      const newImageId = target.field?.startsWith('image_id:')
        ? target.field.slice('image_id:'.length)
        : null;
      if (!newImageId) return 'replace_screenshot 缺新 image_id';
      const step = ir.steps[idx]!;
      // 把新 image_id 套入 actions：若已有截圖就替換第一個 action 的 screenshot_refs；
      // 沒有截圖的 action 就在第一個 action 補上。
      if (step.actions.length === 0) {
        step.actions.push({
          text: step.title,
          screenshot_refs: [newImageId],
        });
      } else {
        const target0 = step.actions[0]!;
        target0.screenshot_refs = [newImageId];
      }
      step.source_refs = mergeSourceRefs(step.source_refs, intent.source_refs);
      return null;
    }
  }
}

function findStepIdx(ir: IR, stepId: string | undefined): number {
  if (!stepId) return -1;
  return ir.steps.findIndex((s) => s.step_id === stepId);
}

function cloneSourceRefs(refs: readonly SourceRef[]): SourceRef[] {
  return refs.map((r) => ({ ...r }));
}

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
    out.push({ ...r });
  }
  return out;
}

/**
 * 從 intent 推測新 step 的 title：description 的第一行 / 前 30 字。
 */
function extractTitleFromIntent(intent: ChangeIntent): string | null {
  const desc = intent.description.trim();
  if (!desc) return null;
  const firstLine = desc.split('\n')[0]!.trim();
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine;
}

// Re-export sections type for convenience
export type { Section };
