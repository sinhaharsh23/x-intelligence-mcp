# X API capabilities

Integrated v2 endpoints use `https://api.x.com`:

- Users: `GET /2/users/me`, `/2/users/:id`, `/2/users/by/username/:username`, `/2/users/by`, `/2/users/:id/tweets`, `/2/users/:id/followers`, `/2/users/:id/following`, `/2/users/:id/mentions`.
- Posts: `GET /2/tweets/:id`, `GET /2/tweets`, `GET /2/tweets/search/recent`, `/2/tweets/:id/quote_tweets`, `/2/tweets/:id/retweeted_by`.
- Manage posts: `POST /2/tweets`, `DELETE /2/tweets/:id`.
- Likes, reposts, follows: `/2/users/:id/likes`, `/2/users/:id/retweets`, `/2/users/:id/following`.
- Media: `POST /2/media/upload` and `POST /2/media/metadata` for the supported base64 upload path.

Public user lookup, user-post timelines, user mentions, follower/following lookup, post lookup, and recent search support app-only reads. `/2/users/me`, private metrics, home timelines, mutations, and media operations require user context where documented. Current X plan access, rate limits, token scopes, and media constraints can block individual endpoints. The capability tool reports configuration-derived availability without pretending that a plan has access.
