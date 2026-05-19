import type { ClaudeRequest, ClaudeResponse } from '@/core/types/extractor';

/**
 * BYOK 模式：直接從瀏覽器呼叫 Anthropic Messages API。
 * 需要使用者提供自己的 API key，並在請求中帶
 * `anthropic-dangerous-direct-browser-access: true` 通過 Anthropic 的 CORS 檢查。
 */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MODEL = 'claude-opus-4-7';

const PRICING: Record<string, { input: number; output: number }> = {
  // Per 1M tokens (USD)。與 functions/src/cost.ts 對齊。
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

function estimateCostUsd(model: string, inT: number, outT: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inT / 1_000_000) * p.input + (outT / 1_000_000) * p.output;
}

interface AnthropicMessagesResponse {
  content: Array<{ type: string; text?: string }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export async function callClaudeBYOK(
  req: ClaudeRequest,
  apiKey: string,
): Promise<ClaudeResponse> {
  const model = req.model ?? DEFAULT_MODEL;
  const body: Record<string, unknown> = {
    model,
    max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages: req.messages,
  };
  if (req.system) body.system = req.system;
  if (typeof req.temperature === 'number') body.temperature = req.temperature;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`無法連線 Anthropic API：${msg}`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.text();
      detail = errBody.slice(0, 500);
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      throw new Error('Anthropic API 拒絕（401）：API key 無效或已撤銷');
    }
    if (res.status === 429) {
      throw new Error('Anthropic API rate limit（429）：請稍候再試');
    }
    throw new Error(`Anthropic API 錯誤 ${res.status}：${detail}`);
  }

  const data = (await res.json()) as AnthropicMessagesResponse;
  const text = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n');

  return {
    text,
    model: data.model,
    stop_reason: data.stop_reason,
    usage: data.usage,
    cost_usd: estimateCostUsd(
      data.model,
      data.usage.input_tokens,
      data.usage.output_tokens,
    ),
  };
}
