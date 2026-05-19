import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase/config';
import { getStoredKey } from '@/services/byok-key';
import { callClaudeBYOK } from '@/services/claude-byok';
import type { ClaudeRequest, ClaudeResponse } from '@/core/types/extractor';

/**
 * 雙模式 Claude 呼叫：
 * - 若使用者在設定頁存了自己的 API key（BYOK），直接從瀏覽器呼叫 Anthropic
 * - 否則走 Cloud Function `claudeProxy`（需後端 ANTHROPIC_API_KEY secret）
 */
const claudeProxyFn = httpsCallable<ClaudeRequest, ClaudeResponse>(
  functions,
  'claudeProxy',
);

export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const byokKey = getStoredKey();
  if (byokKey) {
    return callClaudeBYOK(req, byokKey);
  }
  const result = await claudeProxyFn(req);
  return result.data;
}

/** 預設模型：複雜抽取用 Opus，簡單分類請改傳 model 參數 */
export const DEFAULT_MODEL = 'claude-opus-4-7';
export const FAST_MODEL = 'claude-haiku-4-5-20251001';
