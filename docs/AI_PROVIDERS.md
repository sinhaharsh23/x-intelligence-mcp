# AI providers

The provider abstraction currently supports the official HTTP contracts for:

- OpenAI Responses API: `POST https://api.openai.com/v1/responses`
- Groq Chat Completions API: `POST https://api.groq.com/openai/v1/chat/completions`
- Gemini Generate Content API: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Anthropic Messages API: `POST https://api.anthropic.com/v1/messages`

The project uses native `fetch` so no provider SDK is required or loaded when AI is disabled. Provider-specific request and response shapes stay inside `src/modules/ai/providers/`.

Use `AI_PROVIDER=auto` for deterministic priority `openai → groq → gemini → anthropic`, selecting the first configured provider. An explicit provider never silently switches because its key is missing. In auto mode, fallback is allowed only for timeout, rate-limit, or temporary-unavailable errors; safety refusals and authentication errors stop the request.

Groq uses `GROQ_API_KEY` and optional `GROQ_MODEL`; the default is `openai/gpt-oss-20b`. Groq account/model availability and free-tier rate limits can restrict real requests.

Provider health is configuration-only and does not issue billable generation requests. Keys are read from environment variables and never logged or included in MCP output.
