/**
 * 兩個 IR 之間的結構化差異。
 *
 * 對齊規則：
 * - step：以 step_id 對齊（跨版本穩定）。新出現 = added；只在舊版有 = removed；
 *   兩邊都有但任一欄位不同 = changed（含逐欄 fieldDiff）。
 * - troubleshooting：以 trouble_id 對齊。
 * - glossary：以 term_id 對齊。
 * - meta：逐欄比對。
 */
import type {
  GlossaryTerm,
  IR,
  IrMeta,
  Step,
  TroubleshootingItem,
} from '@/core/ir/schemas';

export interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface StepDiff {
  step_id: string;
  title: string;
  fields: FieldDiff[];
}

export interface TroubleDiff {
  trouble_id: string;
  symptom: string;
  fields: FieldDiff[];
}

export interface GlossaryDiff {
  term_id: string;
  term: string;
  fields: FieldDiff[];
}

export interface MetaDiff {
  fields: FieldDiff[];
}

export interface IrDiff {
  meta: MetaDiff;
  steps: {
    added: Step[];
    removed: Step[];
    changed: StepDiff[];
    /** 順序變動（step_id 兩邊都有，order 不同） */
    reordered: Array<{ step_id: string; title: string; fromOrder: number; toOrder: number }>;
  };
  troubleshooting: {
    added: TroubleshootingItem[];
    removed: TroubleshootingItem[];
    changed: TroubleDiff[];
  };
  glossary: {
    added: GlossaryTerm[];
    removed: GlossaryTerm[];
    changed: GlossaryDiff[];
  };
  /** 高階摘要（給 UI 標題顯示） */
  summary: {
    addedSteps: number;
    removedSteps: number;
    changedSteps: number;
    reorderedSteps: number;
    addedTroubles: number;
    removedTroubles: number;
    changedTroubles: number;
    addedTerms: number;
    removedTerms: number;
    changedTerms: number;
    metaFields: number;
  };
}

export function diffIr(before: IR, after: IR): IrDiff {
  const meta: MetaDiff = { fields: diffMeta(before.meta, after.meta) };

  // ---- Steps ----
  const beforeSteps = new Map(before.steps.map((s) => [s.step_id, s]));
  const afterSteps = new Map(after.steps.map((s) => [s.step_id, s]));
  const stepAdded: Step[] = [];
  const stepRemoved: Step[] = [];
  const stepChanged: StepDiff[] = [];
  const stepReordered: IrDiff['steps']['reordered'] = [];

  // 建立 order index（before 用實際 order 或陣列 index；after 同理）
  const beforeOrder = new Map<string, number>();
  before.steps.forEach((s, i) => beforeOrder.set(s.step_id, s.order ?? i));
  const afterOrder = new Map<string, number>();
  after.steps.forEach((s, i) => afterOrder.set(s.step_id, s.order ?? i));

  for (const s of after.steps) {
    if (!beforeSteps.has(s.step_id)) {
      stepAdded.push(s);
      continue;
    }
    const old = beforeSteps.get(s.step_id)!;
    const fields = diffStepFields(old, s);
    if (fields.length > 0) {
      stepChanged.push({ step_id: s.step_id, title: s.title, fields });
    }
    const a = afterOrder.get(s.step_id);
    const b = beforeOrder.get(s.step_id);
    if (a !== undefined && b !== undefined && a !== b) {
      stepReordered.push({
        step_id: s.step_id,
        title: s.title,
        fromOrder: b,
        toOrder: a,
      });
    }
  }
  for (const s of before.steps) {
    if (!afterSteps.has(s.step_id)) stepRemoved.push(s);
  }

  // ---- Troubleshooting ----
  const beforeTr = new Map((before.troubleshooting ?? []).map((t) => [t.id, t]));
  const afterTr = new Map((after.troubleshooting ?? []).map((t) => [t.id, t]));
  const trAdded: TroubleshootingItem[] = [];
  const trRemoved: TroubleshootingItem[] = [];
  const trChanged: TroubleDiff[] = [];
  for (const t of after.troubleshooting ?? []) {
    if (!beforeTr.has(t.id)) {
      trAdded.push(t);
      continue;
    }
    const old = beforeTr.get(t.id)!;
    const fields = diffTroubleFields(old, t);
    if (fields.length > 0) {
      trChanged.push({ trouble_id: t.id, symptom: t.symptom, fields });
    }
  }
  for (const t of before.troubleshooting ?? []) {
    if (!afterTr.has(t.id)) trRemoved.push(t);
  }

  // ---- Glossary ----
  const beforeGl = new Map((before.glossary ?? []).map((g) => [g.id, g]));
  const afterGl = new Map((after.glossary ?? []).map((g) => [g.id, g]));
  const glAdded: GlossaryTerm[] = [];
  const glRemoved: GlossaryTerm[] = [];
  const glChanged: GlossaryDiff[] = [];
  for (const g of after.glossary ?? []) {
    if (!beforeGl.has(g.id)) {
      glAdded.push(g);
      continue;
    }
    const old = beforeGl.get(g.id)!;
    const fields = diffGlossaryFields(old, g);
    if (fields.length > 0) {
      glChanged.push({ term_id: g.id, term: g.term, fields });
    }
  }
  for (const g of before.glossary ?? []) {
    if (!afterGl.has(g.id)) glRemoved.push(g);
  }

  return {
    meta,
    steps: {
      added: stepAdded,
      removed: stepRemoved,
      changed: stepChanged,
      reordered: stepReordered,
    },
    troubleshooting: {
      added: trAdded,
      removed: trRemoved,
      changed: trChanged,
    },
    glossary: {
      added: glAdded,
      removed: glRemoved,
      changed: glChanged,
    },
    summary: {
      addedSteps: stepAdded.length,
      removedSteps: stepRemoved.length,
      changedSteps: stepChanged.length,
      reorderedSteps: stepReordered.length,
      addedTroubles: trAdded.length,
      removedTroubles: trRemoved.length,
      changedTroubles: trChanged.length,
      addedTerms: glAdded.length,
      removedTerms: glRemoved.length,
      changedTerms: glChanged.length,
      metaFields: meta.fields.length,
    },
  };
}

// ============================================================
// 欄位對照
// ============================================================

function diffMeta(before: IrMeta, after: IrMeta): FieldDiff[] {
  const fields: FieldDiff[] = [];
  const compare = (k: keyof IrMeta) => {
    const b = stringify(before[k]);
    const a = stringify(after[k]);
    if (b !== a) fields.push({ field: k as string, before: b, after: a });
  };
  compare('title');
  compare('category');
  compare('target_audience');
  compare('difficulty');
  compare('estimated_duration_minutes');
  // tags / authors 用 sorted JSON 比
  const bt = JSON.stringify((before.tags ?? []).slice().sort());
  const at = JSON.stringify((after.tags ?? []).slice().sort());
  if (bt !== at) fields.push({ field: 'tags', before: bt, after: at });
  const ba = JSON.stringify((before.authors ?? []).slice().sort());
  const aa = JSON.stringify((after.authors ?? []).slice().sort());
  if (ba !== aa) fields.push({ field: 'authors', before: ba, after: aa });
  return fields;
}

function diffStepFields(before: Step, after: Step): FieldDiff[] {
  const fields: FieldDiff[] = [];
  const compare = (label: string, b: unknown, a: unknown) => {
    const bs = stringify(b);
    const as_ = stringify(a);
    if (bs !== as_) fields.push({ field: label, before: bs, after: as_ });
  };
  compare('title', before.title, after.title);
  compare('purpose', before.purpose, after.purpose);
  compare('expected_result', before.expected_result, after.expected_result);
  compare(
    'actions',
    before.actions.map((x) => ({
      text: x.text,
      command: x.command,
      screenshot_refs: x.screenshot_refs ?? [],
    })),
    after.actions.map((x) => ({
      text: x.text,
      command: x.command,
      screenshot_refs: x.screenshot_refs ?? [],
    })),
  );
  compare('preconditions', before.preconditions ?? [], after.preconditions ?? []);
  compare('common_mistakes', before.common_mistakes ?? [], after.common_mistakes ?? []);
  compare('tips', before.tips ?? [], after.tips ?? []);
  compare('warnings', before.warnings ?? [], after.warnings ?? []);
  compare(
    'estimated_duration_minutes',
    before.estimated_duration_minutes,
    after.estimated_duration_minutes,
  );
  return fields;
}

function diffTroubleFields(
  before: TroubleshootingItem,
  after: TroubleshootingItem,
): FieldDiff[] {
  const fields: FieldDiff[] = [];
  const compare = (label: string, b: unknown, a: unknown) => {
    const bs = stringify(b);
    const as_ = stringify(a);
    if (bs !== as_) fields.push({ field: label, before: bs, after: as_ });
  };
  compare('symptom', before.symptom, after.symptom);
  compare('cause', before.cause, after.cause);
  compare('solution', before.solution, after.solution);
  compare('severity', before.severity, after.severity);
  compare(
    'related_step_ids',
    (before.related_step_ids ?? []).slice().sort(),
    (after.related_step_ids ?? []).slice().sort(),
  );
  return fields;
}

function diffGlossaryFields(before: GlossaryTerm, after: GlossaryTerm): FieldDiff[] {
  const fields: FieldDiff[] = [];
  const compare = (label: string, b: unknown, a: unknown) => {
    const bs = stringify(b);
    const as_ = stringify(a);
    if (bs !== as_) fields.push({ field: label, before: bs, after: as_ });
  };
  compare('term', before.term, after.term);
  compare('definition', before.definition, after.definition);
  compare(
    'aliases',
    (before.aliases ?? []).slice().sort(),
    (after.aliases ?? []).slice().sort(),
  );
  return fields;
}

function stringify(x: unknown): string {
  if (x === undefined || x === null) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'number' || typeof x === 'boolean') return String(x);
  return JSON.stringify(x);
}
