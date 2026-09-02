import { ExecutionContext, extractBearerToken, OAuthModule, OAuthTokenPayload, Guard } from '@nitrostack/core';
import { XIntelligenceError } from '../common/errors/x-errors.js';

type AuthMetadata = Record<string, unknown>;

/**
 * Resolve the token forwarded by the Streamable HTTP session boundary.
 * NitroStack's HTTP middleware treats the Bearer scheme case-insensitively;
 * the tool guard must do the same or a valid Claude request can be rejected
 * after HTTP authentication and before the tool handler is entered.
 */
export function tokenFromAuthMetadata(metadata: AuthMetadata | undefined): string | undefined {
  const authorization = metadata?.authorization;
  if (typeof authorization === 'string') {
    const bearerToken = extractBearerToken(authorization);
    if (bearerToken) return bearerToken;
  }
  const fallback = metadata?._oauth ?? metadata?.token;
  return typeof fallback === 'string' && fallback ? fallback : undefined;
}

export class OAuthGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authHeader = context.metadata?.authorization;
    const rawToken = tokenFromAuthMetadata(context.metadata);
    const toolName = context.toolName ?? 'unknown';
    context.logger.debug('[MCP-AUTH] guard received', {
      toolName,
      bearerPresent: Boolean(rawToken),
      bearerScheme: typeof authHeader === 'string' ? authHeader.trim().split(/\s+/, 1)[0]?.toLowerCase() || 'missing' : 'missing',
    });
    if (!OAuthModule.isAuthRequired()) {
      if (typeof rawToken === 'string') await this.attachAuth(context, rawToken, false);
      return true;
    }
    if (typeof rawToken !== 'string' || !rawToken) {
      context.logger.warn('[MCP-AUTH] guard rejected request', { toolName, reason: 'missing_bearer_token' });
      throw new XIntelligenceError('AUTHENTICATION_ERROR', 'OAuth access token required.', false);
    }
    try {
      await this.attachAuth(context, rawToken, true);
    } catch (error) {
      context.logger.warn('[MCP-AUTH] guard rejected request', { toolName, reason: 'token_validation_failed' });
      throw error;
    }
    context.logger.info('[MCP-AUTH] guard accepted request', {
      toolName,
      audienceValidated: true,
      scopeCount: context.auth?.scopes?.length ?? 0,
      scopes: context.auth?.scopes ?? [],
    });
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
