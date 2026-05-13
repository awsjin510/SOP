export const PRICING = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
} as const satisfies Record<string, { input: number; output: number }>;

export interface UsageInput {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export function estimateCostUsd(usage: UsageInput): number {
  const price = PRICING[usage.model as keyof typeof PRICING];
  if (!price) return 0;
  return (
    (usage.input_tokens / 1_000_000) * price.input +
    (usage.output_tokens / 1_000_000) * price.output
  );
}
