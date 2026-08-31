import { Injectable } from '@nitrostack/core';
import type { Post, UserProfile } from '../../common/types/x.js';

export interface DerivedAnalytics {
  label: 'Derived Metric';
  sampleSize: number;
  followerFollowingRatio?: number;
  averageLikes?: number;
  averageReplies?: number;
  averageReposts?: number;
  averageQuotes?: number;
  averageImpressions?: number;
  averageEngagement?: number;
  postingFrequencyPerDay?: number;
  engagementDistribution: { low: number; medium: number; high: number };
  commonHashtags: Array<{ hashtag: string; count: number }>;
  activePostingHours: Array<{ hourUtc: number; posts: number }>;
}

@Injectable()
export class AnalyticsService {
  profile(user: UserProfile, posts: Post[]): DerivedAnalytics { const metrics = this.posts(posts); const followers = user.publicMetrics?.followers; const following = user.publicMetrics?.following; return { ...metrics, followerFollowingRatio: typeof followers === 'number' && typeof following === 'number' && following > 0 ? Number((followers / following).toFixed(2)) : undefined }; }

  posts(posts: Post[]): DerivedAnalytics {
    const size = posts.length;
    const average = (values: Array<number | undefined>): number | undefined => { const available = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)); return available.length ? Number((available.reduce((sum, value) => sum + value, 0) / available.length).toFixed(2)) : undefined; };
    const hashtagCounts = new Map<string, number>();
    const hourCounts = new Map<number, number>();
    const likes: Array<number | undefined> = []; const replies: Array<number | undefined> = []; const reposts: Array<number | undefined> = []; const quotes: Array<number | undefined> = []; const impressions: Array<number | undefined> = [];
    const engagement: number[] = [];
    for (const post of posts) {
      likes.push(post.metrics.likes); replies.push(post.metrics.replies); reposts.push(post.metrics.reposts); quotes.push(post.metrics.quotes); impressions.push(post.metrics.impressions);
      const engagementParts = [post.metrics.likes, post.metrics.replies, post.metrics.reposts, post.metrics.quotes].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      if (engagementParts.length) engagement.push(engagementParts.reduce((sum, value) => sum + value, 0));
      for (const hashtag of post.hashtags) hashtagCounts.set(hashtag.toLowerCase(), (hashtagCounts.get(hashtag.toLowerCase()) ?? 0) + 1);
      if (post.createdAt) { const hour = new Date(post.createdAt).getUTCHours(); hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1); }
    }
    const median = engagement.length ? [...engagement].sort((a, b) => a - b)[Math.floor(engagement.length / 2)] : 0;
    const distribution = { low: engagement.filter((value) => value <= median).length, medium: engagement.filter((value) => value > median && value <= median * 2).length, high: engagement.filter((value) => value > median * 2).length };
    const first = posts.map((post) => post.createdAt).filter((value): value is string => Boolean(value)).sort()[0];
    const last = posts.map((post) => post.createdAt).filter((value): value is string => Boolean(value)).sort().at(-1);
    const days = first && last ? Math.max((Date.parse(last) - Date.parse(first)) / 86_400_000, 1) : undefined;
    return { label: 'Derived Metric', sampleSize: size, averageLikes: average(likes), averageReplies: average(replies), averageReposts: average(reposts), averageQuotes: average(quotes), averageImpressions: average(impressions), averageEngagement: average(engagement), postingFrequencyPerDay: days ? Number((size / days).toFixed(2)) : undefined, engagementDistribution: distribution, commonHashtags: [...hashtagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([hashtag, count]) => ({ hashtag, count })), activePostingHours: [...hourCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([hourUtc, count]) => ({ hourUtc, posts: count })) };
  }

  topPosts(posts: Post[], limit: number): Post[] { return [...posts].sort((a, b) => this.engagement(b) - this.engagement(a)).slice(0, limit); }
  engagement(post: Post): number { return [post.metrics.likes, post.metrics.replies, post.metrics.reposts, post.metrics.quotes].filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).reduce((sum, value) => sum + value, 0); }
}
