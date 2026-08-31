# Authentication

X Intelligence MCP supports development without mandatory user authentication and two personal-mode credential paths:

- Development-disabled mode: set `X_AUTH_ENABLED=false`. The server starts normally; public read tools use `X_BEARER_TOKEN` where supported, while user-only tools return structured `AUTH_DISABLED` or `AUTH_REQUIRED` errors. No mock data is returned.

- Manual fallback: set `X_ACCESS_TOKEN`. `X_BEARER_TOKEN` remains available for app-only reads where X permits them.
- Browser connection: set `X_AUTH_ENABLED=true`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, and `X_REDIRECT_URI`, then open `http://127.0.0.1:3000/auth/x/start` while the server is running with `MCP_TRANSPORT_TYPE=dual`. The exact local callback is `http://127.0.0.1:3000/auth/x/callback`.

For the local X Developer Console application, register:

- Website URL: `http://127.0.0.1:3000`
- Callback URL / Redirect URI: `http://127.0.0.1:3000/auth/x/callback`

These values must match exactly, including scheme, host, port, and path. If `PORT`, `APP_BASE_URL`, or `X_REDIRECT_URI` changes, update the registered callback accordingly.

The browser flow is X OAuth 2.0 Authorization Code + PKCE with S256. It redirects to `https://x.com/i/oauth2/authorize` and exchanges at `https://api.x.com/2/oauth2/token`. Confidential Web App token requests use HTTP Basic with the client ID and client secret. `offline.access` is requested so X can issue refresh tokens.

The default X scope set is `tweet.read tweet.write users.read follows.read follows.write like.read like.write media.write offline.access`. `X_SCOPES` may be narrowed to supported scopes, but the browser flow requires `offline.access` for refresh support.

Pending state/verifier values and the connected token are stored in process memory only. They are one-time/expiring where applicable and never returned by routes or tools. Restarting the process clears the OAuth connection; manual environment tokens remain available.

`x_disconnect` clears only local OAuth state. It does not claim to revoke access on X.

OAuth is intentionally not a development blocker while the X-side authorization issue remains unresolved; this is not a claim that the X OAuth problem is solved. Set `X_AUTH_ENABLED=true` to use the preserved X OAuth/PKCE path. NitroStack OAuth remains available for protecting MCP clients. Set `OAUTH_REQUIRED=true` and configure the existing NitroStack verifier settings (`JWKS_URI` or introspection) before production HTTP use. The MCP OAuth guard and X API credentials are separate trust boundaries.

For the complete production MCP boundary and secret-injection policy, see [docs/PRODUCTION_SECURITY.md](PRODUCTION_SECURITY.md). The production gate requires `OAUTH_REQUIRED=true`, an HTTPS resource/audience, and exactly one NitroStack token verifier before the process starts. This protects MCP execution requests; it does not resolve or enable the separate X OAuth account flow.
