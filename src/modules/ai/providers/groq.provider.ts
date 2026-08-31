import { getConfig } from '../../../common/config/env.js';
import { AIIntelligenceError } from '../ai.errors.js';
import { HttpAIProvider, responseShapeDetails } from '../ai.provider.js';
import type { AIRequest } from '../ai.types.js';

/** Native REST adapter for Groq's OpenAI-compatible Chat Completions API. */
export class GroqProvider extends HttpAIProvider {
  readonly id = 'groq' as const;

  get model(): string { return getConfig().GROQ_MODEL ?? 'openai/gpt-oss-20b'; }
  protected get apiKey(): string | undefined { return getConfig().GROQ_API_KEY; }

  protected async request(request: AIRequest): Promise<string> {
    const requestsJson = /\bjson\b/i.test(`${request.systemPrompt}\n${request.userPrompt}`);
    const payload = await this.fetchJson('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        // Groq counts GPT-OSS reasoning tokens inside max_completion_tokens;
        // leave bounded headroom for the final structured response.
        max_completion_tokens: this.model.startsWith('openai/gpt-oss-')
          ? Math.max(request.maxOutputTokens, 2048)
          : request.maxOutputTokens,
        temperature: 0,
        ...(requestsJson ? { response_format: { type: 'json_object' } } : {}),
        // GPT-OSS spends completion budget on hidden reasoning. Low effort
        // preserves a usable final JSON response within the server budget.
        ...(this.model.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'low' } : {}),
      }),
    }, getConfig().AI_TIMEOUT_MS);

    const message = payload.choices?.[0]?.message;
    const text = typeof message?.content === 'string'
      ? message.content
      : Array.isArray(message?.content)
        ? message.content.filter((part: any) => typeof part?.text === 'string').map((part: any) => part.text).join('')
        : '';
    if (text) return text;
    if (message?.refusal || payload.choices?.[0]?.finish_reason === 'refusal') {
      throw new AIIntelligenceError('AI_SAFETY_REFUSAL', 'The Groq provider refused this request for safety reasons.', false);
    }
    throw new AIIntelligenceError('AI_BAD_RESPONSE', 'The Groq response contained no output text.', false, responseShapeDetails(payload));
  }
}
