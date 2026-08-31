# Phase 3 AI layer

The AI layer is optional and sits above the existing X, analytics, and intelligence services:

`MCP tool → AIService → bounded grounding → provider abstraction → structured result`

It never replaces `XService` or `XApiClient`, and it never calls a write tool. Generated posts, replies, threads, calendars, and ideas are drafts or plans only.

## Configuration

Set `AI_ENABLED=true`, choose `AI_PROVIDER=openai`, `groq`, `gemini`, `anthropic`, or `auto`, and configure the corresponding provider key and optional model in `.env`. `AI_ENABLED=false` is the safe default and leaves all Phase 2 functionality available.

Groq uses the native REST adapter with `GROQ_API_KEY` and optional `GROQ_MODEL`. The default is `openai/gpt-oss-20b`. Groq free/developer-tier limits, account access, and model availability apply.

`x_ai_status` reports enabled state, configured providers, selected provider/model, grounding state, and non-billable configuration health. It never performs a generation request just to check health.

## Grounding

X-grounded tools retrieve real X data first, limit the sample, combine it with deterministic analytics where useful, and send only a bounded delimited payload to the provider. Retrieved posts and user reference text are untrusted data, not instructions. Responses include `grounded`, `sourceType`, `sourceCount`, `sourceChars`, provider, model, and generation time.

Missing X access returns a safe grounding error. The server never supplies mock X data.

## AI tools

The layer provides status, post/thread/reply generation, rewriting, improvement, thread/conversation summaries, text sentiment, content ideas, aggregate audience patterns, observed-trend explanation, content strategy, hashtag suggestions, and planning-calendar generation.

Sentiment is text-only. Audience analysis is limited to observable aggregate content, timing, and engagement patterns; it does not infer sensitive traits.

## Safety and limits

AI output is never publication. The existing X write tools remain the only write path and still require explicit `confirm: true`. Inputs, grounding payloads, sampled posts, and output tokens are bounded. Provider fallback is limited to technical failures and never crosses a safety refusal.

No real provider request is claimed by the test suite. Real provider testing is optional and requires a locally configured key. Run `npm run test:ai:integration` with AI enabled to make one small request using the selected provider.
