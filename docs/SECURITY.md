# Security

- Secrets are environment-only and excluded by `.gitignore`.
- Authorization headers, access tokens, refresh tokens, and client secrets are not logged or returned.
- Inputs are validated with Zod before X requests.
- All HTTP requests use URL construction, timeout cancellation, bounded retries, and structured errors.
- Write tools never use cache; reads use short TTLs.
- Every mutating tool requires explicit `confirm: true`; delete, unlike, undo-repost, and unfollow also remain clearly destructive.
- A short in-memory duplicate-post reservation blocks accidental repeated identical posts.
- No eval, shell execution, mass-follow, mass-like, spam, hidden automation, or scheduled auto-posting exists.
- Production errors avoid stack traces and return safe error codes.
- X OAuth uses cryptographically random state and PKCE S256, hashes state keys in memory, consumes pending state once, and expires it after ten minutes.
- OAuth callback pages never include access tokens, refresh tokens, authorization headers, authorization codes, or query-string values.
- Confidential X token exchange and refresh use HTTP Basic client authentication over HTTPS to the official X token endpoint.
- OAuth tokens are process-local only in this phase; no token file is created or committed. Local disconnect clears the stored token without claiming X-side revocation.
