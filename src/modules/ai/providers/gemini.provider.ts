import { getConfig } from '../../../common/config/env.js';
import { AIIntelligenceError } from '../ai.errors.js';
import { HttpAIProvider } from '../ai.provider.js';
import type { AIRequest } from '../ai.types.js';

export class GeminiProvider extends HttpAIProvider {
  readonly id = 'gemini' as const;
  readonly model = getConfig().GEMINI_MODEL ?? 'gemini-2.5-flash';
  protected readonly apiKey = getConfig().GEMINI_API_KEY;

  protected async request(request: AIRequest): Promise<string> {
    const payload = await this.fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': this.apiKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: request.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }], generationConfig: { maxOutputTokens: request.maxOutputTokens, responseMimeType: 'application/json' } }),
    }, getConfig().AI_TIMEOUT_MS);
    if (payload.promptFeedback?.blockReason) throw new AIIntelligenceError('AI_SAFETY_REFUSAL', 'The Gemini provider refused this request for safety reasons.', false);
    const text = payload.candidates?.[0]?.content?.parts?.filter((part: any) => typeof part.text === 'string').map((part: any) => part.text).join('');
    if (typeof text !== 'string' || !text) throw new Error('Gemini response contained no output text.');
    return text;
  }
}
