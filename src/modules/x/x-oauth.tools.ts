import { ExecutionContext, Injectable, RateLimit, ToolDecorator as Tool, UseGuards, Widget, z } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { confirmSchema } from './x.schemas.js';
import { XOAuthService } from './x-oauth.service.js';

@Injectable({ deps: [XOAuthService] })
export class XOAuthTools {
  constructor(private readonly oauth: XOAuthService) {}

  @Tool({ name: 'x_disconnect', description: 'Clear the locally stored X OAuth token state. This does not revoke access on X.', inputSchema: confirmSchema, annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false, openWorldHint: false } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('authorization-status')
  async disconnect(_input: { confirm: true }, _ctx: ExecutionContext) { return this.oauth.disconnect(); }

  @Tool({ name: 'x_get_authorization_status', description: 'Report local X OAuth connection state, refresh availability, read/write access, and granted scopes without exposing tokens.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 60, window: '1m' })
  @Widget('authorization-status')
  async authorizationStatus(_input: Record<string, never>, _ctx: ExecutionContext) { return this.oauth.getStatus(); }
}
