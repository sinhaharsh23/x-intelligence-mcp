import type { z } from 'zod';
import { AIIntelligenceError } from './ai.errors.js';
import type { AIProvider, AIProviderHealth, AIProviderId, AIProviderResult, AIRequest } from './ai.types.js';

export abstract class HttpAIProvider implements AIProvider {
  private lastHttpStatus?: number;
  abstract readonly id: AIProviderId;
  abstract readonly model: string;
  protected abstract readonly apiKey: string | undefined;
  protected abstract request(request: AIRequest): Promise<string>;

  isConfigured(): boolean { return Boolean(this.apiKey); }

  async generate(request: AIRequest): Promise<AIProviderResult> {
    if (!this.apiKey) throw new AIIntelligenceError('AI_NOT_CONFIGURED', `The ${this.id} provider is not configured.`);
    const started = Date.now();
    const text = await this.request(request);
    return { text, provider: this.id, model: this.model, durationMs: Date.now() - started, httpStatus: this.lastHttpStatus };
  }

  async generateStructured<T>(request: AIRequest, schema: z.ZodType<T>): Promise<{ value: T; result: AIProviderResult }> {
    const result = await this.generate({ ...request, responseSchema: schema as z.ZodType<unknown> });
    const parsed = normalizeNullableValues(parseJson(result.text));
    const validation = schema.safeParse(parsed);
    if (!validation.success) throw new AIIntelligenceError('AI_RESPONSE_INVALID', 'The selected AI provider returned an invalid structured response.', false, { issueCount: validation.error.issues.length, issuePaths: validation.error.issues.map((issue) => issue.path.join('.')).slice(0, 20), issueCodes: validation.error.issues.map((issue) => issue.code).slice(0, 20), receivedTypes: validation.error.issues.map((issue) => 'received' in issue ? typeof issue.received : undefined).slice(0, 20) });
    return { value: validation.data, result };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    return { id: this.id, configured: this.isConfigured(), available: this.isConfigured(), model: this.model, message: this.isConfigured() ? 'Configuration present; no billable health generation performed.' : 'API key not configured.' };
  }

  protected async fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<Record<string, any>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      this.lastHttpStatus = response.status;
      const text = await response.text();
      let payload: Record<string, any> = {};
      try { payload = text ? JSON.parse(text) as Record<string, any> : {}; } catch { throw new AIIntelligenceError('AI_BAD_RESPONSE', `The ${this.id} provider returned a non-JSON response.`, false, { httpStatus: response.status, responseJsonParsed: false }); }
      if (response.ok) return payload;
      throw providerHttpError(this.id, response.status, payload);
    } catch (error) {
      if (error instanceof AIIntelligenceError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw new AIIntelligenceError('AI_TIMEOUT', `The ${this.id} request timed out.`, true);
      throw new AIIntelligenceError('AI_PROVIDER_UNAVAILABLE', `The ${this.id} provider could not be reached.`, true);
    } finally { clearTimeout(timeout); }
  }
}

/** Native strict JSON schemas represent optional/default fields as nullable. */
function normalizeNullableValues(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map((item) => normalizeNullableValues(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeNullableValues(child)]));
  return value;
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(cleaned); } catch { throw new AIIntelligenceError('AI_RESPONSE_INVALID', 'The AI provider returned malformed JSON.', false); }
}

function providerHttpError(provider: AIProviderId, status: number, payload: Record<string, any>): AIIntelligenceError {
  const providerError = payload.error && typeof payload.error === 'object' ? payload.error : {};
  const message = providerError.message ?? payload.message;
  const safeMessage = typeof message === 'string' ? message.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').slice(0, 300) : 'The AI provider returned an error.';
  const details = { provider, httpStatus: status, responseJsonParsed: true, providerErrorType: safeField(providerError.type), providerErrorCode: safeField(providerError.code), providerErrorMessage: safeMessage, ...responseShapeDetails(payload) };
  if (/safety|refus|content polic|blocked/i.test(safeMessage)) return new AIIntelligenceError('AI_SAFETY_REFUSAL', 'The AI provider refused this request for safety reasons.', false, details);
  if (status === 401 || status === 403) return new AIIntelligenceError('AI_PROVIDER_AUTH_ERROR', `${provider} rejected the configured credentials.`, false, details);
  if (status === 429) return new AIIntelligenceError('AI_RATE_LIMITED', `${provider} rate limit reached.`, true, details);
  if (status === 413) return new AIIntelligenceError('AI_CONTEXT_TOO_LARGE', `${provider} rejected the request because the context is too large.`, false, details);
  if (providerError.code === 'json_validate_failed') return new AIIntelligenceError('AI_RESPONSE_INVALID', `${provider} returned structured output that did not satisfy the requested schema.`, false, details);
  if (status >= 500) return new AIIntelligenceError('AI_PROVIDER_UNAVAILABLE', `${provider} is temporarily unavailable.`, true, details);
  return new AIIntelligenceError('AI_BAD_RESPONSE', safeMessage, false, details);
}

export function responseShapeDetails(payload: Record<string, any>): Record<string, unknown> {
  const choices = payload.choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = first?.message;
  return {
    choicesExists: Object.prototype.hasOwnProperty.call(payload, 'choices'),
    choicesLength: Array.isArray(choices) ? choices.length : undefined,
    messageExists: Boolean(message && typeof message === 'object'),
    contentType: message && typeof message === 'object' && 'content' in message ? typeof message.content : undefined,
    finishReason: safeField(first?.finish_reason),
  };
}

function safeField(value: unknown): string | undefined {
  return typeof value === 'string' ? value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').slice(0, 120) : undefined;
}
