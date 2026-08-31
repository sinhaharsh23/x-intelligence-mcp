# Architecture

`MCP tool → XService/analytics service → XApiClient → api.x.com → normalized result`

The root `AppModule` imports `XModule`, `AnalyticsModule`, and `IntelligenceModule`, while keeping NitroStack’s `McpApplicationFactory`, native transports, OAuth module, decorators, health checks, and widget component bridge.

`XApiClient` is the only production code that performs X HTTP requests. It owns authentication headers, URL/query construction, timeout cancellation, bounded safe retries for reads, rate-limit header parsing, response decoding, token refresh, and status-to-safe-error mapping.

Read tools use short NitroStack cache TTLs; write paths clear the shared cache. Mutating tools use MCP annotations and explicit confirmation for destructive operations. No bulk automation or scheduled publishing is implemented.

`X_AUTH_ENABLED=false` is the local development default. It does not remove OAuth code or NitroStack OAuth protection: it only prevents missing X user OAuth from blocking startup and returns explicit `AUTH_DISABLED` errors for user-context requests without a user token. Public app-only reads continue through `X_BEARER_TOKEN` when X supports them.

The MCP boundary is protected separately by NitroStack `OAuthModule`. In production, `src/index.ts` requires `OAUTH_REQUIRED=true`, an HTTPS `RESOURCE_URI`, an explicit audience, and one configured JWKS or RFC 7662 introspection verifier before the server starts. NitroStack mounts the bearer middleware on the MCP HTTP routes; it runs before tool/resource/prompt execution. See [PRODUCTION_SECURITY.md](PRODUCTION_SECURITY.md).
