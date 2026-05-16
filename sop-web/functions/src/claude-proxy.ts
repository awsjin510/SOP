import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  MessageParam,
  TextBlock,
} from '@anthropic-ai/sdk/resources/messages';
import { estimateCostUsd } from './cost';
import { readMonthlyUsageUsd, recordUsage, currentYearMonth } from './usage';
import { checkRateLimit } from './rate-limit';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MODEL = 'claude-opus-4-7';
const ALLOWED_MODELS = new Set([
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]);

interface ClaudeProxyRequest {
  model?: string;
  system?: string;
  messages: MessageParam[];
  max_tokens?: number;
  temperature?: number;
}

interface ClaudeProxyResponse {
  text: string;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  cost_usd: number;
}

/**
 * 使用者每月 USD 上限預設值（user doc 若有 apiUsageLimit.monthly_usd_limit 會覆蓋）
 */
const DEFAULT_MONTHLY_LIMIT_USD = 50;

/**
 * 讀取使用者的月度上限 + 通知門檻。預設 $50 / 80%。
 */
async function readUserLimits(userId: string): Promise<{
  monthlyLimitUsd: number;
  notificationThreshold: number;
}> {
  const db = getFirestore();
  const snap = await db.doc(`users/${userId}`).get();
  const data = snap.data() as
    | {
        apiUsageLimit?: {
          monthly_usd_limit?: number;
          notification_threshold?: number;
        };
      }
    | undefined;
  return {
    monthlyLimitUsd: data?.apiUsageLimit?.monthly_usd_limit ?? DEFAULT_MONTHLY_LIMIT_USD,
    notificationThreshold: data?.apiUsageLimit?.notification_threshold ?? 0.8,
  };
}

/**
 * 把回應裡的 text block 串接起來（忽略其他 block 類型）
 */
function collectText(message: Message): string {
  return message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * 代理 Anthropic Messages API。
 *
 * 流程：
 * 1. 驗證已登入
 * 2. 速率限制（10/min）
 * 3. 月度上限檢查（>= limit 拒絕）
 * 4. 呼叫 Anthropic
 * 5. 計算成本、記錄 usage
 * 6. 達 80% 寫通知（W2 不做 UI）
 */
export const claudeProxy = onCall<ClaudeProxyRequest, Promise<ClaudeProxyResponse>>(
  {
    region: 'asia-east1',
    secrets: [anthropicKey],
    // 5 分鐘對較長的 prompt 也足夠
    timeoutSeconds: 300,
    // 大型 prompt（多素材整合）需要更多記憶體
    memory: '1GiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '需要登入才能呼叫 Claude');
    }
    const userId = request.auth.uid;

    // --- 1. Rate limit ---
    const rl = await checkRateLimit(userId);
    if (!rl.allowed) {
      throw new HttpsError(
        'resource-exhausted',
        `已超過速率上限（${rl.limit} 次/分鐘），請稍候再試`,
      );
    }

    // --- 2. Monthly limit ---
    const ym = currentYearMonth();
    const [currentUsage, limits] = await Promise.all([
      readMonthlyUsageUsd(userId, ym),
      readUserLimits(userId),
    ]);
    if (currentUsage >= limits.monthlyLimitUsd) {
      throw new HttpsError(
        'resource-exhausted',
        `本月已達 API 用量上限 $${limits.monthlyLimitUsd}（已用 $${currentUsage.toFixed(
          2,
        )}）。請到設定頁調整或等下月。`,
      );
    }

    // --- 3. Validate request ---
    const model = request.data.model ?? DEFAULT_MODEL;
    if (!ALLOWED_MODELS.has(model)) {
      throw new HttpsError('invalid-argument', `不支援的模型：${model}`);
    }
    if (!Array.isArray(request.data.messages) || request.data.messages.length === 0) {
      throw new HttpsError('invalid-argument', 'messages 必須為非空陣列');
    }
    const max_tokens = request.data.max_tokens ?? DEFAULT_MAX_TOKENS;
    if (max_tokens < 1 || max_tokens > 8192) {
      throw new HttpsError('invalid-argument', 'max_tokens 必須在 1..8192');
    }

    // --- 4. Call Anthropic ---
    const apiKey = anthropicKey.value();
    if (!apiKey) {
      throw new HttpsError(
        'failed-precondition',
        'ANTHROPIC_API_KEY 未設定。Emulator 請寫入 functions/.env.local；正式環境請執行 firebase functions:secrets:set ANTHROPIC_API_KEY',
      );
    }

    const client = new Anthropic({ apiKey });
    let response: Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens,
        ...(request.data.system ? { system: request.data.system } : {}),
        ...(request.data.temperature !== undefined
          ? { temperature: request.data.temperature }
          : {}),
        messages: request.data.messages,
      });
    } catch (err) {
      logger.error('Anthropic API call failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `Anthropic API 失敗：${msg}`);
    }

    // --- 5. Record usage ---
    const cost = estimateCostUsd({
      model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    await recordUsage({
      userId,
      yearMonth: ym,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: cost,
    });

    // --- 6. Notification at 80% ---
    const newTotal = currentUsage + cost;
    if (
      currentUsage < limits.monthlyLimitUsd * limits.notificationThreshold &&
      newTotal >= limits.monthlyLimitUsd * limits.notificationThreshold
    ) {
      try {
        const db = getFirestore();
        const pct = Math.round((newTotal / limits.monthlyLimitUsd) * 100);
        await db.collection(`users/${userId}/notifications`).add({
          type: 'usage_warning',
          message: `本月已用 $${newTotal.toFixed(2)}，達上限 ${pct}%`,
          createdAt: new Date(),
          read: false,
        });
      } catch (err) {
        // 通知失敗不擋主流程
        logger.warn('failed to write usage_warning notification', err);
      }
    }

    return {
      text: collectText(response),
      model: response.model,
      stop_reason: response.stop_reason ?? null,
      usage: response.usage,
      cost_usd: cost,
    };
  },
);
