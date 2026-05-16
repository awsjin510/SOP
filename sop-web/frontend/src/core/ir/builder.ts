import { IrSchema, type IR } from '@/core/ir/schemas';
import type { TranscriptPayload } from '@/core/extractors/transcript';

export interface SingleSourceBuildOptions {
  sopId: string;
  title: string;
  category?: string;
  tags?: string[];
  targetAudience: string;
  difficulty?: '初級' | '中級' | '進階';
  estimatedDurationMinutes?: number;
  authors: string[];
  /** ISO 8601，含 GMT+8 offset */
  createdAt: string;
  updatedAt: string;
}

/**
 * 從單一 transcript extractor 輸出建構完整 IR。
 *
 * W4 起會擴展為多源（document、screenshot 整合），這裡先給 W3 用的最小路徑。
 */
export function buildIrFromTranscript(
  payload: TranscriptPayload,
  options: SingleSourceBuildOptions,
): IR {
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
    sections: payload.sections,
    steps: payload.steps,
    ...(payload.troubleshooting.length > 0
      ? { troubleshooting: payload.troubleshooting }
      : {}),
    ...(payload.glossary.length > 0 ? { glossary: payload.glossary } : {}),
  };

  // 最終跑一次 schema 確保契約
  return IrSchema.parse(ir);
}
