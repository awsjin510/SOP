import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase/config';
import type { ClaudeRequest, ClaudeResponse } from '@/core/types/extractor';

/**
 * 前端不直接呼叫 Anthropic — 只透過 Cloud Function 'claudeProxy'。
 * API key 永遠在後端。
 */
const claudeProxyFn = httpsCallable<ClaudeRequest, ClaudeResponse>(
  functions,
  'claudeProxy',
);

export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const result = await claudeProxyFn(req);
  return result.data;
}

/** 預設模型：複雜抽取用 Opus，簡單分類請改傳 model 參數 */
export const DEFAULT_MODEL = 'claude-opus-4-7';
export const FAST_MODEL = 'claude-haiku-4-5-20251001';
