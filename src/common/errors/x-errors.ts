export type XErrorCode =
  | 'AUTH_DISABLED'
  | 'AUTH_REQUIRED'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'X_API_ERROR'
  | 'BILLING_OR_ACCESS_RESTRICTED'
  | 'NETWORK_ERROR'
  | 'CAPABILITY_UNAVAILABLE'
  | 'PLAN_RESTRICTION'
  | 'TOKEN_EXPIRED'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR';

export interface SafeErrorShape {
  code: XErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, string | number | boolean | undefined>;
}

export class XIntelligenceError extends Error {
  readonly code: XErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, string | number | boolean | undefined>;

  constructor(code: XErrorCode, message: string, retryable = false, details?: SafeErrorShape['details']) {
    super(`[${code}] ${message}`);
    this.name = 'XIntelligenceError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }

  toJSON(): SafeErrorShape {
    return { code: this.code, message: this.message, retryable: this.retryable, details: this.details };
  }
}

export function toSafeError(error: unknown): SafeErrorShape {
  if (error instanceof XIntelligenceError) return error.toJSON();
  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Unexpected error',
    retryable: false,
  };
}

export function errorResult(error: unknown): SafeErrorShape & { ok: false } {
  return { ok: false, ...toSafeError(error) };
}
