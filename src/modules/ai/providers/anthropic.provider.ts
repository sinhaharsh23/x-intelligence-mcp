import { getConfig } from '../../../common/config/env.js';
import { AIIntelligenceError } from '../ai.errors.js';
import { HttpAIProvider } from '../ai.provider.js';
import type { AIRequest } from '../ai.types.js';

export class AnthropicProvider extends HttpAIProvider {
  readonly id = 'anthropic' as const;
  readonly model = getConfig().ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
  protected readonly apiKey = getConfig().ANTHROPIC_API_KEY;

  protected async request(request: AIRequest): Promise<string> {
    const payload = await this.fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey!, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, max_tokens: request.maxOutputTokens, system: request.systemPrompt, messages: [{ role: 'user', content: request.userPrompt }] }),
    }, getConfig().AI_TIMEOUT_MS);
    const text = payload.content?.filter((block: any) => block?.type === 'text').map((block: any) => block.text).join('');
    if (typeof text !== 'string' || !text) {
      if (payload.stop_reason === 'refusal' || JSON.stringify(payload).match(/safety|refus/i)) throw new AIIntelligenceError('AI_SAFETY_REFUSAL', 'The Anthropic provider refused this request for safety reasons.', false);
      throw new AIIntelligenceError('AI_BAD_RESPONSE', 'The Anthropic response contained no output text.', false);
    }
    return text;
  }
}
