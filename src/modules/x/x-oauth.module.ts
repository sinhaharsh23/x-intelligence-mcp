import { Injectable, Module, NitroStackServer } from '@nitrostack/core';
import { X_OAUTH_CALLBACK_PATH, X_OAUTH_START_PATH, XOAuthService } from './x-oauth.service.js';

interface XOAuthRequest { query: Record<string, unknown>; }
interface XOAuthResponse {
  redirect(status: number, url: string): void;
  status(code: number): XOAuthResponse;
  type(contentType: string): XOAuthResponse;
  send(body: string): void;
}

@Injectable({ deps: [NitroStackServer, XOAuthService] })
@Module({ name: 'x-oauth', description: 'Native NitroStack HTTP routes for X OAuth 2.0 Authorization Code + PKCE.' })
export class XOAuthModule {
  private registered = false;

  constructor(private readonly server: NitroStackServer, private readonly oauth: XOAuthService) {}

  static forRoot(): { module: typeof XOAuthModule } {
    return { module: XOAuthModule };
  }

  start(): void {
    if (this.registered) return;
    const app = this.server.getHttpTransport()?.getApp?.();
    if (!app) return;
    this.registered = true;
    app.get(X_OAUTH_START_PATH, (_request: XOAuthRequest, response: XOAuthResponse) => {
      try {
        const authorizationUrl = this.oauth.getAuthorizationUrl();
        const authorization = new URL(authorizationUrl);
        console.error('X OAuth start invoked', {
          redirectUri: authorization.searchParams.get('redirect_uri'),
          requestedScopes: (authorization.searchParams.get('scope') ?? '').split(' ').filter(Boolean),
          pkceS256Enabled: authorization.searchParams.get('code_challenge_method') === 'S256',
          clientIdConfigured: Boolean(authorization.searchParams.get('client_id')),
        });
        response.redirect(302, authorizationUrl);
      } catch (error) {
        console.error('X OAuth start invoked', {
          redirectUri: this.oauth.redirectUri,
          requestedScopes: [],
          pkceS256Enabled: true,
          clientIdConfigured: false,
        });
        console.error('X OAuth start failed', { callbackValidationStage: 'authorization-url' });
        response.status(500).type('html').send('<!doctype html><title>X authorization unavailable</title><h1>X authorization unavailable</h1><p>Configure the X OAuth application before starting authorization.</p>');
      }
    });
    app.get(X_OAUTH_CALLBACK_PATH, async (request: XOAuthRequest, response: XOAuthResponse) => {
      const query = request.query as Record<string, unknown>;
      const hasState = typeof query.state === 'string' && query.state.length > 0;
      const hasCode = typeof query.code === 'string' && query.code.length > 0;
      const providerError = typeof query.error === 'string' ? query.error : undefined;
      const safeDescription = typeof query.error_description === 'string'
        ? query.error_description.replace(/[\r\n]/g, ' ').slice(0, 200)
        : undefined;
      try {
        const result = await this.oauth.handleCallback({
          state: typeof query.state === 'string' ? query.state : undefined,
          code: typeof query.code === 'string' ? query.code : undefined,
          error: typeof query.error === 'string' ? query.error : undefined,
        });
        const scopeText = result.scopes.join(', ');
        response.status(200).type('html').send(`<!doctype html><title>X account connected</title><h1>X account connected</h1><p>Your X account is connected to X Intelligence MCP.</p><p>Granted scopes: ${escapeHtml(scopeText)}</p><p>You may close this window.</p>`);
      } catch (error) {
        const status = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'AUTHENTICATION_ERROR' ? 400 : 502;
        const callbackValidationStage = !hasState
          ? 'missing-state'
          : providerError || !hasCode
            ? 'authorization-response'
            : 'token-exchange-or-state-validation';
        console.error('X OAuth callback failed', {
          httpStatus: status,
          xOAuthErrorName: providerError ?? 'callback_error',
          xOAuthErrorDescription: safeDescription ?? 'OAuth callback validation failed.',
          callbackValidationStage,
        });
        response.status(status).type('html').send('<!doctype html><title>X authorization failed</title><h1>X authorization failed</h1><p>The authorization could not be completed. No token was exposed.</p><p>You may close this window and try again.</p>');
      }
    });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
