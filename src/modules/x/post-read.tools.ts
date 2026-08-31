import { Cache, ExecutionContext, RateLimit, ToolDecorator as Tool, UseGuards, Widget, z, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { paginationSchema, postIdSchema, searchSchema } from './x.schemas.js';
import { XService } from './x.service.js';

@Injectable({ deps: [XService] })
export class XPostReadTools {
  constructor(private readonly x: XService) {}

  @Tool({ name: 'x_get_post', description: 'Get one X post by ID, including author, media, references, and public metrics.', inputSchema: z.object({ postId: postIdSchema }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Cache({ ttl: 45 })
  @RateLimit({ requests: 60, window: '1m' })
  @Widget('post-card')
  async getPost(input: { postId: string }, _ctx: ExecutionContext) { return this.x.getPost(input.postId); }

  @Tool({ name: 'x_get_posts', description: 'Get multiple X posts by ID with normalized pagination metadata.', inputSchema: z.object({ postIds: z.array(postIdSchema).min(1).max(100) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 30, window: '1m' })
  @Widget('post-feed')
  async getPosts(input: { postIds: string[] }, _ctx: ExecutionContext) { return this.x.getPosts(input.postIds); }

  @Tool({ name: 'x_search_posts', description: 'Search recent X posts using safe X search operators and supported date/language/repost/reply filters.', inputSchema: searchSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Cache({ ttl: 15 })
  @RateLimit({ requests: 30, window: '1m' })
  @Widget('search-dashboard')
  async searchPosts(input: z.infer<typeof searchSchema>, _ctx: ExecutionContext) { return this.x.searchPosts(input); }

  @Tool({ name: 'x_get_thread', description: 'Reconstruct an X reply thread from a post and its reply ancestry, then include the conversation sample where available.', inputSchema: z.object({ postId: postIdSchema }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 15, window: '1m' })
  @Widget('thread-viewer')
  async getThread(input: { postId: string }, _ctx: ExecutionContext) { return this.x.getThread(input.postId); }

  @Tool({ name: 'x_get_replies', description: 'Get replies in the conversation for an X post.', inputSchema: z.object({ postId: postIdSchema, ...paginationSchema.shape }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('conversation-viewer')
  async getReplies(input: { postId: string; maxResults: number; paginationToken?: string }, _ctx: ExecutionContext) { return this.x.getReplies(input.postId, input); }

  @Tool({ name: 'x_get_conversation', description: 'Get a broader sampled conversation using an X conversation ID or root post ID.', inputSchema: z.object({ postId: postIdSchema, ...paginationSchema.shape }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('conversation-viewer')
  async getConversation(input: { postId: string; maxResults: number; paginationToken?: string }, _ctx: ExecutionContext) { return this.x.getConversation(input.postId, input); }

  @Tool({ name: 'x_get_quote_posts', description: 'Get posts that quote a specified X post.', inputSchema: z.object({ postId: postIdSchema, ...paginationSchema.shape }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('post-feed')
  async getQuotePosts(input: { postId: string; maxResults: number; paginationToken?: string }, _ctx: ExecutionContext) { return this.x.getQuotePosts(input.postId, input); }

  @Tool({ name: 'x_get_reposts', description: 'Get users who reposted a specified X post.', inputSchema: z.object({ postId: postIdSchema, ...paginationSchema.shape }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('followers-dashboard')
  async getReposts(input: { postId: string; maxResults: number; paginationToken?: string }, _ctx: ExecutionContext) { return this.x.getReposts(input.postId, input); }
}
