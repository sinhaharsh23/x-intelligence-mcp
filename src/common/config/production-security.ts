import { getConfig, type AppConfig } from './env.js';

/**
 * Production-only guard for the MCP trust boundary.
 *
 * NitroStack's OAuthModule owns the actual bearer-token validation and mounts
 * its middleware on /mcp. This function prevents an accidentally open
 * production process from starting before that verifier is configured.
 */
export function assertProductionSecurity(config: AppConfig = getConfig()): void {
  if (config.NODE_ENV !== 'production') return;

  const failures: string[] = [];
  if (config.OAUTH_REQUIRED !== 'true') failures.push('OAUTH_REQUIRED=true is required');
  if (config.MCP_TRANSPORT_TYPE === 'stdio') failures.push('MCP_TRANSPORT_TYPE must expose HTTP or dual transport');
  if (!config.HOST) {
    failures.push('HOST=0.0.0.0 is required for hosted HTTP transport');
  } else if (isLoopbackHost(config.HOST)) {
    failures.push('HOST must not be a loopback address in production');
  }
  if (!config.RESOURCE_URI) {
    failures.push('RESOURCE_URI is required');
  } else if (!isHttpsUrl(config.RESOURCE_URI)) {
    failures.push('RESOURCE_URI must be an HTTPS URL');
  }
  if (!config.AUTH_SERVER_URL) {
    failures.push('AUTH_SERVER_URL is required');
  } else if (!isHttpsUrl(config.AUTH_SERVER_URL)) {
    failures.push('AUTH_SERVER_URL must be an HTTPS URL');
  }
  if (!config.TOKEN_AUDIENCE) failures.push('TOKEN_AUDIENCE is required');

  const hasJwks = Boolean(config.JWKS_URI);
  const hasIntrospection = Boolean(config.INTROSPECTION_ENDPOINT);
  if (!hasJwks && !hasIntrospection) {
    failures.push('JWKS_URI or INTROSPECTION_ENDPOINT is required');
  }
  if (hasJwks && hasIntrospection) {
    failures.push('configure exactly one token verifier: JWKS_URI or INTROSPECTION_ENDPOINT');
  }
  if (hasJwks && !config.TOKEN_ISSUER) failures.push('TOKEN_ISSUER is required with JWKS_URI');
  if (hasIntrospection && (!config.INTROSPECTION_CLIENT_ID || !config.INTROSPECTION_CLIENT_SECRET)) {
    failures.push('INTROSPECTION_CLIENT_ID and INTROSPECTION_CLIENT_SECRET are required with INTROSPECTION_ENDPOINT');
  }

  if (failures.length > 0) {
    throw new Error(`Production security validation failed: ${failures.join('; ')}.`);
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isLoopbackHost(value: string): boolean {
  return value === 'localhost' || value === '127.0.0.1' || value === '::1' || value === '[::1]';
}
