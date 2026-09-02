import type { AppConfig } from './config/env.js';

export const MCP_SERVER_NAME = 'X Intelligence MCP';
export const MCP_SERVER_VERSION = '1.1.0';
export const MCP_SERVER_DESCRIPTION = 'AI-ready MCP server for interacting with X, retrieving real X data, and performing grounded AI analysis and content drafting.';

export type CompatibilityProvider = 'openai' | 'groq' | 'gemini' | 'anthropic' | 'not-configured';

export function selectedCompatibilityProvider(config: AppConfig): CompatibilityProvider {
  const configured: Array<Exclude<CompatibilityProvider, 'not-configured'>> = [];
  if (config.OPENAI_API_KEY) configured.push('openai');
  if (config.GROQ_API_KEY) configured.push('groq');
  if (config.GEMINI_API_KEY) configured.push('gemini');
  if (config.ANTHROPIC_API_KEY) configured.push('anthropic');

  if (config.AI_PROVIDER !== 'auto' && configured.includes(config.AI_PROVIDER)) return config.AI_PROVIDER;
  return configured[0] ?? 'not-configured';
}

export function safeAuthenticationDescription(config: AppConfig): string {
  return config.OAUTH_REQUIRED === 'true'
    ? 'OAuth 2.1 bearer authentication required for production MCP requests.'
    : 'OAuth 2.1 metadata is available; bearer enforcement is optional in local development.';
}
