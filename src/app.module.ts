import { ConfigModule, McpApp, Module, OAuthModule } from '@nitrostack/core';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { IntelligenceModule } from './modules/intelligence/intelligence.module.js';
import { XModule } from './modules/x/x.module.js';
import { XOAuthModule } from './modules/x/x-oauth.module.js';
import { SystemHealthCheck } from './health/system.health.js';
import { AIModule } from './modules/ai/ai.module.js';
import { DemoModule } from './modules/demo/demo.module.js';

const demoCanvasMode = process.env.DEMO_CANVAS_MODE === 'true';

@McpApp({
  module: AppModule,
  server: { name: 'x-intelligence-mcp', version: '1.0.0' },
  logging: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' },
  transport: { type: 'dual', http: { port: Number(process.env.PORT || 3000) } },
})
@Module({
  name: 'app',
  description: 'X Intelligence MCP — an independent MCP integration using the official X API.',
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
      audience: process.env.TOKEN_AUDIENCE,
      issuer: process.env.TOKEN_ISSUER,
    }),
    ...(demoCanvasMode
      ? [DemoModule]
      : [XModule, XOAuthModule.forRoot(), AnalyticsModule, IntelligenceModule, AIModule]),
  ],
  providers: [SystemHealthCheck],
})
export class AppModule {}
