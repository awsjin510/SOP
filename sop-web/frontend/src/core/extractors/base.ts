import { callClaude, DEFAULT_MODEL } from '@/services/claude';
import type {
  ClaudeRequest,
  ClaudeResponse,
  ExtractorContext,
  ExtractorOutput,
} from '@/core/types/extractor';
import type { ExtractorType } from '@/core/ir/schemas';

/**
 * 所有抽取器的共用基底。
 *
 * 子類負責：
 * - 宣告 type
 * - 實作 extract(input, context) 把素材轉成 ExtractorOutput
 *
 * 這層只提供：
 * - callClaude() 透過 claudeProxy 呼叫 Anthropic API
 * - buildSourceRef() 產生符合 schema 的 source_ref
 */
export abstract class BaseExtractor<TInput, TPayload> {
  abstract readonly type: ExtractorType;

  abstract extract(
    input: TInput,
    context: ExtractorContext,
  ): Promise<ExtractorOutput<TPayload>>;

  protected async callClaude(
    req: Omit<ClaudeRequest, 'model'> & { model?: string },
  ): Promise<ClaudeResponse> {
    return callClaude({
      model: req.model ?? DEFAULT_MODEL,
      ...req,
    });
  }

  protected makeOutput(
    context: ExtractorContext,
    payload: TPayload,
  ): ExtractorOutput<TPayload> {
    return { type: this.type, source: context, payload };
  }
}
