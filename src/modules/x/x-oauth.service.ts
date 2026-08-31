import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nitrostack/core';
import { getConfig, configuredXScopes, DEFAULT_X_OAUTH_SCOPES, SUPPORTED_X_OAUTH_SCOPES } from '../../common/config/env.js';
import { XIntelligenceError } from '../../common/errors/x-errors.js';
import type { XOAuthTokenResponse } from './x.client.js';
import { XService } from './x.service.js';
import { XOAuthTokenStore } from './x-oauth.store.js';

export const X_OAUTH_START_PATH = '/auth/x/start';
export const X_OAUTH_CALLBACK_PATH = '/auth/x/callback';
const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const STATE_TTL_MS = 10 * 60 * 1000;

function base64Url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createXOAuthState(): string {
  return base64Url(randomBytes(32));
}

export function createXOAuthCodeVerifier(): string {
  return base64Url(randomBytes(64));
}

export function createXOAuthCodeChallenge(codeVerifier: string): string {
  return base64Url(createHash('sha256').update(codeVerifier, 'utf8').digest());
}

export interface XOAuthStatus {
  authEnabled: boolean;
  state: 'not_configured' | 'manual_token' | 'oauth_connected' | 'token_expired';
  oauthConfigured: boolean;
  refreshAvailable: boolean;
  readAccess: boolean;
  writeAccess: boolean;
  grantedScopes: string[];
  redirectUri: string;
  authenticated: boolean;
  tokenExpiresAt?: string;
}

@Injectable({ deps: [XService, XOAuthTokenStore] })
export class XOAuthService {
  constructor(private readonly x: XService, private readonly store: XOAuthTokenStore) {}

  get redirectUri(): string {
    const config = getConfig();
    if (config.X_REDIRECT_URI) return config.X_REDIRECT_URI;
    const base = config.APP_BASE_URL ?? `http://localhost:${config.PORT}`;
    return `${base.replace(/\/$/, '')}${X_OAUTH_CALLBACK_PATH}`;
  }

  getAuthorizationUrl(): string {
    const config = getConfig();
    if (!config.X_CLIENT_ID || !config.X_CLIENT_SECRET) {
      throw new XIntelligenceError('CONFIGURATION_ERROR', 'X_CLIENT_ID and X_CLIENT_SECRET are required for the confidential X OAuth flow.', false);
    }
    const scopes = this.oauthScopes();
    const state = createXOAuthState();
    const codeVerifier = createXOAuthCodeVerifier();
    this.store.savePending(state, {
      codeVerifier,
      redirectUri: this.redirectUri,
      scopes,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.X_CLIENT_ID,
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: createXOAuthCodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    return `${X_AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(input: { state?: string; code?: string; error?: string }): Promise<{ connected: true; scopes: string[]; expiresAt?: string }> {
    if (!input.state) throw new XIntelligenceError('AUTHENTICATION_ERROR', 'X OAuth state is missing or invalid.', false);
    const pending = this.store.consumePending(input.state);
    if (!pending) throw new XIntelligenceError('AUTHENTICATION_ERROR', 'X OAuth state is missing, invalid, or expired.', false);
    if (input.error || !input.code) throw new XIntelligenceError('AUTHENTICATION_ERROR', 'X authorization was denied or did not return a code.', false);

    const token = await this.x.client.exchangeAuthorizationCode({
      code: input.code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    });
    this.store.saveToken(this.toStoredToken(token, pending.scopes));
    return { connected: true, scopes: this.store.getToken()?.scopes ?? pending.scopes, expiresAt: this.store.getToken()?.expiresAt ? new Date(this.store.getToken()!.expiresAt!).toISOString() : undefined };
  }

  disconnect(): { disconnected: true; manualTokenConfigured: boolean } {
    this.store.clearToken();
    return { disconnected: true, manualTokenConfigured: Boolean(getConfig().X_ACCESS_TOKEN) };
  }

  getStatus(): XOAuthStatus {
    const config = getConfig();
    const token = this.store.getToken();
    const scopes = token?.scopes.length ? token.scopes : configuredXScopes(config);
    const hasManual = Boolean(config.X_ACCESS_TOKEN);
    const hasOAuth = Boolean(token?.accessToken);
    const expired = Boolean(token?.expiresAt && token.expiresAt <= Date.now());
    const allows = (scope: string) => scopes.length === 0 || scopes.includes(scope);
    const refreshAvailable = Boolean((token?.refreshToken ?? config.X_REFRESH_TOKEN) && config.X_CLIENT_ID && config.X_CLIENT_SECRET);
    return {
      authEnabled: config.X_AUTH_ENABLED,
      state: hasOAuth ? (expired ? 'token_expired' : 'oauth_connected') : (hasManual ? 'manual_token' : 'not_configured'),
      oauthConfigured: Boolean(config.X_CLIENT_ID && config.X_CLIENT_SECRET && this.redirectUri),
      refreshAvailable,
      readAccess: Boolean((hasOAuth || config.X_ACCESS_TOKEN || config.X_BEARER_TOKEN) && allows('tweet.read') && allows('users.read')),
      writeAccess: Boolean(hasOAuth || config.X_ACCESS_TOKEN) && allows('tweet.write'),
      grantedScopes: scopes,
      redirectUri: this.redirectUri,
      authenticated: Boolean(hasOAuth || config.X_ACCESS_TOKEN),
      tokenExpiresAt: token?.expiresAt ? new Date(token.expiresAt).toISOString() : undefined,
    };
  }

  private oauthScopes(): string[] {
    const configured = configuredXScopes(getConfig());
    const scopes = configured.length ? configured : [...DEFAULT_X_OAUTH_SCOPES];
    const invalid = scopes.filter((scope) => !SUPPORTED_X_OAUTH_SCOPES.includes(scope as typeof SUPPORTED_X_OAUTH_SCOPES[number]));
    if (invalid.length) throw new XIntelligenceError('CONFIGURATION_ERROR', `Unsupported X OAuth scope configured: ${invalid[0]}.`, false);
    if (!scopes.includes('offline.access')) throw new XIntelligenceError('CONFIGURATION_ERROR', 'X_SCOPES must include offline.access for refresh-token support.', false);
    return scopes;
  }

  private toStoredToken(token: XOAuthTokenResponse, fallbackScopes: string[]) {
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenType: token.token_type ?? 'bearer',
      scopes: token.scope ? token.scope.split(/[ ,]+/).filter(Boolean) : fallbackScopes,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
      connectedAt: new Date().toISOString(),
    };
  }
}
