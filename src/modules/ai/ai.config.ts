import { getConfig, type AppConfig } from '../../common/config/env.js';
import type { AIProviderId } from './ai.types.js';

export const DEFAULT_AI_MODELS: Record<AIProviderId, string> = {
  openai: 'gpt-5-mini',
  groq: 'openai/gpt-oss-20b',
  gemini: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-5',
};

export function providerConfigured(id: AIProviderId, config: AppConfig = getConfig()): boolean {
  return Boolean(id === 'openai' ? config.OPENAI_API_KEY : id === 'groq' ? config.GROQ_API_KEY : id === 'gemini' ? config.GEMINI_API_KEY : config.ANTHROPIC_API_KEY);
}

export function providerModel(id: AIProviderId, config: AppConfig = getConfig()): string {
  return (id === 'openai' ? config.OPENAI_MODEL : id === 'groq' ? config.GROQ_MODEL : id === 'gemini' ? config.GEMINI_MODEL : config.ANTHROPIC_MODEL) ?? DEFAULT_AI_MODELS[id];
}
