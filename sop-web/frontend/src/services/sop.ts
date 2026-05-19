import { IrSchema, type IR } from '@/core/ir/schemas';
import { z } from 'zod';

/**
 * 一份 SOP 在 MVP 下的最小表示：IR + metadata。
 * Firebase 已拔除，這裡只負責 (a) 提供型別、(b) JSON 匯出/匯入。
 */
export interface SopMetadata {
  title: string;
  category?: string;
  tags?: string[];
  targetAudience?: string;
  difficulty?: '初級' | '中級' | '進階';
  estimatedDurationMinutes?: number;
  sourceFiles: Array<{
    name: string;
    type: 'transcript' | 'document' | 'screenshot' | 'text' | 'pdf';
    extractedAt: string; // ISO-8601
  }>;
}

export interface SopState {
  ir: IR;
  metadata: SopMetadata;
}

// ============================================================
// SOP.json (v1) — 匯出/匯入格式
// ============================================================

const sopJsonSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  ir: IrSchema,
  metadata: z.object({
    title: z.string(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    targetAudience: z.string().optional(),
    difficulty: z.enum(['初級', '中級', '進階']).optional(),
    estimatedDurationMinutes: z.number().optional(),
    sourceFiles: z.array(
      z.object({
        name: z.string(),
        type: z.enum(['transcript', 'document', 'screenshot', 'text', 'pdf']),
        extractedAt: z.string(),
      }),
    ),
  }),
});

export type SopJsonV1 = z.infer<typeof sopJsonSchemaV1>;

/** 序列化當前 SOP 成可下載的 JSON Blob。 */
export function buildSopJsonBlob(sop: SopState): Blob {
  const payload: SopJsonV1 = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    ir: sop.ir,
    metadata: sop.metadata,
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
}

/** 從 File 讀回 SOP（含 IR zod runtime 驗證）。失敗會丟錯。 */
export async function parseSopJson(file: File): Promise<SopState> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`SOP.json 不是合法的 JSON：${(err as Error).message}`);
  }
  const parsed = sopJsonSchemaV1.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `SOP.json 格式不符：${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join('；')}`,
    );
  }
  return { ir: parsed.data.ir, metadata: parsed.data.metadata };
}

/** 給檔名用：把 title 轉成 filesystem-safe slug。 */
export function slugify(input: string, fallback = 'sop'): string {
  const s = input
    .trim()
    .replace(/[\s/\\:*?"<>|]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}
