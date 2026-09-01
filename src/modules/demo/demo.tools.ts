import { ExecutionContext, InitialTool, Injectable, RateLimit, ToolDecorator as Tool, UseGuards, Widget, z } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { postIdSchema, searchSchema, userLookupSchema, userPaginationSchema } from '../x/x.schemas.js';
import { XService } from '../x/x.service.js';

/**
 * Presentation-only read surface. Full mode continues to register the original
 * X controllers; this controller deliberately exposes only the bounded
 * presentation surface so NitroStudio stays within its Canvas limit.
 */
@Injectable({ deps: [XService] })
export class DemoReadTools {
  constructor(private readonly x: XService) {}

  @Tool({ name: 'x_get_capabilities', description: 'Report capabilities derived from configured credentials, OAuth connection state, granted X scopes, authentication mode, and known endpoint requirements.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false } })
  @InitialTool()
  @UseGuards(OAuthGuard)
  @Widget('dashboard')
  async getCapabilities(_input: Record<string, never>, _ctx: ExecutionContext) { return this.x.getCapabilities(); }

  @Tool({ name: 'x_get_user', description: 'Look up an X user by numeric ID or exact username.', inputSchema: userLookupSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 60, window: '1m' })
  @Widget('account-profile')
  async getUser(input: { id?: string; username?: string }, _ctx: ExecutionContext) { return this.x.getUser(input); }

  @Tool({ name: 'x_get_post', description: 'Get one X post by ID, including author, media, references, and public metrics.', inputSchema: z.object({ postId: postIdSchema }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 60, window: '1m' })
  @Widget('post-card')
  async getPost(input: { postId: string }, _ctx: ExecutionContext) { return this.x.getPost(input.postId); }

  @Tool({ name: 'x_search_posts', description: 'Search recent X posts using safe X search operators and supported filters.', inputSchema: searchSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('search-dashboard')
  async searchPosts(input: z.infer<typeof searchSchema>, _ctx: ExecutionContext) { return this.x.searchPosts(input); }

  @Tool({ name: 'x_get_user_posts', description: 'Get an X user’s posts with normalized author, media, and engagement data.', inputSchema: userPaginationSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 30, window: '1m' })
  @Widget('post-card')
  async getUserPosts(input: z.infer<typeof userPaginationSchema>, _ctx: ExecutionContext) { const userId = await this.x.resolveUserId(input); return { ...(await this.x.getUserPosts(userId, input)), listType: 'user_posts' }; }

  @Tool({ name: 'x_get_followers', description: 'Get a paginated list of an X user’s followers.', inputSchema: userPaginationSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('post-card')
  async getFollowers(input: z.infer<typeof userPaginationSchema>, _ctx: ExecutionContext) { const userId = await this.x.resolveUserId(input); return { ...(await this.x.getFollowers(userId, input)), listType: 'followers' }; }

  @Tool({ name: 'x_get_following', description: 'Get a paginated list of accounts followed by an X user.', inputSchema: userPaginationSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('post-card')
  async getFollowing(input: z.infer<typeof userPaginationSchema>, _ctx: ExecutionContext) { const userId = await this.x.resolveUserId(input); return { ...(await this.x.getFollowing(userId, input)), listType: 'following' }; }

  @Tool({ name: 'x_get_mentions', description: 'Get posts mentioning an X user, with pagination.', inputSchema: userPaginationSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 30, window: '1m' })
  @Widget('post-card')
  async getMentions(input: z.infer<typeof userPaginationSchema>, _ctx: ExecutionContext) { const userId = await this.x.resolveUserId(input); return { ...(await this.x.getMentions(userId, input)), listType: 'mentions' }; }

}
