import { ExecutionContext, OAuthModule, OAuthTokenPayload, Guard } from '@nitrostack/core';
import { XIntelligenceError } from '../common/errors/x-errors.js';

export class OAuthGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authHeader = context.metadata?.authorization;
    const rawToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : context.metadata?._oauth ?? context.metadata?.token;
    if (!OAuthModule.isAuthRequired()) {
      if (typeof rawToken === 'string') await this.attachAuth(context, rawToken, false);
      return true;
    }
    if (typeof rawToken !== 'string' || !rawToken) throw new XIntelligenceError('AUTHENTICATION_ERROR', 'OAuth access token required.', false);
    await this.attachAuth(context, rawToken, true);
    return true;
  }

  private async attachAuth(context: ExecutionContext, token: string, required: boolean): Promise<void> {
    const result = await OAuthModule.validateToken(token);
    if (!result.valid) {
      if (required) throw new XIntelligenceError('AUTHENTICATION_ERROR', 'OAuth access token validation failed.', false);
      return;
    }
    const payload = result.payload as OAuthTokenPayload;
    context.auth = { subject: payload.sub, scopes: this.extractScopes(payload), clientId: payload.client_id, tokenPayload: payload };
  }

  private extractScopes(payload: OAuthTokenPayload): string[] { if (Array.isArray(payload.scopes)) return payload.scopes; return typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : []; }
}
