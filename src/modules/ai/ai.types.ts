import type { z } from 'zod';

export type AIProviderId = 'openai' | 'groq' | 'gemini' | 'anthropic';

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  /** Internal schema hint used by providers that support native structured output. */
  responseSchema?: z.ZodType<unknown>;
}

export interface AIProviderResult {
  text: string;
  provider: AIProviderId;
  model: string;
  durationMs: number;
  httpStatus?: number;
}

export interface AIProviderHealth {
  id: AIProviderId;
  configured: boolean;
  available: boolean;
  model: string;
  message?: string;
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly model: string;
  isConfigured(): boolean;
  generate(request: AIRequest): Promise<AIProviderResult>;
  generateStructured<T>(request: AIRequest, schema: z.ZodType<T>): Promise<{ value: T; result: AIProviderResult }>;
  healthCheck(): Promise<AIProviderHealth>;
}

export interface AIErrorResult {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface AIGroundingMetadata {
  grounded: boolean;
  sourceType: 'x_api' | 'deterministic_analysis' | 'user_input' | 'mixed';
  sourceCount: number;
  sourceChars: number;
}
