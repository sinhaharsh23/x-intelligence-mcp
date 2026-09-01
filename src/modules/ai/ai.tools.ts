import { ExecutionContext, RateLimit, ToolDecorator as Tool, UseGuards, Widget, z, Injectable } from '@nitrostack/core';
import { getConfig } from '../../common/config/env.js';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { XService } from '../x/x.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { AIService } from './ai.service.js';
import { AIIntelligenceError } from './ai.errors.js';
import { analysisInstructions } from './prompts/analysis-prompts.js';
import { audienceOutput, audienceSchema, calendarOutput, calendarSchema, contentIdeasSchema, conversationInputSchema, generatePostSchema, generateReplySchema, generateThreadSchema, hashtagOutput, hashtagSuggestionSchema, ideasOutput, improveOutput, improvePostSchema, postDraftOutput, rewriteOutput, rewritePostSchema, sentimentOutput, sentimentSchema, strategyOutput, strategySchema, summaryOutput, threadDraftOutput, threadInputSchema, trendOutput, trendSchema } from './ai.schemas.js';
import type { GroundingSource } from './grounding/grounding.types.js';

@Injectable({ deps: [XService, AnalyticsService, IntelligenceService, AIService] })
export class AITools {
  constructor(private readonly x: XService, private readonly analytics: AnalyticsService, private readonly intelligence: IntelligenceService, private readonly ai: AIService) {}

  @Tool({ name: 'x_ai_status', description: 'Report optional AI configuration and safe provider status. Health is configuration-only and does not spend generation credits.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 30, window: '1m' })
  @Widget('system-status')
  async status(_input: Record<string, never>, _ctx: ExecutionContext) { return this.ai.status(); }

  @Tool({ name: 'x_generate_post', description: 'Generate an X post draft only. This never publishes and returns provider/grounding metadata.', inputSchema: generatePostSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('composer')
  async generatePost(input: z.infer<typeof generatePostSchema>, _ctx: ExecutionContext) { return this.run(input, 'post draft', postDraftOutput, `Write one draft of at most 280 characters about ${input.topic}. Goal: ${input.goal ?? 'inform or engage'}. Tone: ${input.tone ?? 'clear and useful'}. Audience: ${input.audience ?? 'general X audience'}. Keywords: ${(input.keywords ?? []).join(', ') || 'none'}. Hashtag constraints: ${(input.hashtags ?? []).join(', ') || 'none'}. Return every field: draft, characterCount, suggestedHashtags (array), rationale, and warnings (array; use [] when none). Include a brief rationale and warnings.`, [userSource('brief', input)]); }

  @Tool({ name: 'x_generate_thread', description: 'Generate ordered X thread drafts only. This never publishes.', inputSchema: generateThreadSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('composer')
  async generateThread(input: z.infer<typeof generateThreadSchema>, _ctx: ExecutionContext) { return this.run(input, 'thread draft', threadDraftOutput, `Write exactly ${input.numberOfPosts ?? 3} ordered post drafts, each at most 280 characters, about ${input.topic}. Goal: ${input.goal ?? 'inform or engage'}. Tone: ${input.tone ?? 'clear and useful'}. Audience: ${input.audience ?? 'general X audience'}. Constraints: ${(input.constraints ?? []).join('; ') || 'none'}. Return every field: posts (with draft and characterCount for each), summary, and warnings (array; use [] when none). Make the sequence coherent and label warnings for unsupported facts.`, [userSource('brief', input)]); }

  @Tool({ name: 'x_generate_reply', description: 'Generate a reply draft from a real X post or supplied post text. This never replies automatically.', inputSchema: generateReplySchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('composer')
  async generateReply(input: z.infer<typeof generateReplySchema>, _ctx: ExecutionContext) { return this.ai.runWithSources({ task: 'reply draft', schema: postDraftOutput, instructions: `Write one reply draft of at most 280 characters. Goal: ${input.goal ?? 'be relevant and useful'}. Tone: ${input.tone}. Return every field: draft, characterCount, suggestedHashtags (array), rationale, and warnings (array; use [] when none). Do not invent facts beyond the grounded post.`, loadSources: async () => [input.postId ? { sourceType: 'x_api', label: 'source post', data: await this.x.getPost(input.postId) } : userSource('supplied post text', input.postText), ...(input.context ? [userSource('additional context', input.context)] : [])] }); }

  @Tool({ name: 'x_rewrite_post', description: 'Rewrite supplied text into a draft while preserving factual claims where requested. This never publishes.', inputSchema: rewritePostSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('composer')
  async rewritePost(input: z.infer<typeof rewritePostSchema>, _ctx: ExecutionContext) { return this.run(input, 'post rewrite', rewriteOutput, `Rewrite the supplied post for the goal "${input.goal}"${input.customGoal ? ` (${input.customGoal})` : ''}. Keep it at most 280 characters. Return every field: draft, characterCount, changed (array), and warnings (array; use [] when none). ${input.preserveFacts ? 'Preserve every factual claim and warn if that cannot be guaranteed.' : 'You may change framing, but do not introduce unsupported facts.'}`, [userSource('text to rewrite', input.text), ...(input.context ? [userSource('additional context', input.context)] : [])]); }

  @Tool({ name: 'x_improve_post', description: 'Improve supplied post text as a draft and explain changes. This never publishes.', inputSchema: improvePostSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('composer')
  async improvePost(input: z.infer<typeof improvePostSchema>, _ctx: ExecutionContext) { return this.run(input, 'post improvement', improveOutput, `Improve the post for ${input.goal ?? 'clarity and usefulness'} and audience ${input.audience ?? 'the intended X audience'}. Keep the improved draft at most 280 characters. Return every field: original, improvedDraft, whatChanged (array), suggestedHashtags (array), characterCount, and warnings (array; use [] when none). ${input.suggestHashtags ? 'Suggest hashtags only when relevant.' : 'Do not suggest hashtags.'} Preserve factual claims and state limitations.`, [userSource('original post', input.text), ...(input.context ? [userSource('additional context', input.context)] : [])]); }

  @Tool({ name: 'x_summarize_thread', description: 'Summarize a real bounded X thread. Retrieves the thread before AI interpretation and reports data limitations.', inputSchema: threadInputSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('thread-viewer')
  async summarizeThread(input: z.infer<typeof threadInputSchema>, _ctx: ExecutionContext) { return this.xGrounded(input, 'thread summary', summaryOutput, 'Summarize only the retrieved thread. Return every field: summary, keyPoints (array), participants (array), importantClaims (array), unresolvedPoints (array), and dataLimitations (array). Identify key points, participants, important claims, unresolved points, and incomplete/truncated data.', async () => [{ sourceType: 'x_api', label: 'real X thread', data: await this.x.getThread(input.postId) }]); }

  @Tool({ name: 'x_summarize_conversation', description: 'Summarize a real bounded X conversation sample. It does not claim the sample is complete.', inputSchema: conversationInputSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('conversation-viewer')
  async summarizeConversation(input: z.infer<typeof conversationInputSchema>, _ctx: ExecutionContext) { return this.xGrounded(input, 'conversation summary', summaryOutput, 'Summarize only this bounded conversation sample. Return every field: summary, keyPoints (array), participants (array), importantClaims (array), unresolvedPoints (array), and dataLimitations (array). Describe progression, positions, replies, participants, unresolved points, and why the retrieved sample may be incomplete.', async () => [{ sourceType: 'x_api', label: 'real X conversation sample', data: await this.x.getConversation(input.postId, { maxResults: input.maxResults }) }]); }

  @Tool({ name: 'x_analyze_sentiment', description: 'Analyze text sentiment only. It does not infer psychological state or sensitive traits.', inputSchema: sentimentSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 15, window: '1m' })
  @Widget('analytics-dashboard')
  async analyzeSentiment(input: z.infer<typeof sentimentSchema>, _ctx: ExecutionContext) { return this.ai.runWithSources({ task: 'text sentiment analysis', schema: sentimentOutput, instructions: `${analysisInstructions('text sentiment analysis', 'Analyze language only; do not infer a person’s mental state, identity, or sensitive attributes.')} Return exactly these JSON fields: overallSentiment (one of positive, negative, neutral, mixed), confidence (number from 0 to 1), positiveSignals (array of strings), negativeSignals (array of strings), neutralMixedSignals (array of strings), and explanation (string). Use empty arrays when no signals are present.`, loadSources: async () => this.textSources(input) }); }

  @Tool({ name: 'x_generate_content_ideas', description: 'Generate structured content ideas without scheduling or publishing.', inputSchema: contentIdeasSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('content-calendar')
  async contentIdeas(input: z.infer<typeof contentIdeasSchema>, _ctx: ExecutionContext) { return this.run(input, 'content ideation', ideasOutput, `Generate ${input.numberOfIdeas} distinct content ideas about ${input.topic} for ${input.audience ?? 'the intended audience'}. Goal: ${input.goal ?? 'useful engagement'}. For every idea, return all required fields: title, angle, description, suggestedFormat, possibleHook, and hashtags (use [] when none are appropriate). Keep suggestedFormat under 80 characters, do not omit description, and do not invent X performance claims.`, [userSource('idea brief', input)]); }

  @Tool({ name: 'x_analyze_audience', description: 'Analyze observable aggregate content and engagement patterns only; never infer sensitive personal traits.', inputSchema: audienceSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('analytics-dashboard')
  async analyzeAudience(input: z.infer<typeof audienceSchema>, _ctx: ExecutionContext) { return this.xGrounded(input, 'audience pattern analysis', audienceOutput, 'Describe observed topics, aggregate engagement patterns, interaction categories, and timing patterns. Explicitly avoid race, religion, sexuality, medical, political, financial, or other sensitive trait inference.', async () => { if (input.userId) { const posts = await this.x.getUserPosts(input.userId, { maxResults: Math.min(input.maxResults, getConfig().AI_MAX_SAMPLED_POSTS) }); return [{ sourceType: 'x_api', label: 'real X post sample', data: compactPostSample(posts.data) }, { sourceType: 'deterministic_analysis', label: 'local aggregate metrics', data: this.analytics.posts(posts.data) }]; } return [userSource('supplied post sample', input.postTexts)]; }); }

  @Tool({ name: 'x_explain_trend', description: 'Explain observed topic signals from a real bounded X search sample; never call it an official X trend without official trend data.', inputSchema: trendSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('trend-dashboard')
  async explainTrend(input: z.infer<typeof trendSchema>, _ctx: ExecutionContext) { return this.xGrounded(input, 'observed topic explanation', trendOutput, 'Explain why the sampled posts appear related, identify key terms and representative patterns, and rank major accounts only within the sample. Say that this is not an official X-wide trend.', async () => { const results = await this.x.searchPosts({ query: input.query, maxResults: Math.min(input.maxResults, getConfig().AI_MAX_SAMPLED_POSTS) }); return [{ sourceType: 'x_api', label: 'real X search sample', data: compactPostSample(results.data) }, { sourceType: 'deterministic_analysis', label: 'observed topic signals', data: compactTopicSignals(this.intelligence.topicSignals(results.data)) }]; }); }

  @Tool({ name: 'x_content_strategy', description: 'Produce a strategy grounded in optional real account data and clearly separate facts from recommendations. Does not publish or schedule.', inputSchema: strategySchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('analytics-dashboard')
  async contentStrategy(input: z.infer<typeof strategySchema>, _ctx: ExecutionContext) { return this.xGrounded(input, 'content strategy', strategyOutput, 'Separate factsFromXData from recommendations. Use only observed metrics and samples for factual statements. Include content pillars, ideas, formats, timing observations, experiments, and limitations.', async () => { const sources: GroundingSource[] = [userSource('strategy brief', input)]; if (input.userId) { const user = await this.x.getUser({ id: input.userId }); const posts = await this.x.getUserPosts(input.userId, { maxResults: Math.min(input.maxResults, getConfig().AI_MAX_SAMPLED_POSTS) }); sources.push({ sourceType: 'x_api', label: 'real X profile', data: user }, { sourceType: 'x_api', label: 'real X post sample', data: compactPostSample(posts.data) }, { sourceType: 'deterministic_analysis', label: 'deterministic account analytics', data: this.analytics.profile(user, posts.data) }); } return sources; }); }

  @Tool({ name: 'x_generate_hashtags', description: 'Suggest hashtags using the topic and optional real sampled X data. Popularity is not claimed unless observed in the sample.', inputSchema: hashtagSuggestionSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('trend-dashboard')
  async generateHashtags(input: z.infer<typeof hashtagSuggestionSchema>, _ctx: ExecutionContext) { return this.xGrounded(input, 'hashtag suggestions', hashtagOutput, 'Suggest relevant hashtags. Explain each reason and source type. Never claim platform-wide popularity from a bounded sample.', async () => { const results = await this.x.searchPosts({ query: input.topic, maxResults: Math.min(input.maxResults, getConfig().AI_MAX_SAMPLED_POSTS) }); return [{ sourceType: 'user_input', label: 'hashtag brief', data: { topic: input.topic, requested: input.hashtags } }, { sourceType: 'x_api', label: 'real X topic sample', data: compactPostSample(results.data) }, { sourceType: 'deterministic_analysis', label: 'sample hashtag signals', data: compactTopicSignals(this.intelligence.topicSignals(results.data)) }]; }); }

  @Tool({ name: 'x_generate_content_calendar', description: 'Generate a planning calendar only. It does not schedule or publish posts; recommended times are included only when grounded in account data.', inputSchema: calendarSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('content-calendar')
  async contentCalendar(input: z.infer<typeof calendarSchema>, _ctx: ExecutionContext) { return this.xGrounded(input, 'content calendar', calendarOutput, 'Create calendar entries for the requested days and posts per day. Do not schedule them. Only include recommendedTime when supported by supplied account data; otherwise omit it and explain the limitation.', async () => { const sources: GroundingSource[] = [{ sourceType: 'user_input', label: 'calendar brief', data: input }]; if (input.userId) { const posts = await this.x.getUserPosts(input.userId, { maxResults: getConfig().AI_MAX_SAMPLED_POSTS }); sources.push({ sourceType: 'x_api', label: 'real X post sample', data: compactPostSample(posts.data) }, { sourceType: 'deterministic_analysis', label: 'posting-time observations', data: this.analytics.posts(posts.data).activePostingHours }); } return sources; }); }

  private run<T>(input: unknown, task: string, schema: z.ZodType<T>, instructions: string, sources: GroundingSource[]) { return this.ai.run({ task, instructions, schema, sources }); }
  private xGrounded<T>(input: unknown, task: string, schema: z.ZodType<T>, instructions: string, loadSources: () => Promise<GroundingSource[]>) { return this.ai.runWithSources({ task, instructions, schema, loadSources }); }
  private async textSources(input: z.infer<typeof sentimentSchema>): Promise<GroundingSource[]> { if (input.postId) return [{ sourceType: 'x_api', label: 'real X post', data: await this.x.getPost(input.postId) }]; return [{ sourceType: 'user_input', label: 'text supplied for sentiment analysis', data: { postText: input.postText, conversation: input.conversation, topicSample: input.topicSample } }]; }
}

function userSource(label: string, data: unknown): GroundingSource { return { sourceType: 'user_input', label, data }; }

function compactPostSample(posts: Array<{ id: string; text: string; author?: { username?: string }; authorId?: string; createdAt?: string; metrics?: unknown; hashtags?: string[]; mentions?: string[]; urls?: string[] }>) {
  return posts.slice(0, 10).map((post) => ({
    id: post.id,
    text: post.text.slice(0, 600),
    author: post.author?.username ?? post.authorId,
    createdAt: post.createdAt,
    metrics: post.metrics,
    hashtags: post.hashtags,
    mentions: post.mentions,
    urls: post.urls,
  }));
}

function compactTopicSignals(signals: any) {
  return {
    label: signals.label,
    sampleSize: signals.sampleSize,
    topHashtags: signals.topHashtags?.slice(0, 10),
    topMentions: signals.topMentions?.slice(0, 10),
    topDomains: signals.topDomains?.slice(0, 10),
    topKeywords: signals.topKeywords?.slice(0, 20),
    topAuthors: signals.topAuthors?.slice(0, 10),
    topPosts: compactPostSample(signals.topPosts ?? []).slice(0, 5),
    timeline: signals.timeline?.slice(0, 10),
  };
}
