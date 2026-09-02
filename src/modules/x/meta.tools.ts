import { ExecutionContext, RateLimit, ToolDecorator as Tool, UseGuards, Widget, z, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { XService } from './x.service.js';
import { getConfig } from '../../common/config/env.js';
import { MCP_SERVER_DESCRIPTION, MCP_SERVER_NAME, MCP_SERVER_VERSION, safeAuthenticationDescription, selectedCompatibilityProvider } from '../../common/compatibility.js';

@Injectable({ deps: [XService] })
export class XMetaTools {
  constructor(private readonly x: XService) {}

  @Tool({ name: 'x_get_capabilities', description: 'Report capabilities derived from configured credentials, OAuth connection state, granted X scopes, authentication mode, and known endpoint requirements. Values are not hardcoded to true.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 60, window: '1m' })
  @Widget('authorization-status')
  async getCapabilities(_input: Record<string, never>, _ctx: ExecutionContext) { return this.x.getCapabilities(); }

  @Tool({ name: 'x_get_rate_limit_status', description: 'Return rate-limit headers observed by this server for X endpoints. Empty means no X call has yet been made.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 60, window: '1m' })
  @Widget('system-status')
  async getRateLimitStatus(_input: Record<string, never>, _ctx: ExecutionContext) { return { rates: this.x.getRateLimits() }; }

  @Tool({ name: 'x_client_compatibility', description: 'Return safe compatibility metadata for NitroStudio, ChatGPT, Claude, and generic MCP clients. This tool never exposes credentials or internal environment values.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 60, window: '1m' })
  async clientCompatibility(_input: Record<string, never>, _ctx: ExecutionContext) {
    const config = getConfig();
    return {
      server: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      description: MCP_SERVER_DESCRIPTION,
      remoteMcp: true,
      clients: {
        nitrostudio: { supported: true },
        chatgpt: { supported: true },
        claude: { supported: true },
        genericMcp: { supported: true },
      },
      transport: 'streamable-http',
      authentication: safeAuthenticationDescription(config),
      xApi: this.x.client.configured ? 'configured' : 'not-configured',
      aiProvider: selectedCompatibilityProvider(config),
      writes: 'Existing write tools remain explicit-confirmation only; this tool performs no mutation.',
    };
  }

  @Tool({ name: 'x_health_check', description: 'Report safe MCP, X configuration, connectivity, authentication, OAuth connection state, capabilities, widget, uptime, and version status without exposing credentials.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 30, window: '1m' })
  @Widget('system-status')
  async healthCheck(_input: Record<string, never>, _ctx: ExecutionContext) { const health = await this.x.health(); const capabilities = await this.x.getCapabilities(); return { server: 'up', name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION, uptimeSeconds: this.x.client.uptimeSeconds, x: health, authorization: capabilities.authorization, capabilities, widgets: { available: true, sdk: '@nitrostack/widgets 1.0.9' } }; }
}
