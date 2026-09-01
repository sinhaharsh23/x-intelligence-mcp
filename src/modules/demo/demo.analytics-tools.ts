import { ExecutionContext, Injectable, ToolDecorator as Tool, UseGuards, Widget } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { AnalyticsTools } from '../analytics/analytics.tools.js';
import { postIdSchema } from '../x/x.schemas.js';
import { z } from 'zod';

@Injectable({ deps: [AnalyticsTools] })
export class DemoAnalyticsTools {
  constructor(private readonly analytics: AnalyticsTools) {}

  @Tool({ name: 'x_analyze_post', description: 'Analyze one real X post using deterministic engagement calculations.', inputSchema: z.object({ postId: postIdSchema }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('analytics-dashboard')
  async analyzePost(input: { postId: string }, ctx: ExecutionContext) { return this.analytics.analyzePost(input, ctx); }
}
