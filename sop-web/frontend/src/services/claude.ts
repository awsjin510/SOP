import { getStoredKey } from '@/services/byok-key';
import { callClaudeBYOK } from '@/services/claude-byok';
import { getPreferredModel } from '@/services/model-pref';
import type { ClaudeRequest, ClaudeResponse } from '@/core/types/extractor';

/**
 * 唯一的 Claude 入口：BYOK 直連。沒設 key 就拋錯，提示去 Settings 設定。
 *
 * MVP 拔除了 Cloud Functions 代理（claudeProxy），所有呼叫都要使用者自己的
 * Anthropic API key。Key 存在 localStorage（services/byok-key.ts）。
 *
 * 模型選擇：呼叫端可以在 req.model 指定特定模型；沒指定的話會 fallback 到
 * 使用者在 Settings 設定的預設值（services/model-pref.ts）。
 */
export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const key = getStoredKey();
  if (!key) {
    throw new Error(
      '尚未設定 Anthropic API key。請到「個人設定」貼上 sk-ant-... key 後再試。',
    );
  }
  const reqWithModel: ClaudeRequest = {
    ...req,
    model: req.model ?? getPreferredModel(),
  };
  return callClaudeBYOK(reqWithModel, key);
}

/** 給呼叫端方便 import 用的 model id（這兩個是 hard-coded 的 fast / default）*/
export const DEFAULT_MODEL = 'claude-sonnet-4-6';
export const FAST_MODEL = 'claude-haiku-4-5-20251001';
