import { ExecutionContext, RateLimit, ToolDecorator as Tool, UseGuards, Widget, z, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { postIdSchema, searchSchema, userIdSchema } from '../x/x.schemas.js';
import { XService } from '../x/x.service.js';
import { IntelligenceService } from './intelligence.service.js';

@Injectable({ deps: [XService, IntelligenceService] })
export class IntelligenceTools {
  constructor(private readonly x: XService, private readonly intelligence: IntelligenceService) {}

  @Tool({ name: 'x_search_topic', description: 'Search recent X posts for a topic and return deterministic observed signals from the bounded sample.', inputSchema: searchSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('trend-dashboard')
  async searchTopic(input: z.infer<typeof searchSchema>, _ctx: ExecutionContext) { const results = await this.x.searchPosts(input); return { results, signals: this.intelligence.topicSignals(results.data) }; }

  @Tool({ name: 'x_hashtag_analysis', description: 'Analyze hashtag frequency in a real recent-post sample. This is not a platform-wide trend claim.', inputSchema: z.object({ hashtag: z.string().trim().regex(/^#?[A-Za-z0-9_]{1,100}$/).transform((value) => value.replace(/^#/, '')), maxResults: z.number().int().min(10).max(100).default(50) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('trend-dashboard')
  async hashtagAnalysis(input: { hashtag: string; maxResults: number }, _ctx: ExecutionContext) { const results = await this.x.searchPosts({ query: `#${input.hashtag}`, maxResults: input.maxResults }); return { label: 'Observed Topic Signals', hashtag: input.hashtag, results, analysis: this.intelligence.topicSignals(results.data) }; }

  @Tool({ name: 'x_recent_topic_posts', description: 'Return recent real X posts for a topic with normalized pagination.', inputSchema: searchSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('post-feed')
  async recentTopicPosts(input: z.infer<typeof searchSchema>, _ctx: ExecutionContext) { return this.x.searchPosts(input); }

  @Tool({ name: 'x_topic_accounts', description: 'Discover accounts observed in a bounded real X topic-search sample.', inputSchema: searchSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('trend-dashboard')
  async topicAccounts(input: z.infer<typeof searchSchema>, _ctx: ExecutionContext) { const results = await this.x.searchPosts(input); return { label: 'Observed Topic Signals', sample: results, accounts: this.intelligence.topAuthors(results.data) }; }

  @Tool({ name: 'x_extract_hashtags', description: 'Extract and count hashtags from real X posts.', inputSchema: z.object({ postIds: z.array(postIdSchema).min(1).max(100) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  async extractHashtags(input: { postIds: string[] }, _ctx: ExecutionContext) { const results = await this.x.getPosts(input.postIds); return { posts: results, hashtags: this.intelligence.extractHashtags(results.data) }; }

  @Tool({ name: 'x_discover_topics', description: 'Return observed hashtags, authors, and engagement signals for a real search sample. It does not claim to represent all of X.', inputSchema: searchSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('trend-dashboard')
  async discoverTopics(input: z.infer<typeof searchSchema>, _ctx: ExecutionContext) { const results = await this.x.searchPosts(input); return this.intelligence.topicSignals(results.data); }

  @Tool({ name: 'x_find_high_engagement_posts', description: 'Find high-engagement posts in a bounded, real X search sample using deterministic metrics.', inputSchema: searchSchema.and(z.object({ limit: z.number().int().min(1).max(20).default(10) })), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('engagement-dashboard')
  async findHighEngagementPosts(input: z.infer<typeof searchSchema> & { limit: number }, _ctx: ExecutionContext) { const results = await this.x.searchPosts(input); return { sample: results, label: 'Derived Metric', posts: this.intelligence.comparePosts(results.data).slice(0, input.limit) }; }

  @Tool({ name: 'x_analyze_conversation', description: 'Analyze a real X conversation sample using deterministic post and engagement metrics.', inputSchema: z.object({ postId: postIdSchema, maxResults: z.number().int().min(10).max(100).default(50) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('conversation-viewer')
  async analyzeConversation(input: { postId: string; maxResults: number }, _ctx: ExecutionContext) { const conversation = await this.x.getConversation(input.postId, { maxResults: input.maxResults }); return { conversation, label: 'Derived Metric', ranking: this.intelligence.comparePosts(conversation.data) }; }

  @Tool({ name: 'x_compare_posts', description: 'Compare real X posts by normalized public metrics and deterministic total engagement.', inputSchema: z.object({ postIds: z.array(postIdSchema).min(2).max(100) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('engagement-dashboard')
  async comparePosts(input: { postIds: string[] }, _ctx: ExecutionContext) { const results = await this.x.getPosts(input.postIds); return { posts: results, label: 'Derived Metric', comparison: this.intelligence.comparePosts(results.data) }; }

  @Tool({ name: 'x_account_summary', description: 'Summarize a real X account with X-provided profile metrics and a local recent-post sample.', inputSchema: z.object({ userId: userIdSchema, maxResults: z.number().int().min(10).max(100).default(30) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('account-profile')
  async accountSummary(input: { userId: string; maxResults: number }, _ctx: ExecutionContext) { const user = await this.x.getUser({ id: input.userId }); const posts = await this.x.getUserPosts(input.userId, { maxResults: input.maxResults }); return this.intelligence.accountSummary(user, posts.data); }
}
