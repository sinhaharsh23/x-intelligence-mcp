# Phase 4 pre-deployment checklist

This checklist records the current pre-deployment validation state. It does not authorize deployment.

- [x] Automated tests pass
- [x] TypeScript passes
- [x] Widget typecheck passes
- [x] Widget production build passes
- [x] NitroStack build passes
- [x] NitroStack pack dry-run passes
- [x] Real X read verified
- [x] Real Groq provider verified
- [x] Real X-grounded AI verified
- [x] Real MCP E2E verified
- [x] No runtime mock data fallback
- [x] No secret values in source, docs, tests, or package output
- [x] `.env` excluded from package output
- [x] Write confirmation is required by mutation schemas
- [x] AI tools are draft/analysis-only
- [x] Prompt-injection boundaries are present and tested
- [x] X rate-limit parsing is implemented
- [x] X/AI timeouts and bounded retries are implemented
- [x] Provider failures are isolated from deterministic X functionality
- [x] Health checks do not perform billable AI generation
- [x] Production MCP endpoint has a fail-closed configuration gate
- [x] Production MCP process rejects loopback host binding
- [ ] Production MCP endpoint authentication configured with the real issuer/verifier
- [ ] Production secrets stored in a deployment secret manager
- [x] X OAuth blocker documented as external/deferred
- [ ] Real X writes verified (intentionally not performed in Phase 4)

## Commands

With the local dual-transport server already running, use `npm run test:e2e`. The script performs bounded read-only X calls, one draft-only Groq MCP call, one grounded X-to-Groq call, auth-disabled validation, and confirmation rejection checks. It never performs X mutations.
