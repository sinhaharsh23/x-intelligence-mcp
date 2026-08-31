# Troubleshooting

`AUTHENTICATION_ERROR` or `TOKEN_EXPIRED`: verify `X_ACCESS_TOKEN`, user-context scopes, and token expiry. `CAPABILITY_UNAVAILABLE`: configure the required user token or scope. `PLAN_RESTRICTION`: check the X Developer Console access level and endpoint availability. `RATE_LIMITED`: wait until the reported reset time. `NETWORK_ERROR`: check connectivity and `X_API_TIMEOUT_MS`.

For MCP OAuth failures, set `OAUTH_REQUIRED=false` only for local development. With enforcement enabled, configure `JWKS_URI` or token introspection and ensure the token audience matches `RESOURCE_URI`.
