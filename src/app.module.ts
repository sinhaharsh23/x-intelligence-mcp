import { ConfigModule, McpApp, Module, OAuthModule } from '@nitrostack/core';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { IntelligenceModule } from './modules/intelligence/intelligence.module.js';
import { XModule } from './modules/x/x.module.js';
import { XOAuthModule } from './modules/x/x-oauth.module.js';
import { SystemHealthCheck } from './health/system.health.js';
import { AIModule } from './modules/ai/ai.module.js';
import { DemoModule } from './modules/demo/demo.module.js';
import { MCP_SERVER_DESCRIPTION, MCP_SERVER_NAME, MCP_SERVER_VERSION } from './common/compatibility.js';
import { McpToolCompatibility } from './common/mcp-tool-compatibility.js';
import { McpBoundaryDiagnostics } from './common/mcp-boundary-diagnostics.js';
import { configuredAuth0Audiences, hasValidAuth0Issuer } from './common/config/auth0.js';
import { getConfig } from './common/config/env.js';

const demoCanvasMode = process.env.DEMO_CANVAS_MODE === 'true';
const auth0Audiences = configuredAuth0Audiences(getConfig());
// NitroStack 1.0.15 types audience as string, while its RFC 8707 validator
// accepts string[] at runtime. Pass the native multi-audience value through.
const nitroStackAudience = auth0Audiences.length > 1
  ? auth0Audiences as unknown as string
  : auth0Audiences[0];

@McpApp({
  module: AppModule,
  server: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
  logging: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' },
  transport: { type: 'dual', http: { port: Number(process.env.PORT || 3000) } },
})
@Module({
  name: 'app',
  description: MCP_SERVER_DESCRIPTION,
  imports: [
    ConfigModule.forRoot(),
    OAuthModule.forRoot({
      required: process.env.OAUTH_REQUIRED === 'true',
      resourceUri: process.env.RESOURCE_URI || 'https://mcplocal',
      authorizationServers: [process.env.AUTH_SERVER_URL || 'https://x.com'],
      scopesSupported: ['read', 'write'],
      tokenIntrospectionEndpoint: process.env.INTROSPECTION_ENDPOINT,
      tokenIntrospectionClientId: process.env.INTROSPECTION_CLIENT_ID,
      tokenIntrospectionClientSecret: process.env.INTROSPECTION_CLIENT_SECRET,
      audience: nitroStackAudience,
      issuer: process.env.TOKEN_ISSUER,
      customValidation: (payload) => hasValidAuth0Issuer(payload, process.env.TOKEN_ISSUER),
    }),
    ...(demoCanvasMode
      ? [DemoModule]
      : [XModule, XOAuthModule.forRoot(), AnalyticsModule, IntelligenceModule, AIModule]),
  ],
  providers: [SystemHealthCheck, McpToolCompatibility, McpBoundaryDiagnostics],
})
export class AppModule {}
