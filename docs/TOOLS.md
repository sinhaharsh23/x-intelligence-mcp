# MCP tools

All existing tool names and semantics are preserved. The additional
`x_client_compatibility` tool is production-only so the NitroStudio Demo Canvas
remains at or below its 30-item presentation limit.

## Safety classification

- **READ:** `x_get_my_profile`, `x_get_user`, `x_search_users`, `x_get_user_posts`, `x_get_followers`, `x_get_following`, `x_get_mentions`, `x_get_post`, `x_get_posts`, `x_search_posts`, `x_get_thread`, `x_get_replies`, `x_get_conversation`, `x_get_quote_posts`, `x_get_reposts`, `x_get_capabilities`, `x_get_rate_limit_status`, `x_health_check`, `x_get_authorization_status`, `x_client_compatibility`, and all deterministic analytics/intelligence tools.
- **AI_READ:** `x_analyze_sentiment`, `x_analyze_post`, `x_analyze_profile`, `x_compare_accounts`, `x_analyze_content_performance`, `x_analyze_mentions`, `x_find_top_posts`, `x_analyze_posting_times`, `x_analyze_audience`, `x_explain_trend`, `x_content_strategy`, and other grounded analysis tools.
- **DRAFT_ONLY:** `x_generate_post`, `x_generate_thread`, `x_generate_reply`, `x_rewrite_post`, `x_improve_post`, `x_summarize_thread`, `x_summarize_conversation`, `x_generate_content_ideas`, `x_generate_hashtags`, and `x_generate_content_calendar`. These do not call X mutation endpoints.
- **WRITE:** `x_create_post`, `x_reply_to_post`, `x_quote_post`, `x_create_thread`, `x_like_post`, `x_repost`, `x_follow_user`, `x_upload_media`, `x_create_post_with_media`, and `x_reply_with_media`. Every operation remains explicit-confirmation gated.
- **DESTRUCTIVE_WRITE:** `x_delete_post`, `x_unlike_post`, `x_undo_repost`, `x_unfollow_user`, and `x_disconnect`. These remain explicit-confirmation gated where applicable.

## Account

`x_get_my_profile` gets the authenticated profile. `x_get_user` gets a user by ID or exact username. `x_search_users` resolves exact usernames. `x_get_user_posts`, `x_get_followers`, `x_get_following`, and `x_get_mentions` return normalized paginated data.

## Posts

`x_get_post`, `x_get_posts`, and `x_search_posts` read posts. `x_get_thread` reconstructs reply ancestry and a conversation sample. `x_get_replies`, `x_get_conversation`, `x_get_quote_posts`, and `x_get_reposts` read related content or users. Search supports query, username, hashtag, language, reply/repost exclusions, times, max results, and pagination token.

## Writes

`x_create_post`, `x_delete_post`, `x_reply_to_post`, `x_quote_post`, `x_create_thread`, `x_like_post`, `x_unlike_post`, `x_repost`, `x_undo_repost`, `x_follow_user`, `x_unfollow_user`, `x_upload_media`, `x_create_post_with_media`, and `x_reply_with_media` call real X endpoints. Every mutation requires `confirm: true`; no tool auto-publishes. Threads return partial success state on failure.

With `X_AUTH_ENABLED=false`, user-context operations return `AUTH_DISABLED` when no user token is present. App-only-compatible reads use `X_BEARER_TOKEN`; missing credentials return `AUTH_REQUIRED` and never fall back to mock data.

Phase 3 AI tools are optional and return `AI_DISABLED` or `AI_NOT_CONFIGURED` when unavailable. X-grounded AI tools fetch bounded real X data before generation and include safe grounding metadata. AI tools only produce drafts, summaries, analyses, or plans; they never invoke X mutations.

## Analytics and intelligence

Analytics tools: `x_analyze_profile`, `x_analyze_post`, `x_compare_accounts`, `x_analyze_content_performance`, `x_analyze_mentions`, `x_find_top_posts`, `x_analyze_posting_times`.

Intelligence tools: `x_search_topic`, `x_hashtag_analysis`, `x_recent_topic_posts`, `x_topic_accounts`, `x_extract_hashtags`, `x_discover_topics`, `x_find_high_engagement_posts`, `x_analyze_conversation`, `x_compare_posts`, `x_account_summary`.

`x_get_capabilities`, `x_get_rate_limit_status`, and `x_health_check` expose safe operational state. Derived calculations are labeled `Derived Metric`; topic samples are labeled `Observed Topic Signals`.
