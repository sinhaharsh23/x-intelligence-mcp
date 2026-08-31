# Widgets

The Next app provides `account-profile`, `post-card`, `post-feed`, `search-dashboard`, `analytics-dashboard`, `engagement-dashboard`, `trend-dashboard`, `mentions-dashboard`, `followers-dashboard`, `composer`, `thread-viewer`, `conversation-viewer`, `account-comparison`, `content-calendar`, `system-status`, and `authorization-status`.

They use `useWidgetSDK()` from `@nitrostack/widgets` 1.0.9, including `getToolOutput`, `getTheme`, `isReady`, and `callTool`. The shared view layer handles loading, empty data, constrained frames, light/dark mode, keyboard focus, long text wrapping, absent avatars/media/metrics, and reduced motion.

The composer can request optional AI drafts or improvements, but AI output only populates the draft. The existing Draft → Review → Confirm → Publish flow and `confirm=true` write guard remain mandatory. Post cards expose read-only sentiment and reply-draft actions; generated text is rendered as normal React text, never injected HTML.

Widgets consume production tool output only. Mock data belongs in isolated tests/previews and is not returned from MCP tools.
