# Widgets

The Next app provides the presentation command center at `/dashboard` plus `account-profile`, `post-card`, `post-feed`, `search-dashboard`, `analytics-dashboard`, `engagement-dashboard`, `trend-dashboard`, `mentions-dashboard`, `followers-dashboard`, `composer`, `thread-viewer`, `conversation-viewer`, `account-comparison`, `content-calendar`, `system-status`, and `authorization-status`.

They use `useWidgetSDK()` from `@nitrostack/widgets` 1.0.9, including `getToolOutput`, `getTheme`, `isReady`, and `callTool`. The shared view layer handles loading, empty data, constrained frames, light/dark mode, keyboard focus, long text wrapping, absent avatars/media/metrics, and reduced motion.

The widget root is wrapped in NitroStack's `WidgetLayout`. Buttons use the
SDK host bridge (`callTool` for MCP actions and `openExternal` for X links), so
widgets do not open a second `/mcp` connection. Follow-up results and safe
action failures are surfaced in the widget instead of leaving an unhandled
promise.

The Demo-mode `x_get_capabilities` tool is marked with NitroStack's supported
`@InitialTool()` decorator. NitroStudio can open the project App experience
through the host-managed initial tool and its
`ui://widget/next-dashboard.html` template; a separate browser tab is not
required for the presentation flow.

For NitroStudio presentations, set `DEMO_CANVAS_MODE=true` before `npm run dev`.
This registers a bounded, read-only/AI-draft presentation surface with no X
write tools. The default `DEMO_CANVAS_MODE=false` registers the full widget and
MCP surface used by production.

The composer can request optional AI drafts or improvements, but AI output only populates the draft. The existing Draft → Review → Confirm → Publish flow and `confirm=true` write guard remain mandatory. Post cards expose read-only sentiment and reply-draft actions; generated text is rendered as normal React text, never injected HTML.

Widgets consume production tool output only. Mock data belongs in isolated tests/previews and is not returned from MCP tools.
