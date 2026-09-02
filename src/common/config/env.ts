import { z } from 'zod';

const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional());
const optionalUrl = z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional());
const booleanFlag = z.preprocess((value) => value === '' || value === undefined ? undefined : value, z.enum(['true', 'false']).default('false')).transform((value) => value === 'true');

export const SUPPORTED_X_OAUTH_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'follows.read',
  'follows.write',
  'like.read',
  'like.write',
  'media.write',
  'offline.access',
] as const;

export const DEFAULT_X_OAUTH_SCOPES = [...SUPPORTED_X_OAUTH_SCOPES];

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: optionalString,
  MCP_TRANSPORT_TYPE: z.enum(['stdio', 'http', 'dual']).default('dual'),
  DEMO_CANVAS_MODE: booleanFlag,
  APP_BASE_URL: optionalUrl,
  RESOURCE_URI: optionalUrl,
  AUTH_SERVER_URL: optionalUrl,
  AUTH0_AUDIENCE: optionalString,
  AUTH0_AUDIENCES: optionalString,
  TOKEN_AUDIENCE: z.string().optional(),
  TOKEN_ISSUER: optionalUrl,
  JWKS_URI: optionalUrl,
  OAUTH_REQUIRED: z.enum(['true', 'false']).default('false'),
  X_AUTH_ENABLED: booleanFlag,
  AI_ENABLED: booleanFlag,
  AI_PROVIDER: z.enum(['auto', 'openai', 'groq', 'gemini', 'anthropic']).default('auto'),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString,
  GROQ_API_KEY: optionalString,
  GROQ_MODEL: optionalString,
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: optionalString,
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(8192).default(1200),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).max(200000).default(60000),
  AI_MAX_SAMPLED_POSTS: z.coerce.number().int().min(1).max(100).default(30),
  X_API_BASE_URL: optionalUrl,
  X_CLIENT_ID: optionalString,
  X_CLIENT_SECRET: optionalString,
  X_BEARER_TOKEN: optionalString,
  X_ACCESS_TOKEN: optionalString,
  X_REFRESH_TOKEN: optionalString,
  X_REDIRECT_URI: optionalUrl,
  X_SCOPES: optionalString,
  X_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
  X_API_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  MCP_API_KEY: optionalString,
  INTROSPECTION_ENDPOINT: optionalUrl,
  INTROSPECTION_CLIENT_ID: optionalString,
  INTROSPECTION_CLIENT_SECRET: optionalString,
});

export type AppConfig = z.infer<typeof environmentSchema>;

let cachedConfig: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    const parsed = environmentSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Configuration validation failed: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
    }
    cachedConfig = parsed.data;
  }
  return cachedConfig;
}

export function resetConfigForTests(): void {
  cachedConfig = undefined;
}

export function configuredXScopes(config: AppConfig = getConfig()): string[] {
  return (config.X_SCOPES ?? '').split(/[ ,]+/).map((scope) => scope.trim()).filter(Boolean);
}
