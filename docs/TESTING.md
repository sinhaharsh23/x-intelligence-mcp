# Testing

`npm test` builds the server and runs deterministic Node tests for search construction, authenticated request construction, rate-limit parsing, normalization assumptions, and analytics. `npm run widget:typecheck` validates the widget app and `npm run widget:build` performs the production Next build.

`npm run integration:smoke` is a separate read-only smoke test. It runs only with explicit X credentials and verifies capabilities, authenticated user, profile posts, and recent search. It never creates or deletes content. There is no automatic write integration test.

`npm run test:e2e` validates the running local `/mcp` endpoint through the real MCP protocol. It checks registration, bounded real X reads, AI status, a real Groq draft, one real X-grounded Groq analysis, auth-disabled behavior, and rejected unconfirmed mutations. It does not perform X writes.
