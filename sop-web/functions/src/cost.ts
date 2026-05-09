/**
 * 成本估算（USD）— 對應 Anthropic 公開定價（per 1M tokens）。
 * 之後若改價，只要更新此處。
 */
export const PRICING = {
  // Opus 4.7
  'claude-opus-4-7': { input: 15, output: 75 },
  // Sonnet 4.6
  'claude-sonnet-4-6': { input: 3, output: 15 },
  // Haiku 4.5
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
} as const satisfies Record<string, { input: number; output: number }>;

export type PricedModel = keyof typeof PRICING;

export interface UsageInput {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

/**
 * 回傳該次呼叫的 USD 成本。未知模型回傳 0（仍記錄 token 數，但不算成本）。
 */
export function estimateCostUsd(usage: UsageInput): number {
  const price = PRICING[usage.model as PricedModel];
  if (!price) return 0;
  return (
    (usage.input_tokens / 1_000_000) * price.input +
    (usage.output_tokens / 1_000_000) * price.output
  );
}
