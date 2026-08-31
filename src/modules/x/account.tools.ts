import { Cache, ExecutionContext, RateLimit, ToolDecorator as Tool, UseGuards, Widget, z, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { paginationSchema, usernameSchema, userIdSchema } from './x.schemas.js';
import { XService } from './x.service.js';

@Injectable({ deps: [XService] })
export class XAccountTools {
  constructor(private readonly x: XService) {}

  @Tool({ name: 'x_get_my_profile', description: 'Get the authenticated X account profile and public metrics.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 30, window: '1m' })
  @Widget('account-profile')
  async getMyProfile(_input: Record<string, never>, _ctx: ExecutionContext) { return this.x.getMe(); }

  @Tool({ name: 'x_get_user', description: 'Look up an X user by numeric ID or exact username.', inputSchema: z.union([z.object({ id: userIdSchema }), z.object({ username: usernameSchema })]), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 60, window: '1m' })
  @Widget('account-profile')
  async getUser(input: { id?: string; username?: string }, _ctx: ExecutionContext) { return this.x.getUser(input); }

  @Tool({ name: 'x_search_users', description: 'Resolve up to 100 exact X usernames. X API v2 does not provide broad free-text user search; this tool intentionally performs exact handle lookup.', inputSchema: z.object({ usernames: z.array(usernameSchema).min(1).max(100) }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 30, window: '1m' })
  async searchUsers(input: { usernames: string[] }, _ctx: ExecutionContext) { return this.x.searchUsers(input.usernames); }

  @Tool({ name: 'x_get_user_posts', description: 'Get an X user’s posts with normalized author, media, and engagement data.', inputSchema: z.object({ userId: userIdSchema, ...paginationSchema.shape }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 30, window: '1m' })
  @Widget('post-feed')
  async getUserPosts(input: { userId: string; maxResults: number; paginationToken?: string }, _ctx: ExecutionContext) { return this.x.getUserPosts(input.userId, input); }

  @Tool({ name: 'x_get_followers', description: 'Get a paginated list of an X user’s followers.', inputSchema: z.object({ userId: userIdSchema, ...paginationSchema.shape }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('followers-dashboard')
  async getFollowers(input: { userId: string; maxResults: number; paginationToken?: string }, _ctx: ExecutionContext) { return this.x.getFollowers(input.userId, input); }

  @Tool({ name: 'x_get_following', description: 'Get a paginated list of accounts followed by an X user.', inputSchema: z.object({ userId: userIdSchema, ...paginationSchema.shape }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  @Widget('followers-dashboard')
  async getFollowing(input: { userId: string; maxResults: number; paginationToken?: string }, _ctx: ExecutionContext) { return this.x.getFollowing(input.userId, input); }

  @Tool({ name: 'x_get_mentions', description: 'Get posts mentioning an X user, with pagination.', inputSchema: z.object({ userId: userIdSchema, ...paginationSchema.shape }), annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 30, window: '1m' })
  @Widget('mentions-dashboard')
  async getMentions(input: { userId: string; maxResults: number; paginationToken?: string }, _ctx: ExecutionContext) { return this.x.getMentions(input.userId, input); }
}
