import { Injectable } from '@nitrostack/core';
import { getConfig } from '../../common/config/env.js';
import { AIIntelligenceError, safeAIError } from './ai.errors.js';
import { AIRegistry } from './ai.registry.js';
import { GroundingService } from './grounding/grounding.service.js';
import type { GroundingSource } from './grounding/grounding.types.js';
import { AI_SYSTEM_PROMPT } from './prompts/system-prompts.js';
import { jsonTask } from './prompts/generation-prompts.js';
import type { AIErrorResult, AIGroundingMetadata } from './ai.types.js';
import type { z } from 'zod';

@Injectable({ deps: [AIRegistry, GroundingService] })
export class AIService {
  constructor(private readonly registry: AIRegistry, private readonly grounding: GroundingService) {}

  async run<T>(input: { task: string; instructions: string; schema: z.ZodType<T>; sources: GroundingSource[] }): Promise<T & AIGroundingMetadata & { provider: string; model: string; generatedAt: string } | AIErrorResult> {
    const config = getConfig();
    if (!config.AI_ENABLED) return { ok: false, code: 'AI_DISABLED', message: 'AI tools are disabled; deterministic X tools remain available.', retryable: false };
    try {
      const grounding = this.grounding.build(input.sources);
      const providers = this.candidateProviders();
      if (!providers.length) throw new AIIntelligenceError('AI_NOT_CONFIGURED', 'No configured AI provider is available.', false);
      let lastError: unknown;
      for (const provider of providers) {
        try {
          const generated = await provider.generateStructured({ systemPrompt: AI_SYSTEM_PROMPT, userPrompt: jsonTask(input.task, input.instructions, grounding.prompt), maxOutputTokens: config.AI_MAX_OUTPUT_TOKENS }, input.schema);
          const value = { ...(generated.value as T & Record<string, unknown>) };
          const valueRecord = value as Record<string, unknown>;
          // Character count is deterministic presentation metadata. Providers may
          // omit this optional field even when the draft itself is valid.
          if (typeof valueRecord.draft === 'string' && typeof valueRecord.characterCount !== 'number') valueRecord.characterCount = valueRecord.draft.length;
          if (typeof valueRecord.improvedDraft === 'string' && typeof valueRecord.characterCount !== 'number') valueRecord.characterCount = valueRecord.improvedDraft.length;
          return { ...value, grounded: true, sourceType: grounding.sourceType, sourceCount: grounding.sourceCount, sourceChars: grounding.sourceChars, provider: generated.result.provider, model: generated.result.model, generatedAt: new Date().toISOString() };
        } catch (error) {
          lastError = error;
          if (!this.canFallback(error) || provider === providers[providers.length - 1]) throw error;
        }
      }
      throw lastError ?? new AIIntelligenceError('AI_PROVIDER_UNAVAILABLE', 'No AI provider completed the request.', true);
    } catch (error) { return safeAIError(error); }
  }

  async runWithSources<T>(input: { task: string; instructions: string; schema: z.ZodType<T>; loadSources: () => Promise<GroundingSource[]> }): Promise<T & AIGroundingMetadata & { provider: string; model: string; generatedAt: string } | AIErrorResult> {
    try { return await this.run({ ...input, sources: await input.loadSources() }); }
    catch (error) { return { ok: false, code: 'AI_GROUNDING_FAILED', message: 'Required X grounding data could not be retrieved.', retryable: false, details: { sourceErrorCode: error instanceof AIIntelligenceError ? error.code : 'X_API_ERROR' } }; }
  }

  async status(): Promise<Record<string, unknown>> {
    const config = getConfig();
    const providers = await this.registry.health();
    const selected = this.registry.selected();
    return { enabled: config.AI_ENABLED, selectionMode: this.registry.selectionMode(), selectedProvider: selected?.id, selectedModel: selected?.model, configuredProviders: providers.filter((provider) => provider.configured).map((provider) => provider.id), providers, groundingEnabled: true, capabilities: ['draft_generation', 'rewriting', 'summarization', 'sentiment', 'topic_explanation', 'strategy', 'hashtag_suggestions', 'content_calendar'] };
  }

  private candidateProviders() { return getConfig().AI_PROVIDER === 'auto' ? this.registry.configured() : (this.registry.selected() ? [this.registry.selected()!] : []); }
  private canFallback(error: unknown): boolean { return error instanceof AIIntelligenceError && ['AI_PROVIDER_UNAVAILABLE', 'AI_TIMEOUT', 'AI_RATE_LIMITED'].includes(error.code); }
}
