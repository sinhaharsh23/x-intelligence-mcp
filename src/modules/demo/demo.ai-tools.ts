import { ExecutionContext, Injectable, ToolDecorator as Tool, UseGuards, Widget } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { AITools } from '../ai/ai.tools.js';
import { contentIdeasSchema, conversationInputSchema, generatePostSchema, generateReplySchema, generateThreadSchema, hashtagSuggestionSchema, improvePostSchema, rewritePostSchema, sentimentSchema, strategySchema, threadInputSchema } from '../ai/ai.schemas.js';
import { z } from 'zod';

@Injectable({ deps: [AITools] })
export class DemoAITools {
  constructor(private readonly ai: AITools) {}

  @Tool({ name: 'x_ai_status', description: 'Report optional AI configuration and safe provider status.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false } })
  @UseGuards(OAuthGuard)
  @Widget('system-status')
  async status(_input: Record<string, never>, ctx: ExecutionContext) { return this.ai.status(_input, ctx); }

  @Tool({ name: 'x_generate_post', description: 'Generate an X post draft only. This never publishes.', inputSchema: generatePostSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('composer')
  async generatePost(input: z.infer<typeof generatePostSchema>, ctx: ExecutionContext) { return this.ai.generatePost(input, ctx); }

  @Tool({ name: 'x_generate_thread', description: 'Generate ordered X thread drafts only. This never publishes.', inputSchema: generateThreadSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('composer')
  async generateThread(input: z.infer<typeof generateThreadSchema>, ctx: ExecutionContext) { return this.ai.generateThread(input, ctx); }

  @Tool({ name: 'x_generate_reply', description: 'Generate a reply draft. This never replies automatically.', inputSchema: generateReplySchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('composer')
  async generateReply(input: z.infer<typeof generateReplySchema>, ctx: ExecutionContext) { return this.ai.generateReply(input, ctx); }

  @Tool({ name: 'x_rewrite_post', description: 'Rewrite supplied text into a draft. This never publishes.', inputSchema: rewritePostSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('composer')
  async rewritePost(input: z.infer<typeof rewritePostSchema>, ctx: ExecutionContext) { return this.ai.rewritePost(input, ctx); }

  @Tool({ name: 'x_improve_post', description: 'Improve supplied post text as a draft. This never publishes.', inputSchema: improvePostSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('composer')
  async improvePost(input: z.infer<typeof improvePostSchema>, ctx: ExecutionContext) { return this.ai.improvePost(input, ctx); }

  @Tool({ name: 'x_summarize_thread', description: 'Summarize a real bounded X thread without publishing or taking action.', inputSchema: threadInputSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('post-card')
  async summarizeThread(input: z.infer<typeof threadInputSchema>, ctx: ExecutionContext) { return this.ai.summarizeThread(input, ctx); }

  @Tool({ name: 'x_summarize_conversation', description: 'Summarize a real bounded X conversation sample without publishing or taking action.', inputSchema: conversationInputSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('post-card')
  async summarizeConversation(input: z.infer<typeof conversationInputSchema>, ctx: ExecutionContext) { return this.ai.summarizeConversation(input, ctx); }

  @Tool({ name: 'x_analyze_sentiment', description: 'Analyze text sentiment only; do not infer psychological state or sensitive traits.', inputSchema: sentimentSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('analytics-dashboard')
  async analyzeSentiment(input: z.infer<typeof sentimentSchema>, ctx: ExecutionContext) { return this.ai.analyzeSentiment(input, ctx); }

  @Tool({ name: 'x_generate_content_ideas', description: 'Generate structured content ideas without scheduling or publishing.', inputSchema: contentIdeasSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('post-card')
  async contentIdeas(input: z.infer<typeof contentIdeasSchema>, ctx: ExecutionContext) { return this.ai.contentIdeas(input, ctx); }

  @Tool({ name: 'x_content_strategy', description: 'Produce grounded content strategy recommendations without publishing or scheduling.', inputSchema: strategySchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('post-card')
  async contentStrategy(input: z.infer<typeof strategySchema>, ctx: ExecutionContext) { return this.ai.contentStrategy(input, ctx); }

  @Tool({ name: 'x_generate_hashtags', description: 'Suggest relevant hashtags without claiming unsupported popularity.', inputSchema: hashtagSuggestionSchema, annotations: { readOnlyHint: true, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @Widget('post-card')
  async generateHashtags(input: z.infer<typeof hashtagSuggestionSchema>, ctx: ExecutionContext) { return this.ai.generateHashtags(input, ctx); }
}
