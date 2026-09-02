# Claude MCP setup

## Production server

MCP URL:

`https://x-intelligence-mcp-6a95e036-xbuilders-srmist.app.nitrocloud.ai/mcp`

The same endpoint supports Claude through MCP Streamable HTTP. Production
expects OAuth 2.1 bearer authentication through the configured Auth0
authorization server.

## Connect

1. Open Claude settings and the custom connector/integrations area available
   to your account.
2. Add a custom connector using the production MCP URL above.
3. Complete the OAuth flow when Claude requests access.
4. Enable the connector in a conversation and allow tool/resource discovery.

For a local diagnostic, set `MCP_E2E_URL` and optionally `MCP_BEARER_TOKEN` in
the environment. Keep tokens in the environment or secret manager only.

## Verify

Recommended first test:

> Use X Intelligence MCP to get the X profile for XDevelopers.

Expected behavior: Claude calls `x_get_user` with the username
`XDevelopers` and receives structured MCP output.

Safe AI demo prompt:

> Using X Intelligence MCP, search recent posts from XDevelopers and analyze the sentiment of one result.

The AI operation is read-only. Draft tools never publish, and X write tools
remain explicit-confirmation gated.
