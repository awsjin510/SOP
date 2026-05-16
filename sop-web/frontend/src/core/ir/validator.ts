import { z } from 'zod';
import { IrSchema, type IR } from '@/core/ir/schemas';

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  data: IR | null;
}

export function validateIr(input: unknown): ValidationResult {
  const result = IrSchema.safeParse(input);
  if (result.success) {
    return { ok: true, issues: [], data: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
    data: null,
  };
}

/**
 * 對通過 schema 的 IR 做額外的內部一致性檢查（schema 表達不出來的）。
 */
export function validateIrConsistency(ir: IR): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const sectionIds = new Set(ir.sections.map((s) => s.id));
  const stepIds = new Set<string>();

  ir.steps.forEach((step, idx) => {
    if (stepIds.has(step.step_id)) {
      issues.push({
        path: `steps[${idx}].step_id`,
        message: `重複的 step_id: ${step.step_id}`,
        code: 'duplicate_step_id',
      });
    }
    stepIds.add(step.step_id);

    if (!sectionIds.has(step.section_id)) {
      issues.push({
        path: `steps[${idx}].section_id`,
        message: `step.section_id "${step.section_id}" 不在 sections[] 中`,
        code: 'orphan_section_ref',
      });
    }
  });

  ir.troubleshooting?.forEach((t, idx) => {
    t.related_step_ids?.forEach((sid, j) => {
      if (!stepIds.has(sid)) {
        issues.push({
          path: `troubleshooting[${idx}].related_step_ids[${j}]`,
          message: `引用不存在的 step_id "${sid}"`,
          code: 'orphan_step_ref',
        });
      }
    });
  });

  return issues;
}

export class IrValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: ValidationIssue[],
  ) {
    super(message);
    this.name = 'IrValidationError';
  }
}

/**
 * 解析並驗證 IR；無效時拋例外。其他流程裡用 validateIr 拿 result 物件。
 */
export function parseIr(input: unknown): IR {
  try {
    return IrSchema.parse(input);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      }));
      throw new IrValidationError('IR 驗證失敗', issues);
    }
    throw err;
  }
}
