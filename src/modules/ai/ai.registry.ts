import { Injectable } from '@nitrostack/core';
import { getConfig } from '../../common/config/env.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { GroqProvider } from './providers/groq.provider.js';
import type { AIProvider, AIProviderHealth, AIProviderId } from './ai.types.js';

const PRIORITY: AIProviderId[] = ['openai', 'groq', 'gemini', 'anthropic'];

@Injectable()
export class AIRegistry {
  private readonly providers: Record<AIProviderId, AIProvider> = {
    openai: new OpenAIProvider(),
    groq: new GroqProvider(),
    gemini: new GeminiProvider(),
    anthropic: new AnthropicProvider(),
  };

  list(): AIProvider[] { return PRIORITY.map((id) => this.providers[id]); }
  configured(): AIProvider[] { return this.list().filter((provider) => provider.isConfigured()); }
  selected(): AIProvider | undefined {
    const config = getConfig();
    if (config.AI_PROVIDER === 'auto') return this.configured()[0];
    const provider = this.providers[config.AI_PROVIDER];
    return provider.isConfigured() ? provider : undefined;
  }
  async health(): Promise<AIProviderHealth[]> { return Promise.all(this.list().map((provider) => provider.healthCheck())); }
  selectionMode(): string { return getConfig().AI_PROVIDER; }
}
