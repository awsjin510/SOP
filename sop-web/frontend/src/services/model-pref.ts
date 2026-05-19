/**
 * 使用者選擇的預設 Claude 模型（存 localStorage）。
 * 抽取器若沒在 ClaudeRequest 中指定 model，就會 fallback 到這裡的偏好。
 */

export const SUPPORTED_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
] as const;

export type ModelId = (typeof SUPPORTED_MODELS)[number];

/** 預設模型：性價比平衡 */
export const FALLBACK_MODEL: ModelId = 'claude-sonnet-4-6';

const STORAGE_KEY = 'sop_default_model';

export interface ModelInfo {
  id: ModelId;
  label: string;
  /** 每 1M tokens 美元 */
  pricePerMTokInput: number;
  pricePerMTokOutput: number;
  description: string;
}

export const MODEL_CATALOG: ReadonlyArray<ModelInfo> = [
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5（最快最便宜）',
    pricePerMTokInput: 0.8,
    pricePerMTokOutput: 4,
    description: '簡短素材、快速試用；長訪談可能會掉細節。',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6（推薦）',
    pricePerMTokInput: 3,
    pricePerMTokOutput: 15,
    description: '性價比平衡，多數情境的合理選擇。',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7（最聰明）',
    pricePerMTokInput: 15,
    pricePerMTokOutput: 75,
    description: '複雜業務、結構繁複的長訪談；成本最高。',
  },
];

export function getPreferredModel(): ModelId {
  if (typeof window === 'undefined') return FALLBACK_MODEL;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && (SUPPORTED_MODELS as readonly string[]).includes(v)) {
      return v as ModelId;
    }
  } catch {
    /* ignore */
  }
  return FALLBACK_MODEL;
}

export function setPreferredModel(model: ModelId): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, model);
}
