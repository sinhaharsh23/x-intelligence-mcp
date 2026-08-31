import { getConfig, configuredXScopes, type AppConfig } from '../../common/config/env.js';
import { XIntelligenceError } from '../../common/errors/x-errors.js';
import type { RateLimitState, XApiEnvelope, XApiProblem } from '../../common/types/x.js';
import { XOAuthTokenStore, type StoredXOAuthToken } from './x-oauth.store.js';

type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PUT';
type AuthMode = 'app' | 'user';

export interface XRequestOptions {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  auth?: AuthMode;
  retryable?: boolean;
  endpointLabel?: string;
}

export interface XOAuthTokenResponse {
  token_type?: string;
  expires_in?: number;
  access_token: string;
  scope?: string;
  refresh_token?: string;
}

export class XApiClient {
  private readonly config: AppConfig;
  private readonly rateLimits = new Map<string, RateLimitState>();
  private readonly tokenStore?: XOAuthTokenStore;
  private transientUserAccessToken?: string;
  private refreshPromise?: Promise<boolean>;
  private readonly startedAt = Date.now();

  constructor(config: AppConfig = getConfig(), tokenStore?: XOAuthTokenStore) {
    this.config = config;
    this.tokenStore = tokenStore;
  }

  get uptimeSeconds(): number { return Math.floor((Date.now() - this.startedAt) / 1000); }
  get rateLimitSnapshot(): RateLimitState[] { return [...this.rateLimits.values()]; }
  get configured(): boolean { return Boolean(this.currentUserAccessToken || this.config.X_BEARER_TOKEN); }
  get hasUserToken(): boolean { return Boolean(this.currentUserAccessToken); }
  get hasBearerToken(): boolean { return Boolean(this.config.X_BEARER_TOKEN); }
  get scopes(): string[] { return this.tokenStore?.getToken()?.scopes ?? configuredXScopes(this.config); }
  get canRefresh(): boolean { return Boolean(this.refreshToken && this.config.X_CLIENT_ID && this.config.X_CLIENT_SECRET); }
  get oauthToken(): StoredXOAuthToken | undefined { return this.tokenStore?.getToken(); }
  get currentUserAccessToken(): string | undefined { return this.tokenStore?.getToken()?.accessToken ?? this.transientUserAccessToken ?? this.config.X_ACCESS_TOKEN; }

  saveOAuthToken(token: StoredXOAuthToken): void { this.tokenStore?.saveToken(token); }
  clearOAuthToken(): void { this.tokenStore?.clearToken(); }

  async request<T>(path: string, options: XRequestOptions = {}): Promise<XApiEnvelope<T>> {
    const method = options.method ?? 'GET';
    const authMode = options.auth ?? 'app';
    let token = authMode === 'user' ? this.currentUserAccessToken : (this.currentUserAccessToken ?? this.config.X_BEARER_TOKEN);
    if (!token) {
      const code = authMode === 'user' && !this.config.X_AUTH_ENABLED ? 'AUTH_DISABLED' : 'AUTH_REQUIRED';
      throw new XIntelligenceError(code, authMode === 'user'
        ? (code === 'AUTH_DISABLED' ? 'X user authentication is disabled for development; enable X_AUTH_ENABLED or provide a user token.' : 'A user access token is required for this X operation.')
        : 'An X bearer token or user token is required for this X operation.', false, { authMode, xAuthEnabled: this.config.X_AUTH_ENABLED });
    }

    const url = new URL(path, this.config.X_API_BASE_URL ?? 'https://api.x.com');
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }

    const baseAttempts = options.retryable === false || method !== 'GET' ? 1 : this.config.X_API_MAX_RETRIES + 1;
    const maxAttempts = baseAttempts + (authMode === 'user' && this.canRefresh ? 1 : 0);
    let refreshed = false;
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.X_API_TIMEOUT_MS);
      const started = Date.now();
      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });
        const rate = this.parseRateLimit(response.headers, options.endpointLabel ?? path);
        const payload = await this.parsePayload<T>(response);
        if (response.ok) return payload;
        const error = this.toApiError(response.status, payload, rate, { method, endpoint: options.endpointLabel ?? path, authMode });
        if (error.code === 'TOKEN_EXPIRED' && authMode === 'user' && !refreshed && this.canRefresh) {
          refreshed = true;
          const didRefresh = await this.refreshUserAccessToken();
          if (!didRefresh) throw error;
          token = this.currentUserAccessToken;
          continue;
        }
        if (error.code === 'RATE_LIMITED' && attempt < maxAttempts) {
          await this.waitForRateLimit(rate);
          continue;
        }
        throw error;
      } catch (error) {
        if (error instanceof XIntelligenceError) throw error;
        const message = error instanceof DOMException && error.name === 'AbortError'
          ? `X API request timed out after ${this.config.X_API_TIMEOUT_MS}ms`
          : (error instanceof Error ? error.message : 'X API network request failed');
        if (attempt < maxAttempts) continue;
        throw new XIntelligenceError('NETWORK_ERROR', message, true, { durationMs: Date.now() - started });
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new XIntelligenceError('NETWORK_ERROR', 'X API request failed after retry policy.', true);
  }

  async exchangeAuthorizationCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<XOAuthTokenResponse> {
    return this.oauthTokenRequest({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }, 'AUTHENTICATION_ERROR');
  }

  async refreshUserAccessToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh().finally(() => { this.refreshPromise = undefined; });
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<boolean> {
    if (!this.refreshToken || !this.config.X_CLIENT_ID || !this.config.X_CLIENT_SECRET) return false;
    const payload = await this.oauthTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    }, 'TOKEN_EXPIRED');
    const previous = this.tokenStore?.getToken();
    const refreshedToken: StoredXOAuthToken = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? previous?.refreshToken ?? this.config.X_REFRESH_TOKEN,
      tokenType: payload.token_type ?? previous?.tokenType ?? 'bearer',
      scopes: payload.scope ? payload.scope.split(/[ ,]+/).filter(Boolean) : (previous?.scopes ?? configuredXScopes(this.config)),
      expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : undefined,
      connectedAt: previous?.connectedAt ?? new Date().toISOString(),
    };
    if (this.tokenStore) this.tokenStore.saveToken(refreshedToken);
    else this.transientUserAccessToken = refreshedToken.accessToken;
    return true;
  }

  private get refreshToken(): string | undefined {
    return this.tokenStore?.getToken()?.refreshToken ?? this.config.X_REFRESH_TOKEN;
  }

  private async oauthTokenRequest(body: Record<string, string>, failureCode: 'AUTHENTICATION_ERROR' | 'TOKEN_EXPIRED'): Promise<XOAuthTokenResponse> {
    if (!this.config.X_CLIENT_ID || !this.config.X_CLIENT_SECRET) {
      throw new XIntelligenceError('CONFIGURATION_ERROR', 'X OAuth client credentials are not configured.', false);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.X_API_TIMEOUT_MS);
    try {
      const tokenUrl = new URL('/2/oauth2/token', this.config.X_API_BASE_URL ?? 'https://api.x.com');
      const basicCredentials = Buffer.from(`${this.config.X_CLIENT_ID}:${this.config.X_CLIENT_SECRET}`, 'utf8').toString('base64');
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicCredentials}` },
        body: new URLSearchParams(body),
        signal: controller.signal,
      });
      const payload = await response.json() as Partial<XOAuthTokenResponse> & { error?: string };
      if (!response.ok || typeof payload.access_token !== 'string' || !payload.access_token) {
        throw new XIntelligenceError(failureCode, failureCode === 'TOKEN_EXPIRED' ? 'X user token refresh failed.' : 'X authorization code exchange failed.', false, { status: response.status, providerError: payload.error });
      }
      return payload as XOAuthTokenResponse;
    } catch (error) {
      if (error instanceof XIntelligenceError) throw error;
      throw new XIntelligenceError('NETWORK_ERROR', 'X OAuth token request failed.', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parsePayload<T>(response: Response): Promise<XApiEnvelope<T>> {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text) as XApiEnvelope<T>; }
    catch { throw new XIntelligenceError('X_API_ERROR', 'X returned a non-JSON response.', false, { status: response.status }); }
  }

  private parseRateLimit(headers: Headers, endpoint: string): RateLimitState {
    const state: RateLimitState = {
      endpoint,
      limit: this.numberHeader(headers, 'x-rate-limit-limit'),
      remaining: this.numberHeader(headers, 'x-rate-limit-remaining'),
      resetAt: this.dateHeader(headers, 'x-rate-limit-reset'),
      observedAt: new Date().toISOString(),
    };
    this.rateLimits.set(endpoint, state);
    return state;
  }

  private numberHeader(headers: Headers, key: string): number | undefined {
    const value = headers.get(key);
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private dateHeader(headers: Headers, key: string): string | undefined {
    const value = headers.get(key);
    if (!value) return undefined;
    const epoch = Number(value);
    return Number.isFinite(epoch) ? new Date(epoch * 1000).toISOString() : undefined;
  }

  private toApiError(status: number, payload: XApiEnvelope<unknown>, rate: RateLimitState, request: { method: HttpMethod; endpoint: string; authMode: AuthMode }): XIntelligenceError {
    const problem = payload.errors?.[0];
    const detail = sanitizeProviderText(problem?.detail ?? problem?.title ?? 'X API request failed.');
    const context = `${request.method} ${request.endpoint} returned HTTP ${status}`;
    const message = detail === 'X API request failed.' ? context : `${context}: ${detail}`;
    const details = {
      httpStatus: status,
      endpoint: request.endpoint,
      xErrorType: sanitizeOptionalProviderText(problem?.type),
      xErrorTitle: sanitizeOptionalProviderText(problem?.title),
      xErrorDetail: sanitizeOptionalProviderText(problem?.detail),
      remaining: rate.remaining,
      resetAt: rate.resetAt,
    };
    if (status === 400) return new XIntelligenceError('INVALID_REQUEST', message, false, details);
    if (status === 401) return new XIntelligenceError(request.authMode === 'user' ? 'TOKEN_EXPIRED' : 'AUTH_REQUIRED', message, false, details);
    if (status === 402 || (status === 403 && isBillingOrAccessRestriction(problem))) return new XIntelligenceError('BILLING_OR_ACCESS_RESTRICTED', message, false, details);
    if (status === 403) return new XIntelligenceError('FORBIDDEN', message, false, details);
    if (status === 404) return new XIntelligenceError('NOT_FOUND', message, false, details);
    if (status === 429) return new XIntelligenceError('RATE_LIMITED', message, true, details);
    if (status >= 500) return new XIntelligenceError('X_API_ERROR', message, true, details);
    return new XIntelligenceError('X_API_ERROR', message, false, details);
  }

  private async waitForRateLimit(rate: RateLimitState): Promise<void> {
    const resetMs = rate.resetAt ? Date.parse(rate.resetAt) - Date.now() : 1000;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(Math.max(resetMs, 250), 5000)));
  }
}

function sanitizeProviderText(value: string): string { return value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').slice(0, 500); }
function sanitizeOptionalProviderText(value: string | undefined): string | undefined { return value ? sanitizeProviderText(value) : undefined; }
function isBillingOrAccessRestriction(problem: XApiProblem | undefined): boolean {
  const value = `${problem?.type ?? ''} ${problem?.title ?? ''} ${problem?.detail ?? ''}`.toLowerCase();
  return /billing|pay[- ]?per[- ]?use|subscription|credit|access level|not available on your plan|elevated access|client is not enabled/.test(value);
}
