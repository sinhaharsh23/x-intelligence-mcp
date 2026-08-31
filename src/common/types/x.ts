export interface RateLimitState {
  endpoint: string;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  observedAt: string;
}

export interface XApiEnvelope<T> {
  data?: T;
  includes?: XIncludes;
  meta?: XMeta;
  errors?: XApiProblem[];
}

export interface XApiProblem {
  title?: string;
  detail?: string;
  type?: string;
  status?: number;
  resource_type?: string;
  parameter?: string;
  value?: string;
}

export interface XMeta {
  result_count?: number;
  next_token?: string;
  previous_token?: string;
  newest_id?: string;
  oldest_id?: string;
}

export interface XUserRaw {
  id: string;
  name: string;
  username: string;
  description?: string;
  created_at?: string;
  verified?: boolean;
  verified_type?: string;
  profile_image_url?: string;
  protected?: boolean;
  public_metrics?: { followers_count?: number; following_count?: number; tweet_count?: number; listed_count?: number };
  pinned_tweet_id?: string;
  url?: string;
  location?: string;
}

export interface XMediaRaw {
  media_key?: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  alt_text?: string;
  duration_ms?: number;
}

export interface XPostRaw {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  conversation_id?: string;
  lang?: string;
  edit_history_tweet_ids?: string[];
  referenced_tweets?: Array<{ type: 'replied_to' | 'quoted' | 'retweeted'; id: string }>;
  attachments?: { media_keys?: string[]; poll_ids?: string[] };
  public_metrics?: { like_count?: number; reply_count?: number; repost_count?: number; quote_count?: number; bookmark_count?: number; impression_count?: number };
  entities?: { hashtags?: Array<{ tag: string }>; mentions?: Array<{ username: string; id: string }>; urls?: Array<{ expanded_url?: string; url?: string }> };
  context_annotations?: Array<{ domain?: { name?: string }; entity?: { name?: string } }>;
}

export interface XIncludes {
  users?: XUserRaw[];
  media?: XMediaRaw[];
  tweets?: XPostRaw[];
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  bio?: string;
  createdAt?: string;
  verified?: boolean;
  verifiedType?: string;
  avatarUrl?: string;
  protected?: boolean;
  location?: string;
  publicMetrics?: { followers?: number; following?: number; posts?: number; listed?: number };
}

export interface Post {
  id: string;
  text: string;
  authorId?: string;
  author?: UserProfile;
  createdAt?: string;
  conversationId?: string;
  language?: string;
  referencedPosts?: Array<{ type: 'replied_to' | 'quoted' | 'retweeted'; id: string }>;
  media: XMediaRaw[];
  metrics: { likes?: number; replies?: number; reposts?: number; quotes?: number; bookmarks?: number; impressions?: number };
  hashtags: string[];
  mentions: string[];
  urls?: string[];
}

export interface Pagination<T> {
  data: T[];
  pagination: { resultCount: number; nextToken?: string; previousToken?: string };
}

export interface CapabilityState {
  configured: boolean;
  authenticationMode: 'user' | 'app' | 'none';
  scopes: string[];
  readProfile: boolean;
  searchPosts: boolean;
  readFollowers: boolean;
  readFollowing: boolean;
  readMentions: boolean;
  createPost: boolean;
  deletePost: boolean;
  likePost: boolean;
  followUser: boolean;
  mediaUpload: boolean;
  refreshToken: boolean;
  xAuthEnabled: boolean;
  notes: string[];
  authorization: {
    state: 'not_configured' | 'manual_token' | 'oauth_connected' | 'token_expired';
    oauthConfigured: boolean;
    refreshAvailable: boolean;
    readAccess: boolean;
    writeAccess: boolean;
    grantedScopes: string[];
    redirectUri: string;
    authenticated: boolean;
    tokenExpiresAt?: string;
  };
}
