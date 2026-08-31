export type AIErrorCode =
  | 'AI_DISABLED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_PROVIDER_AUTH_ERROR'
  | 'AI_RATE_LIMITED'
  | 'AI_TIMEOUT'
  | 'AI_BAD_RESPONSE'
  | 'AI_RESPONSE_INVALID'
  | 'AI_CONTEXT_TOO_LARGE'
  | 'AI_SAFETY_REFUSAL'
  | 'AI_GROUNDING_FAILED';

export class AIIntelligenceError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: AIErrorCode, message: string, retryable = false, details?: Record<string, unknown>) {
    super(`[${code}] ${message}`);
    this.name = 'AIIntelligenceError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function safeAIError(error: unknown, fallbackCode: AIErrorCode = 'AI_BAD_RESPONSE'): {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
} {
  if (error instanceof AIIntelligenceError) return { ok: false, code: error.code, message: error.message.replace(/^\[[A-Z_]+\]\s*/, ''), retryable: error.retryable, details: error.details };
  return { ok: false, code: fallbackCode, message: 'The AI operation could not be completed.', retryable: false };
}
