import type { AppConfig } from './env.js';

export const AUTH0_ISSUER = 'https://x-intelligence-mcp.au.auth0.com/';
export const EXISTING_AUTH0_AUDIENCE = 'https://x-intelligence-mcp';
export const CLAUDE_AUTH0_AUDIENCE = 'https://x-intelligence-mcp-6a95e036-xbuilders-srmist.app.nitrocloud.ai';

export const DEFAULT_AUTH0_AUDIENCES = [
  EXISTING_AUTH0_AUDIENCE,
  CLAUDE_AUTH0_AUDIENCE,
] as const;

function splitAudiences(value: string | undefined): string[] {
  return (value ?? '').split(/[\s,]+/).map((audience) => audience.trim()).filter(Boolean);
}

/** Resolve the explicit MCP audience allowlist while preserving TOKEN_AUDIENCE. */
export function configuredAuth0Audiences(config: Pick<AppConfig, 'AUTH0_AUDIENCES' | 'AUTH0_AUDIENCE' | 'TOKEN_AUDIENCE'>): string[] {
  const configured = Array.from(new Set([
    ...splitAudiences(config.AUTH0_AUDIENCES),
    ...splitAudiences(config.AUTH0_AUDIENCE),
    ...splitAudiences(config.TOKEN_AUDIENCE),
  ]));

  // The deployed application historically set TOKEN_AUDIENCE to the first
  // identifier. Treat the two known X Intelligence identifiers as one
  // compatibility pair when either is configured; unrelated custom audiences
  // remain restricted to the values explicitly supplied by the operator.
  if (configured.some((audience) => DEFAULT_AUTH0_AUDIENCES.includes(audience as typeof DEFAULT_AUTH0_AUDIENCES[number]))) {
    return Array.from(new Set([...configured, ...DEFAULT_AUTH0_AUDIENCES]));
  }

  return configured;
}

/** Enforce issuer on introspection responses as well as the JWT verifier path. */
export function hasValidAuth0Issuer(payload: unknown, issuer: string | undefined): boolean {
  if (!issuer) return true;
  return typeof payload === 'object' && payload !== null && 'iss' in payload && payload.iss === issuer;
}
