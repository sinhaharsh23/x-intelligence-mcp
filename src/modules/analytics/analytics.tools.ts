import { ExecutionContext, RateLimit, ToolDecorator as Tool, UseGuards, Widget, z, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { postIdSchema, userIdSchema } from '../x/x.schemas.js';
import { XService } from '../x/x.service.js';
import { AnalyticsService } from './analytics.service.js';

const sampleSchema = z.object({ userId: userIdSchema, maxResults: z.number().int().min(10).max(100).default(50) });

@Injectable({ deps: [XService, AnalyticsService] })
export class AnalyticsTools {
  constructor(private readonly x: XService, private readonly analytics: AnalyticsService) {}

  @Tool({ name: 'x_analyze_profile', description: 'Compute deterministic account analytics from a real X profile and a bounded recent-post sample. Calculations are labeled Derived Metric.', inputSchema: sampleSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('analytics-dashboard')
  async analyzeProfile(input: { userId: string; maxResults: number }, _ctx: ExecutionContext) { const user = await this.x.getUser({ id: input.userId }); const posts = await this.x.getUserPosts(input.userId, { maxResults: input.maxResults }); return { user, sample: posts, analytics: this.analytics.profile(user, posts.data) }; }

  @Tool({ name: 'x_analyze_post', description: 'Analyze one real X post using deterministic engagement calculations.', inputSchema: z.object({ postId: postIdSchema }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('engagement-dashboard')
  async analyzePost(input: { postId: string }, _ctx: ExecutionContext) { const post = await this.x.getPost(input.postId); return { post, derivedMetric: { label: 'Derived Metric' as const, totalEngagement: this.analytics.engagement(post), engagementRateByFollowers: post.author?.publicMetrics?.followers ? Number((this.analytics.engagement(post) / post.author.publicMetrics.followers * 100).toFixed(4)) : undefined } }; }

  @Tool({ name: 'x_compare_accounts', description: 'Compare two or more real X accounts using X-provided metrics and locally derived sample metrics.', inputSchema: z.object({ userIds: z.array(userIdSchema).min(2).max(5), maxResults: z.number().int().min(10).max(100).default(30) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('account-comparison')
  async compareAccounts(input: { userIds: string[]; maxResults: number }, _ctx: ExecutionContext) { const rows = await Promise.all(input.userIds.map(async (id) => { const user = await this.x.getUser({ id }); const posts = await this.x.getUserPosts(id, { maxResults: input.maxResults }); return { xProvided: user, sample: posts, derived: this.analytics.profile(user, posts.data) }; })); return { label: 'X Intelligence MCP account comparison', accounts: rows }; }

  @Tool({ name: 'x_analyze_content_performance', description: 'Analyze a real set of post IDs and return derived engagement distribution and strongest posts.', inputSchema: z.object({ postIds: z.array(postIdSchema).min(1).max(100) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('engagement-dashboard')
  async analyzeContentPerformance(input: { postIds: string[] }, _ctx: ExecutionContext) { const posts = await this.x.getPosts(input.postIds); return { posts, analytics: this.analytics.posts(posts.data), strongestPosts: this.analytics.topPosts(posts.data, 5).map((post) => ({ post, totalEngagement: this.analytics.engagement(post) })) }; }

  @Tool({ name: 'x_analyze_mentions', description: 'Analyze real mentions for an X account using local keyword and engagement calculations.', inputSchema: sampleSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('mentions-dashboard')
  async analyzeMentions(input: { userId: string; maxResults: number }, _ctx: ExecutionContext) { const mentions = await this.x.getMentions(input.userId, { maxResults: input.maxResults }); return { mentions, analytics: this.analytics.posts(mentions.data) }; }

  @Tool({ name: 'x_find_top_posts', description: 'Find the highest-engagement posts in a real bounded sample.', inputSchema: z.object({ userId: userIdSchema, maxResults: z.number().int().min(10).max(100).default(50), limit: z.number().int().min(1).max(20).default(10) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('engagement-dashboard')
  async findTopPosts(input: { userId: string; maxResults: number; limit: number }, _ctx: ExecutionContext) { const posts = await this.x.getUserPosts(input.userId, { maxResults: input.maxResults }); return { sample: posts, label: 'Derived Metric', topPosts: this.analytics.topPosts(posts.data, input.limit).map((post) => ({ post, totalEngagement: this.analytics.engagement(post) })) }; }

  @Tool({ name: 'x_analyze_posting_times', description: 'Calculate active posting hours from a real X post sample. Hours are UTC and labeled Derived Metric.', inputSchema: sampleSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('content-calendar')
  async analyzePostingTimes(input: { userId: string; maxResults: number }, _ctx: ExecutionContext) { const posts = await this.x.getUserPosts(input.userId, { maxResults: input.maxResults }); return { sample: posts, label: 'Derived Metric', postingTimes: this.analytics.posts(posts.data).activePostingHours }; }
}
