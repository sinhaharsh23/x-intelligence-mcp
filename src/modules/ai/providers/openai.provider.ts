import { getConfig } from '../../../common/config/env.js';
import { AIIntelligenceError } from '../ai.errors.js';
import { HttpAIProvider } from '../ai.provider.js';
import type { AIRequest } from '../ai.types.js';

export class OpenAIProvider extends HttpAIProvider {
  readonly id = 'openai' as const;
  readonly model = getConfig().OPENAI_MODEL ?? 'gpt-5-mini';
  protected readonly apiKey = getConfig().OPENAI_API_KEY;

  protected async request(request: AIRequest): Promise<string> {
    const payload = await this.fetchJson('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: `${request.systemPrompt}\n\n${request.userPrompt}`, max_output_tokens: request.maxOutputTokens, store: false }),
    }, getConfig().AI_TIMEOUT_MS);
    if (typeof payload.output_text === 'string') return payload.output_text;
    const text = Array.isArray(payload.output) ? payload.output.flatMap((item: any) => Array.isArray(item.content) ? item.content : []).filter((item: any) => item?.type === 'output_text').map((item: any) => item.text).join('') : '';
    if (!text) {
      if (JSON.stringify(payload.output ?? '').match(/refusal|safety/i)) throw new AIIntelligenceError('AI_SAFETY_REFUSAL', 'The OpenAI provider refused this request for safety reasons.', false);
      throw new AIIntelligenceError('AI_BAD_RESPONSE', 'The OpenAI response contained no output text.', false);
    }
    return text;
  }
}
