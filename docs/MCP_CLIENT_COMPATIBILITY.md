# MCP client compatibility

X Intelligence MCP keeps one NitroStack backend for all supported clients:

```text
ChatGPT custom MCP app ─┐
Claude custom connector ─┼──> https://…/mcp
NitroStudio ────────────┘          │
                          MCP tools/resources/prompts
                                   │
                            X service + AI service
                              /             \
                       Official X API       Groq AI
```

The `/mcp` endpoint uses Streamable HTTP for remote clients. NitroStack also
keeps the existing STDIO path for NitroStudio and the legacy `/sse` plus
`/mcp/messages` compatibility routes for older MCP clients. No
ChatGPT-specific or Claude-specific business logic is duplicated.

Supported protocol checks are `initialize`, `notifications/initialized`,
`tools/list`, `tools/call`, `resources/list`, `resources/read`,
`resources/templates/list`, and `prompts/list` where the client requests them.
The server advertises `X Intelligence MCP` version `1.1.0` and keeps existing
X tools, resources, prompts, widgets, demo mode, full mode, OAuth behavior,
Groq integration, and draft-only safety semantics.

The production-only `x_client_compatibility` tool reports safe client and
transport status without returning credentials, tokens, issuer secrets, or
other internal environment values. It is intentionally excluded from the
30-item Demo Canvas.
