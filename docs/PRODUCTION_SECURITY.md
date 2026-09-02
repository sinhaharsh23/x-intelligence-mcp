# Production security gate

Phase 4.5 keeps local development convenient while making a production process
fail closed at the MCP boundary. The application uses NitroStack's built-in
`OAuthModule` and its bearer-token middleware; it does not add Express,
Fastify, an API-key side channel, or a second backend.

## Local development

The checked-in development policy remains:

```dotenv
NODE_ENV=development
MCP_TRANSPORT_TYPE=dual
OAUTH_REQUIRED=false
```

`npm run dev:http` is therefore intentionally open on loopback for local
testing. X account authentication is a separate concern and remains governed
by `X_AUTH_ENABLED`.

## Production requirement

Before a production process can start, `src/index.ts` requires all of the
following without printing their values:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
MCP_TRANSPORT_TYPE=dual
OAUTH_REQUIRED=true
RESOURCE_URI=https://mcp.example.com
AUTH_SERVER_URL=https://auth.example.com
# Preferred multi-audience setting. The legacy TOKEN_AUDIENCE remains supported.
AUTH0_AUDIENCES=https://mcp.example.com,https://mcp.example.com/legacy
TOKEN_AUDIENCE=https://mcp.example.com
```

Configure exactly one NitroStack verifier:

### Signed JWT access tokens

```dotenv
JWKS_URI=https://auth.example.com/.well-known/jwks.json
TOKEN_ISSUER=https://auth.example.com/
```

### Opaque access tokens

```dotenv
INTROSPECTION_ENDPOINT=https://auth.example.com/oauth/introspect
INTROSPECTION_CLIENT_ID=mcp-server
INTROSPECTION_CLIENT_SECRET=<injected-at-runtime>
```

Production startup rejects missing enforcement, a loopback bind, a loopback/HTTP resource or
authorization-server URL, a missing audience, an ambiguous verifier, or an
incomplete introspection configuration. The actual request boundary remains
NitroStack's middleware mounted by `OAuthModule` on `/mcp`, `/sse`, and
`/mcp/messages`.

NitroStack intentionally leaves MCP initialization, capability listing, and
OAuth discovery available for client negotiation. MCP execution requests
(`tools/call`, `resources/read`, and `prompts/get`) require a valid bearer
token, and invalid or missing credentials are rejected before handler
execution. The token is checked by JWKS signature validation or RFC 7662
introspection, including every configured audience. For this application, the
production compatibility pair is `https://x-intelligence-mcp` and
`https://x-intelligence-mcp-6a95e036-xbuilders-srmist.app.nitrocloud.ai`.
`TOKEN_ISSUER` remains `https://x-intelligence-mcp.au.auth0.com/`; issuer,
expiration, signature (for JWTs), audience, and Bearer format remain validated.

## Secret management

Local `.env` files are developer-only and ignored. They are never packed into
the application artifact. Production secrets must be injected by the hosting
platform's secret/environment facility at process start; they must not be
committed, copied into `dist`, placed in `README`/docs, or passed as query
parameters. The production gate validates presence and safe non-secret shape,
not secret values. NitroStack auth client secrets and X/AI provider keys are
separate inventory items and are optional unless the corresponding feature is
enabled.

No deployment or secret-manager integration is performed in Phase 4.5. The
deployment platform must map its encrypted secret store to the variables in
`.env.example` and keep logs/redaction configured before Phase 5.

## Trust-boundary rules

- MCP bearer authentication is independent of X OAuth and `X_AUTH_ENABLED`.
- Existing X write tools still require explicit `confirm: true`.
- AI tools produce drafts/analysis and cannot invoke X mutations.
- A valid MCP token does not imply a connected X user account.
- HTTPS termination and network-level rate limiting remain required for a
  public deployment.
