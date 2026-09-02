# ChatGPT MCP setup

## Production server

MCP URL:

`https://x-intelligence-mcp-6a95e036-xbuilders-srmist.app.nitrocloud.ai/mcp`

The endpoint uses MCP Streamable HTTP. Production expects OAuth 2.1 bearer
authentication through the configured Auth0 authorization server. Do not paste
X, Groq, Auth0, or MCP secrets into prompts, source files, or frontend code.

## Connect

1. Open ChatGPT settings and the custom MCP app/connector area available to
   your workspace.
2. Add the production MCP URL above as a remote MCP server.
3. Complete the OAuth authorization flow when prompted. The authorization
   server must issue a token for the MCP protected-resource audience.
4. Allow the connection to scan tools and resources.

For a local diagnostic, set `MCP_E2E_URL` and, when required,
`MCP_BEARER_TOKEN` in the shell environment. Never put the bearer token in a
script or commit it.

## Verify

Recommended first test:

> Use X Intelligence MCP to get the X profile for XDevelopers.

Expected behavior: ChatGPT discovers and calls `x_get_user` with
`{"username":"XDevelopers"}` and receives a structured profile result.

Safe AI demo prompt:

> Using X Intelligence MCP, search recent posts from XDevelopers and analyze the sentiment of one result.

AI analysis is read-only and grounded in retrieved X data. Publishing and
other X mutations remain explicit-confirmation operations.
