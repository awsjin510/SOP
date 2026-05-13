import { httpsCallable } from 'firebase/functions';
import { getIdToken } from 'firebase/auth';
import { functions, auth } from '@/firebase/config';
import type { ClaudeRequest, ClaudeResponse } from '@/core/types/extractor';

/**
 * 前端不直接呼叫 Anthropic — 只透過後端 proxy。
 * 開發環境（DEV）：Firebase Functions emulator（httpsCallable）
 * 正式環境（PROD）：Vercel API route（/api/claude-proxy）
 * API key 永遠在後端。
 */
async function callClaudeViaVercel(req: ClaudeRequest): Promise<ClaudeResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error('需要登入才能呼叫 Claude');
  const idToken = await getIdToken(user);

  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `API 呼叫失敗（${response.status}）`);
  }

  return response.json() as Promise<ClaudeResponse>;
}

const claudeProxyFn = httpsCallable<ClaudeRequest, ClaudeResponse>(functions, 'claudeProxy');

export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  if (import.meta.env.DEV) {
    const result = await claudeProxyFn(req);
    return result.data;
  }
  return callClaudeViaVercel(req);
}

/** 預設模型：複雜抽取用 Opus，簡單分類請改傳 model 參數 */
export const DEFAULT_MODEL = 'claude-opus-4-7';
export const FAST_MODEL = 'claude-haiku-4-5-20251001';
