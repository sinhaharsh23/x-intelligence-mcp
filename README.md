# X Intelligence MCP

X Intelligence MCP is an independent, native NitroStack MCP server for securely reading, searching, analyzing, and managing real X content through the official X API v2. It is not affiliated with or endorsed by X.

## Quick start

```bash
npm install
cp .env.example .env
# Development runs without requiring X user OAuth.
npm run dev:http
```

The server keeps NitroStack’s native MCP application, OAuth-capable transports, decorators, resources, prompts, health checks, and widget bridge. Widgets are a separate Next.js app under `src/widgets`.

## Configuration

Set `X_AUTH_ENABLED=false` for normal development. Public reads use `X_BEARER_TOKEN` where X supports app-only access; user-only tools return structured `AUTH_DISABLED` or `AUTH_REQUIRED` responses without crashing. OAuth/PKCE remains available for later re-enablement with `X_AUTH_ENABLED=true`. Keep `MCP_TRANSPORT_TYPE=dual` and use `npm run dev:http` for local HTTP plus STDIO. See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md).

Phase 3 adds an optional grounded AI layer. Set `AI_ENABLED=true` and configure OpenAI, Groq, Gemini, or Anthropic to enable AI drafts and interpretations; `AI_ENABLED=false` keeps the deterministic X core fully usable. AI never publishes, schedules, or invokes X write tools. See [docs/AI.md](docs/AI.md), [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md), and [docs/AI_SAFETY.md](docs/AI_SAFETY.md).

## Commands

```bash
npm run dev
npm test
npm run widget:typecheck
npm run widget:build
npm run build
npm run integration:smoke
npm run test:e2e
```

For a NitroStudio presentation, use the curated demo surface:

```bash
DEMO_CANVAS_MODE=true npm run dev
```

`DEMO_CANVAS_MODE=false` is the default and preserves the complete production
registration. With demo mode enabled, NitroStack registers only a presentation
subset (30 Canvas-visible tools/resources/prompts or fewer), including the
real X read tools and the configured AI draft tools. The widgets use
NitroStack's `WidgetLayout` and `useWidgetSDK()` host bridge for follow-up tool
calls and external navigation; they do not connect directly to `/mcp`. AI
actions remain draft-only and no write tools are registered in demo mode.

`integration:smoke` is read-only. It requires explicit credentials and never creates a post. Writes are only made by explicit MCP tool invocation.

Before any public deployment, set `OAUTH_REQUIRED=true` and configure the
NitroStack production bearer-token verifier (`JWKS_URI` plus `TOKEN_ISSUER`,
or RFC 7662 introspection settings). Production startup fails closed when that
boundary is incomplete. Hosted processes should bind `HOST=0.0.0.0`; local
development continues to use loopback. Keep those values in the hosting platform's secret/
environment facility; never commit them. See
[docs/PRODUCTION_SECURITY.md](docs/PRODUCTION_SECURITY.md) and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## What exists

- Native NitroStack MCP tools, resources, prompts, OAuth guard, health check, rate-limit tracking, retries, timeouts, caching for reads, and structured safe errors.
- Official X API v2 account, post, relationship, likes, reposts, follows, post creation/deletion, and media upload/metadata integration.
- Deterministic analytics and observed-topic intelligence, plus optional grounded AI provider adapters for OpenAI, Groq, Gemini, and Anthropic.
- Responsive dark/light NitroStack widgets with SDK-backed actions.

## Limitations

X access is credential- and plan-dependent. Recent search is bounded by the X API and its current access level. `x_search_users` resolves exact usernames because the current v2 user lookup surface does not provide a broad free-text user search. Public lookups, user timelines, mentions, follows lookup, post lookup, and recent search may use app-only access; `/2/users/me`, private metrics, writes, and media require user context and appropriate scopes. Full archive search and some media capabilities may require paid access.

See [docs/TOOLS.md](docs/TOOLS.md), [docs/WIDGETS.md](docs/WIDGETS.md), and [docs/X_API_CAPABILITIES.md](docs/X_API_CAPABILITIES.md).

## Production status

The NitroCloud deployment and Auth0-protected MCP boundary have been manually
verified in production. Real app-only X reads, Groq generation, and grounded
X-to-Groq analysis are working. X user OAuth remains implemented but disabled
and deferred; X write operations have not been production-tested.
