import { getStoredKey } from '@/services/byok-key';
import { callClaudeBYOK } from '@/services/claude-byok';
import type { ClaudeRequest, ClaudeResponse } from '@/core/types/extractor';

/**
 * 唯一的 Claude 入口：BYOK 直連。沒設 key 就拋錯，提示去 Settings 設定。
 *
 * MVP 拔除了 Cloud Functions 代理（claudeProxy），所有呼叫都要使用者自己的
 * Anthropic API key。Key 存在 localStorage（services/byok-key.ts）。
 */
export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const key = getStoredKey();
  if (!key) {
    throw new Error(
      '尚未設定 Anthropic API key。請到「個人設定」貼上 sk-ant-... key 後再試。',
    );
  }
  return callClaudeBYOK(req, key);
}

/** 預設模型：複雜抽取用 Opus，分類/輕量呼叫請改傳 model 參數 */
export const DEFAULT_MODEL = 'claude-opus-4-7';
export const FAST_MODEL = 'claude-haiku-4-5-20251001';
