import { Module } from '@nitrostack/core';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { AnalyticsTools } from '../analytics/analytics.tools.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { AIRegistry } from '../ai/ai.registry.js';
import { AIService } from '../ai/ai.service.js';
import { AITools } from '../ai/ai.tools.js';
import { GroundingService } from '../ai/grounding/grounding.service.js';
import { XOAuthTokenStore } from '../x/x-oauth.store.js';
import { XService } from '../x/x.service.js';
import { DemoAITools } from './demo.ai-tools.js';
import { DemoAnalyticsTools } from './demo.analytics-tools.js';
import { DemoReadTools } from './demo.tools.js';

@Module({
  name: 'demo',
  description: 'NitroStudio presentation-only MCP surface. Full production modules are used when DEMO_CANVAS_MODE=false.',
  controllers: [DemoReadTools, DemoAnalyticsTools, DemoAITools],
  providers: [
    XOAuthTokenStore,
    XService,
    AnalyticsService,
    AnalyticsTools,
    IntelligenceService,
    AIRegistry,
    GroundingService,
    AIService,
    AITools,
  ],
  exports: [XService, AIService],
})
export class DemoModule {}
