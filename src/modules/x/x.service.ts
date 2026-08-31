import { Cache, Injectable, clearCache } from '@nitrostack/core';
import { getConfig } from '../../common/config/env.js';
import { XIntelligenceError } from '../../common/errors/x-errors.js';
import type { CapabilityState, Pagination, Post, RateLimitState, UserProfile, XApiEnvelope, XIncludes, XPostRaw, XUserRaw } from '../../common/types/x.js';
import { XApiClient } from './x.client.js';
import { XOAuthTokenStore } from './x-oauth.store.js';

type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PUT';

const USER_FIELDS = 'created_at,description,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,verified_type';
const POST_FIELDS = 'author_id,context_annotations,conversation_id,created_at,edit_history_tweet_ids,entities,lang,public_metrics,referenced_tweets,text,attachments';
const EXPANSIONS = 'author_id,attachments.media_keys,referenced_tweets.id';

@Injectable({ deps: [XOAuthTokenStore] })
export class XService {
  readonly client: XApiClient;
  private readonly recentPostFingerprints = new Map<string, number>();

  constructor(tokenStore = new XOAuthTokenStore()) { this.client = new XApiClient(getConfig(), tokenStore); }

  @Cache({ ttl: 30, key: (input) => `x:user:${JSON.stringify(input)}` })
  async getUser(input: { id?: string; username?: string }): Promise<UserProfile> {
    const path = input.id ? `/2/users/${encodeURIComponent(input.id)}` : `/2/users/by/username/${encodeURIComponent(input.username ?? '')}`;
    const response = await this.client.request<XUserRaw>(path, { query: { 'user.fields': USER_FIELDS } });
    if (!response.data) throw new XIntelligenceError('NOT_FOUND', 'X user was not found.');
    return this.normalizeUser(response.data);
  }

  async getMe(): Promise<UserProfile> {
    const response = await this.client.request<XUserRaw>('/2/users/me', { auth: 'user', query: { 'user.fields': USER_FIELDS } });
    if (!response.data) throw new XIntelligenceError('NOT_FOUND', 'Authenticated X user was not returned.');
    return this.normalizeUser(response.data);
  }

  async searchUsers(usernames: string[]): Promise<Pagination<UserProfile>> {
    const response = await this.client.request<XUserRaw[]>('/2/users/by', { query: { usernames: usernames.join(','), 'user.fields': USER_FIELDS } });
    return this.normalizeList(response, (user) => this.normalizeUser(user));
  }

  async getUserPosts(userId: string, options: PaginationOptions = {}): Promise<Pagination<Post>> {
    const response = await this.client.request<XPostRaw[]>(`/2/users/${encodeURIComponent(userId)}/tweets`, { query: this.postQuery(options, { exclude: 'replies' }) });
    return this.normalizeList(response, (post, includes) => this.normalizePost(post, includes));
  }

  async getFollowers(userId: string, options: PaginationOptions = {}): Promise<Pagination<UserProfile>> {
    const response = await this.client.request<XUserRaw[]>(`/2/users/${encodeURIComponent(userId)}/followers`, { query: { ...this.pageQuery(options), 'user.fields': USER_FIELDS } });
    return this.normalizeList(response, (user) => this.normalizeUser(user));
  }

  async getFollowing(userId: string, options: PaginationOptions = {}): Promise<Pagination<UserProfile>> {
    const response = await this.client.request<XUserRaw[]>(`/2/users/${encodeURIComponent(userId)}/following`, { query: { ...this.pageQuery(options), 'user.fields': USER_FIELDS } });
    return this.normalizeList(response, (user) => this.normalizeUser(user));
  }

  async getMentions(userId: string, options: PaginationOptions = {}): Promise<Pagination<Post>> {
    const response = await this.client.request<XPostRaw[]>(`/2/users/${encodeURIComponent(userId)}/mentions`, { query: this.postQuery(options) });
    return this.normalizeList(response, (post, includes) => this.normalizePost(post, includes));
  }

  @Cache({ ttl: 45, key: (input) => `x:post:${JSON.stringify(input)}` })
  async getPost(id: string): Promise<Post> {
    const response = await this.client.request<XPostRaw>(`/2/tweets/${encodeURIComponent(id)}`, { query: this.postFieldsQuery() });
    if (!response.data) throw new XIntelligenceError('NOT_FOUND', 'X post was not found.');
    return this.normalizePost(response.data, response.includes);
  }

  async getPosts(ids: string[]): Promise<Pagination<Post>> {
    const response = await this.client.request<XPostRaw[]>('/2/tweets', { query: { ids: ids.join(','), 'tweet.fields': POST_FIELDS, expansions: EXPANSIONS, 'user.fields': USER_FIELDS, 'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width' } });
    return this.normalizeList(response, (post, includes) => this.normalizePost(post, includes));
  }

  @Cache({ ttl: 15, key: (input) => `x:search:${JSON.stringify(input)}` })
  async searchPosts(options: SearchOptions): Promise<Pagination<Post>> {
    const query = buildSearchQuery(options);
    const response = await this.client.request<XPostRaw[]>('/2/tweets/search/recent', { query: this.postQuery(options, { query }) });
    return this.normalizeList(response, (post, includes) => this.normalizePost(post, includes));
  }

  async getThread(postId: string): Promise<{ posts: Post[]; conversationId?: string; truncated: boolean }> {
    const posts: Post[] = [];
    let currentId: string | undefined = postId;
    let truncated = false;
    for (let index = 0; currentId && index < 20; index += 1) {
      const post = await this.getPost(currentId);
      posts.unshift(post);
      currentId = post.referencedPosts?.find((reference) => reference.type === 'replied_to')?.id;
      if (post.conversationId && index === 0) {
        const conversation = await this.searchPosts({ query: `conversation_id:${post.conversationId}`, maxResults: 100 });
        const known = new Set(posts.map((item) => item.id));
        for (const item of conversation.data) if (!known.has(item.id)) posts.push(item);
        posts.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
        return { posts, conversationId: post.conversationId, truncated: false };
      }
    }
    if (currentId) truncated = true;
    return { posts, conversationId: posts[posts.length - 1]?.conversationId, truncated };
  }

  async getReplies(postId: string, options: PaginationOptions = {}): Promise<Pagination<Post>> { const root = await this.getPost(postId); return this.searchPosts({ query: `conversation_id:${root.conversationId ?? postId}`, excludeReplies: false, maxResults: options.maxResults, paginationToken: options.paginationToken }); }
  async getConversation(postId: string, options: PaginationOptions = {}): Promise<Pagination<Post>> { const root = await this.getPost(postId); return this.searchPosts({ query: `conversation_id:${root.conversationId ?? postId}`, maxResults: options.maxResults, paginationToken: options.paginationToken }); }
  async getQuotePosts(postId: string, options: PaginationOptions = {}): Promise<Pagination<Post>> { return this.listPostRelation(`/2/tweets/${encodeURIComponent(postId)}/quote_tweets`, options); }
  async getReposts(postId: string, options: PaginationOptions = {}): Promise<Pagination<UserProfile>> {
    const response = await this.client.request<XUserRaw[]>(`/2/tweets/${encodeURIComponent(postId)}/retweeted_by`, { query: { ...this.pageQuery(options), 'user.fields': USER_FIELDS } });
    return this.normalizeList(response, (user) => this.normalizeUser(user));
  }

  async createPost(input: { text?: string; replyToPostId?: string; quotePostId?: string; mediaIds?: string[] }): Promise<Post> {
    const releaseReservation = this.reservePostWrite(input);
    const body: Record<string, unknown> = {};
    if (input.text) body.text = input.text;
    if (input.replyToPostId) body.reply = { in_reply_to_tweet_id: input.replyToPostId };
    if (input.quotePostId) body.quote_tweet_id = input.quotePostId;
    if (input.mediaIds?.length) body.media = { media_ids: input.mediaIds };
    try {
      const response = await this.client.request<XPostRaw>('/2/tweets', { method: 'POST', auth: 'user', body, retryable: false });
      if (!response.data) throw new XIntelligenceError('X_API_ERROR', 'X did not return the created post.');
      await clearCache();
      return this.normalizePost(response.data, response.includes);
    } catch (error) {
      releaseReservation();
      throw error;
    }
  }

  async createThread(posts: Array<{ text: string }>): Promise<{ successfulPosts: Array<{ index: number; postId: string; text: string }>; failedIndex?: number; failureReason?: string }> {
    const successfulPosts: Array<{ index: number; postId: string; text: string }> = [];
    let replyToPostId: string | undefined;
    for (let index = 0; index < posts.length; index += 1) {
      try {
        const created = await this.createPost({ text: posts[index].text, replyToPostId });
        successfulPosts.push({ index, postId: created.id, text: created.text });
        replyToPostId = created.id;
      } catch (error) {
        return { successfulPosts, failedIndex: index, failureReason: error instanceof Error ? error.message : 'Unknown X API failure.' };
      }
    }
    return { successfulPosts };
  }

  async deletePost(id: string): Promise<{ id: string; deleted: boolean }> {
    const response = await this.client.request<{ deleted?: boolean }>(`/2/tweets/${encodeURIComponent(id)}`, { method: 'DELETE', auth: 'user', retryable: false });
    await clearCache();
    return { id, deleted: response.data?.deleted === true };
  }

  async likePost(postId: string): Promise<{ liked: boolean; postId: string }> { await this.userAction(`/2/users/${await this.meId()}/likes`, { tweet_id: postId }, 'POST'); return { liked: true, postId }; }
  async unlikePost(postId: string): Promise<{ liked: boolean; postId: string }> { await this.userAction(`/2/users/${await this.meId()}/likes/${postId}`, undefined, 'DELETE'); return { liked: false, postId }; }
  async repost(postId: string): Promise<{ reposted: boolean; postId: string }> { await this.userAction(`/2/users/${await this.meId()}/retweets`, { tweet_id: postId }, 'POST'); return { reposted: true, postId }; }
  async undoRepost(postId: string): Promise<{ reposted: boolean; postId: string }> { await this.userAction(`/2/users/${await this.meId()}/retweets/${postId}`, undefined, 'DELETE'); return { reposted: false, postId }; }
  async followUser(targetUserId: string): Promise<{ following: boolean; targetUserId: string }> { const response = await this.client.request<{ following?: boolean }>(`/2/users/${await this.meId()}/following`, { method: 'POST', auth: 'user', body: { target_user_id: targetUserId }, retryable: false }); return { following: response.data?.following === true, targetUserId }; }
  async unfollowUser(targetUserId: string): Promise<{ following: boolean; targetUserId: string }> { const response = await this.client.request<{ following?: boolean }>(`/2/users/${await this.meId()}/following/${targetUserId}`, { method: 'DELETE', auth: 'user', retryable: false }); return { following: response.data?.following === true, targetUserId }; }

  async uploadMedia(input: { data: string; mediaType: string; mediaCategory: string; altText?: string }): Promise<{ id: string; mediaKey?: string; state?: string; size?: number; altTextApplied: boolean }> {
    const response = await this.client.request<{ id?: string; media_key?: string; size?: number; processing_info?: { state?: string } }>('/2/media/upload', { method: 'POST', auth: 'user', body: { media: input.data.replace(/^data:[^;]+;base64,/, ''), media_type: input.mediaType, media_category: input.mediaCategory, shared: false }, retryable: false });
    if (!response.data?.id) throw new XIntelligenceError('X_API_ERROR', 'X did not return a media ID.');
    if (input.altText && input.mediaType.startsWith('image/')) {
      await this.client.request('/2/media/metadata', { method: 'POST', auth: 'user', body: { id: response.data.id, metadata: { alt_text: { text: input.altText } } }, retryable: false });
    }
    return { id: response.data.id, mediaKey: response.data.media_key, size: response.data.size, state: response.data.processing_info?.state, altTextApplied: Boolean(input.altText && input.mediaType.startsWith('image/')) };
  }

  async getCapabilities(): Promise<CapabilityState> {
    const hasUser = this.client.hasUserToken;
    const hasApp = this.client.configured;
    const scopes = this.client.scopes;
    const allows = (scope: string) => !scopes.length || scopes.includes(scope);
    const token = this.client.oauthToken;
    const hasManual = Boolean(this.client.currentUserAccessToken && !token);
    const tokenExpired = Boolean(token?.expiresAt && token.expiresAt <= Date.now());
    const oauthState = token ? (tokenExpired ? 'token_expired' : 'oauth_connected') : (hasManual ? 'manual_token' : 'not_configured');
    const readAccess = hasApp && allows('tweet.read') && allows('users.read');
    const writeAccess = hasUser && (allows('tweet.write') || allows('like.write') || allows('follows.write') || allows('media.write'));
    const refreshAvailable = this.client.canRefresh;
    const notes: string[] = [];
    if (!hasApp) notes.push('Configure X_BEARER_TOKEN for public X reads or connect a user token for user-context operations.');
    if (!hasUser && !getConfig().X_AUTH_ENABLED) notes.push('X user authentication is disabled for development; user-context tools return AUTH_DISABLED until enabled or a user token is supplied.');
    if (!hasUser && getConfig().X_AUTH_ENABLED) notes.push('User-context operations require X OAuth or X_ACCESS_TOKEN.');
    if (hasUser && !scopes.length) notes.push('X_SCOPES is not set; capability flags assume the configured user token may have required scopes and API responses remain authoritative.');
    return {
      configured: hasApp,
      authenticationMode: hasUser ? 'user' : (this.client.hasBearerToken ? 'app' : 'none'),
      scopes,
      readProfile: hasUser && allows('users.read'),
      searchPosts: hasApp && allows('tweet.read'),
      readFollowers: hasApp && allows('follows.read'),
      readFollowing: hasApp && allows('follows.read'),
      readMentions: hasApp && allows('tweet.read'),
      createPost: hasUser && allows('tweet.write'),
      deletePost: hasUser && allows('tweet.write'),
      likePost: hasUser && allows('like.write'),
      followUser: hasUser && allows('follows.write'),
      mediaUpload: hasUser && allows('media.write'),
      refreshToken: refreshAvailable,
      xAuthEnabled: getConfig().X_AUTH_ENABLED,
      notes,
      authorization: {
        state: oauthState,
        oauthConfigured: Boolean(getConfig().X_CLIENT_ID && getConfig().X_CLIENT_SECRET),
        refreshAvailable,
        readAccess,
        writeAccess,
        grantedScopes: scopes,
        redirectUri: getConfig().X_REDIRECT_URI ?? `${(getConfig().APP_BASE_URL ?? `http://localhost:${getConfig().PORT}`).replace(/\/$/, '')}/auth/x/callback`,
        authenticated: hasUser,
        tokenExpiresAt: token?.expiresAt ? new Date(token.expiresAt).toISOString() : undefined,
      },
    };
  }

  getRateLimits(): RateLimitState[] { return this.client.rateLimitSnapshot; }
  async health(): Promise<{ configured: boolean; connectivity: 'up' | 'down' | 'unknown'; authenticated: boolean; message?: string }> {
    if (!this.client.configured) return { configured: false, connectivity: 'unknown', authenticated: false, message: 'No X credential configured.' };
    try { if (this.client.hasUserToken) await this.getMe(); else await this.getUser({ username: 'X' }); return { configured: true, connectivity: 'up', authenticated: this.client.hasUserToken }; }
    catch (error) { return { configured: true, connectivity: 'down', authenticated: false, message: error instanceof Error ? error.message : 'X API health check failed.' }; }
  }

  private async meId(): Promise<string> { return (await this.getMe()).id; }
  private reservePostWrite(input: { text?: string; replyToPostId?: string; quotePostId?: string; mediaIds?: string[] }): () => void {
    const fingerprint = JSON.stringify({ text: input.text?.trim(), replyToPostId: input.replyToPostId, quotePostId: input.quotePostId, mediaIds: input.mediaIds ?? [] });
    const now = Date.now();
    for (const [key, timestamp] of this.recentPostFingerprints) if (now - timestamp >= 60_000) this.recentPostFingerprints.delete(key);
    const previous = this.recentPostFingerprints.get(fingerprint);
    if (previous && now - previous < 60_000) throw new XIntelligenceError('INVALID_REQUEST', 'Duplicate post blocked for 60 seconds. Confirm the content and wait before retrying.', false);
    this.recentPostFingerprints.set(fingerprint, now);
    return () => { this.recentPostFingerprints.delete(fingerprint); };
  }
  private async userAction(path: string, body: object | undefined, method: HttpMethod = 'POST'): Promise<void> {
    await this.client.request(path, { method, auth: 'user', body, retryable: false });
    await clearCache();
  }
  private async listPostRelation(path: string, options: PaginationOptions): Promise<Pagination<Post>> {
    const response = await this.client.request<XPostRaw[]>(path, { query: this.postQuery(options) });
    return this.normalizeList(response, (post, includes) => this.normalizePost(post, includes));
  }
  private pageQuery(options: PaginationOptions): Record<string, string | number | undefined> { return { max_results: options.maxResults ?? 25, pagination_token: options.paginationToken }; }
  private postFieldsQuery(): Record<string, string> { return { 'tweet.fields': POST_FIELDS, expansions: EXPANSIONS, 'user.fields': USER_FIELDS, 'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width' }; }
  private postQuery(options: PaginationOptions & { query?: string; exclude?: string; startTime?: string; endTime?: string }, extra: Record<string, string> = {}): Record<string, string | number | undefined> { return { ...extra, query: options.query, max_results: options.maxResults ?? 25, pagination_token: options.paginationToken, start_time: options.startTime, end_time: options.endTime, ...this.postFieldsQuery(), exclude: options.exclude }; }
  private normalizeList<T, R>(response: XApiEnvelope<T[]>, mapper: (item: T, includes?: XIncludes) => R): Pagination<R> { return { data: (response.data ?? []).map((item) => mapper(item, response.includes)), pagination: { resultCount: response.meta?.result_count ?? response.data?.length ?? 0, nextToken: response.meta?.next_token, previousToken: response.meta?.previous_token } }; }
  private normalizeUser(user: XUserRaw): UserProfile { return { id: user.id, name: user.name, username: user.username, bio: user.description, createdAt: user.created_at, verified: user.verified, verifiedType: user.verified_type, avatarUrl: user.profile_image_url, protected: user.protected, location: user.location, publicMetrics: user.public_metrics ? { followers: user.public_metrics.followers_count, following: user.public_metrics.following_count, posts: user.public_metrics.tweet_count, listed: user.public_metrics.listed_count } : undefined }; }
  private normalizePost(post: XPostRaw, includes?: XIncludes): Post { const author = includes?.users?.find((user) => user.id === post.author_id); const mediaKeys = new Set(post.attachments?.media_keys ?? []); const textHashtags = [...post.text.matchAll(/(?:^|\s)#([A-Za-z0-9_]+)/g)].map((match) => match[1]); const textMentions = [...post.text.matchAll(/(?:^|\s)@([A-Za-z0-9_]{1,15})/g)].map((match) => match[1]); const textUrls = [...post.text.matchAll(/https?:\/\/[^\s]+/g)].map((match) => match[0].replace(/[),.;!?]+$/, '')); return { id: post.id, text: post.text, authorId: post.author_id, author: author ? this.normalizeUser(author) : undefined, createdAt: post.created_at, conversationId: post.conversation_id, language: post.lang, referencedPosts: post.referenced_tweets, media: (includes?.media ?? []).filter((media) => media.media_key && mediaKeys.has(media.media_key)), metrics: { likes: post.public_metrics?.like_count, replies: post.public_metrics?.reply_count, reposts: post.public_metrics?.repost_count, quotes: post.public_metrics?.quote_count, bookmarks: post.public_metrics?.bookmark_count, impressions: post.public_metrics?.impression_count }, hashtags: post.entities?.hashtags?.map((item) => item.tag) ?? textHashtags, mentions: post.entities?.mentions?.map((item) => item.username) ?? textMentions, urls: post.entities?.urls?.map((item) => item.expanded_url ?? item.url).filter((value): value is string => Boolean(value)) ?? textUrls }; }
}

export interface PaginationOptions { maxResults?: number; paginationToken?: string; }
export interface SearchOptions extends PaginationOptions { query: string; username?: string; hashtag?: string; language?: string; excludeReposts?: boolean; excludeReplies?: boolean; startTime?: string; endTime?: string; }

export function buildSearchQuery(options: SearchOptions): string {
  const terms = [options.query.trim()];
  if (options.username) terms.push(`from:${options.username.replace(/^@/, '')}`);
  if (options.hashtag) terms.push(`#${options.hashtag.replace(/^#/, '')}`);
  if (options.language) terms.push(`lang:${options.language}`);
  if (options.excludeReposts) terms.push('-is:retweet');
  if (options.excludeReplies) terms.push('-is:reply');
  return terms.join(' ').replace(/\s+/g, ' ').trim();
}
