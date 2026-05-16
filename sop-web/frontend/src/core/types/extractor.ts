import type { ExtractorType, SourceRef } from '@/core/ir/schemas';

export interface ExtractorContext {
  /** 該素材在使用者上傳清單中的代號（檔名或 storage path） */
  sourceFile: string;
  /** 要包進每個輸出的 SourceRef 共用欄位 */
  sourceRefBase?: Pick<SourceRef, 'extractor_type' | 'source_file'>;
}

export interface ExtractorOutput<TPayload> {
  type: ExtractorType;
  source: ExtractorContext;
  payload: TPayload;
}

/**
 * 給 BaseExtractor.callClaude 用的最小型別。
 * 完整的 Anthropic Messages API 結構包在 Cloud Function 端，這裡只暴露常用子集。
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<ClaudeContentBlock>;
}

export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ClaudeRequest {
  /** 模型 ID，預設由 ClaudeClient 決定 */
  model?: string;
  system?: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  temperature?: number;
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ClaudeResponse {
  text: string;
  model: string;
  stop_reason: string | null;
  usage: ClaudeUsage;
  cost_usd: number;
}
