import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminApp } from './_lib/admin';
import { getAuth } from 'firebase-admin/auth';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { estimateCostUsd } from './_lib/cost';
import { checkRateLimit, RATE_LIMIT_PER_MIN } from './_lib/rate-limit';
import { readMonthlyUsageUsd, recordUsage, currentYearMonth } from './_lib/usage';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MODEL = 'claude-opus-4-7';
const ALLOWED_MODELS = new Set([
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]);
const DEFAULT_MONTHLY_LIMIT_USD = 50;

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
  };
  cost_usd: number;
}

function err(res: VercelResponse, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    err(res, 405, 'Method not allowed');
    return;
  }

  // 1. 驗證 Firebase ID token
  const authHeader = req.headers.authorization ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) {
    err(res, 401, '需要登入才能呼叫 Claude');
    return;
  }

  let userId: string;
  try {
    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);
    userId = decoded.uid;
  } catch {
    err(res, 401, 'ID token 無效或已過期，請重新登入');
    return;
  }

  // 2. 速率限制
  const rl = await checkRateLimit(userId);
  if (!rl.allowed) {
    err(res, 429, `已超過速率上限（${RATE_LIMIT_PER_MIN} 次/分鐘），請稍候再試`);
    return;
  }

  // 3. 月度用量上限
  const ym = currentYearMonth();
  const db = getFirestore(getAdminApp());
  const userSnap = await db.doc(`users/${userId}`).get();
  const userData = userSnap.data() as
    | { apiUsageLimit?: { monthly_usd_limit?: number; notification_threshold?: number } }
    | undefined;
  const monthlyLimitUsd = userData?.apiUsageLimit?.monthly_usd_limit ?? DEFAULT_MONTHLY_LIMIT_USD;
  const notificationThreshold = userData?.apiUsageLimit?.notification_threshold ?? 0.8;

  const currentUsage = await readMonthlyUsageUsd(userId, ym);
  if (currentUsage >= monthlyLimitUsd) {
    err(
      res,
      429,
      `本月已達 API 用量上限 $${monthlyLimitUsd}（已用 $${currentUsage.toFixed(2)}）。請到設定頁調整或等下月。`,
    );
    return;
  }

  // 4. 驗證請求體
  const body = req.body as ClaudeProxyRequest;
  const model = body.model ?? DEFAULT_MODEL;
  if (!ALLOWED_MODELS.has(model)) {
    err(res, 400, `不支援的模型：${model}`);
    return;
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    err(res, 400, 'messages 必須為非空陣列');
    return;
  }
  const max_tokens = body.max_tokens ?? DEFAULT_MAX_TOKENS;

  // 5. 呼叫 Anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    err(res, 500, 'ANTHROPIC_API_KEY 未設定，請在 Vercel 環境變數中設定');
    return;
  }

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens,
      ...(body.system ? { system: body.system } : {}),
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
      messages: body.messages,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    err(res, 500, `Anthropic API 失敗：${msg}`);
    return;
  }

  // 6. 記錄用量
  const cost = estimateCostUsd({
    model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });
  await recordUsage({ userId, yearMonth: ym, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, costUsd: cost });

  // 7. 80% 通知
  const newTotal = currentUsage + cost;
  if (
    currentUsage < monthlyLimitUsd * notificationThreshold &&
    newTotal >= monthlyLimitUsd * notificationThreshold
  ) {
    try {
      const pct = Math.round((newTotal / monthlyLimitUsd) * 100);
      await db.collection(`users/${userId}/notifications`).add({
        type: 'usage_warning',
        message: `本月已用 $${newTotal.toFixed(2)}，達上限 ${pct}%`,
        createdAt: Timestamp.now(),
        read: false,
      });
    } catch { /* 通知失敗不擋主流程 */ }
  }

  const text = response.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const result: ClaudeProxyResponse = {
    text,
    model: response.model,
    stop_reason: response.stop_reason ?? null,
    usage: response.usage,
    cost_usd: cost,
  };
  res.status(200).json(result);
}
