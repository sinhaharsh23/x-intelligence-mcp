# AI safety

- X posts, profiles, and supplied reference text are untrusted data and are enclosed as data-only grounding.
- Provider instructions reject embedded attempts to override behavior, reveal secrets, invoke tools, or perform external actions.
- AI tools cannot call X mutation methods. They produce drafts, analysis, or planning output only.
- Existing mutations continue to require explicit confirmation and remain rate-limited and duplicate-protected.
- Audience analysis does not infer race, religion, sexual orientation, medical condition, political affiliation, private finances, or other sensitive traits.
- Model output is parsed and validated with Zod. Invalid output returns `AI_RESPONSE_INVALID`; there is no fake fallback.
- Inputs, output tokens, grounding size, and sampled-post counts are bounded by configuration.
- Widgets render model text as React text content, never as untrusted HTML.
