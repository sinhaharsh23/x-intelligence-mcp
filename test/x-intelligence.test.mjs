import assert from 'node:assert/strict';
import test from 'node:test';
import { XApiClient } from '../dist/modules/x/x.client.js';
import { buildSearchQuery } from '../dist/modules/x/x.service.js';
import { AnalyticsService } from '../dist/modules/analytics/analytics.service.js';
import { XService } from '../dist/modules/x/x.service.js';
import { confirmSchema } from '../dist/modules/x/x.schemas.js';
import { resetConfigForTests } from '../dist/common/config/env.js';
import { XIntelligenceError } from '../dist/common/errors/x-errors.js';
import { createXOAuthCodeChallenge, createXOAuthCodeVerifier, createXOAuthState, XOAuthService } from '../dist/modules/x/x-oauth.service.js';
import { XOAuthTokenStore } from '../dist/modules/x/x-oauth.store.js';

const config = { NODE_ENV: 'test', PORT: 3000, X_API_BASE_URL: 'https://api.x.com', X_API_TIMEOUT_MS: 5000, X_API_MAX_RETRIES: 0, X_AUTH_ENABLED: false, X_ACCESS_TOKEN: 'test-user-token', X_BEARER_TOKEN: undefined, X_CLIENT_ID: undefined, X_CLIENT_SECRET: undefined, X_REFRESH_TOKEN: undefined, X_REDIRECT_URI: undefined, X_SCOPES: 'tweet.read tweet.write', APP_BASE_URL: undefined, RESOURCE_URI: undefined, AUTH_SERVER_URL: undefined, TOKEN_AUDIENCE: undefined, TOKEN_ISSUER: undefined, OAUTH_REQUIRED: 'false', MCP_API_KEY: undefined };


test('buildSearchQuery safely composes supported operators', () => {
  assert.equal(buildSearchQuery({ query: 'launch', username: '@xdev', hashtag: '#mcp', language: 'en', excludeReplies: true, excludeReposts: true }), 'launch from:xdev #mcp lang:en -is:retweet -is:reply');
});

test('X client constructs authenticated requests and tracks rate limits', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (input) => { requestedUrl = String(input); return new Response(JSON.stringify({ data: { id: '1' }, meta: { result_count: 1 } }), { status: 200, headers: { 'x-rate-limit-limit': '15', 'x-rate-limit-remaining': '14', 'x-rate-limit-reset': '2000000000' } }); };
  try {
    const client = new XApiClient(config);
    const response = await client.request('/2/users/me', { auth: 'user', query: { 'user.fields': 'username' } });
    assert.equal(response.data.id, '1');
    assert.match(requestedUrl, /api\.x\.com\/2\/users\/me/);
    assert.match(requestedUrl, /user\.fields=username/);
    assert.equal(client.rateLimitSnapshot[0].remaining, 14);
  } finally { globalThis.fetch = originalFetch; }
});

test('X API errors preserve safe response context without credentials', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ type: 'https://api.x.com/problems/forbidden', title: 'Forbidden', detail: 'The app cannot access this endpoint.' }] }), { status: 403, headers: { 'x-rate-limit-limit': '900', 'x-rate-limit-remaining': '899', 'x-rate-limit-reset': '2000000000' } });
  try {
    const client = new XApiClient(config);
    await assert.rejects(() => client.request('/2/users/example', { auth: 'user' }), (error) => {
      assert.equal(error.code, 'FORBIDDEN');
      assert.match(error.message, /GET \/2\/users\/example returned HTTP 403/);
      assert.deepEqual(error.details, { httpStatus: 403, endpoint: '/2/users/example', xErrorType: 'https://api.x.com/problems/forbidden', xErrorTitle: 'Forbidden', xErrorDetail: 'The app cannot access this endpoint.', remaining: 899, resetAt: '2033-05-18T03:33:20.000Z' });
      assert.equal(error.details.authorization, undefined);
      return true;
    });
  } finally { globalThis.fetch = originalFetch; }
});

test('auth-disabled mode is explicit and bearer reads remain available', async () => {
  const originalFetch = globalThis.fetch;
  const noCredentials = { ...config, X_ACCESS_TOKEN: undefined, X_BEARER_TOKEN: undefined };
  try {
    const disabledClient = new XApiClient(noCredentials);
    await assert.rejects(() => disabledClient.request('/2/users/me', { auth: 'user' }), (error) => error.code === 'AUTH_DISABLED');
    await assert.rejects(() => disabledClient.request('/2/users/123'), (error) => error.code === 'AUTH_REQUIRED');
    let requestedUrl = '';
    globalThis.fetch = async (input) => { requestedUrl = String(input); return new Response(JSON.stringify({ data: [{ id: '1', text: 'real-shaped test response' }], meta: { result_count: 1 } }), { status: 200 }); };
    const bearerClient = new XApiClient({ ...noCredentials, X_BEARER_TOKEN: 'test-bearer-token' });
    const result = await bearerClient.request('/2/users/123/tweets', { query: { max_results: 10 } });
    assert.equal(result.meta.result_count, 1);
    assert.match(requestedUrl, /\/2\/users\/123\/tweets/);
  } finally { globalThis.fetch = originalFetch; }
});

test('X API status errors map to safe structured categories', async () => {
  const originalFetch = globalThis.fetch;
  const cases = [[400, 'INVALID_REQUEST'], [401, 'TOKEN_EXPIRED'], [402, 'BILLING_OR_ACCESS_RESTRICTED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [429, 'RATE_LIMITED'], [500, 'X_API_ERROR']];
  try {
    for (const [status, code] of cases) {
      globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ type: 'https://api.x.com/problems/test', title: 'Safe title', detail: 'Safe provider detail' }] }), { status, headers: { 'x-rate-limit-limit': '10', 'x-rate-limit-remaining': '9', 'x-rate-limit-reset': '2000000000' } });
      const client = new XApiClient({ ...config, X_API_MAX_RETRIES: 0 });
      await assert.rejects(() => client.request('/2/test', { auth: 'user' }), (error) => {
        assert.equal(error.code, code);
        assert.equal(error.details.httpStatus, status);
        assert.equal(error.details.endpoint, '/2/test');
        assert.equal(error.details.authorization, undefined);
        return true;
      });
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('public account and timeline reads do not force user context', async () => {
  const store = new XOAuthTokenStore();
  const service = new XService(store);
  const calls = [];
  service.client.request = async (path, options) => { calls.push({ path, options }); return { data: path.includes('/tweets') ? [] : { id: '1', name: 'Account', username: 'account' }, meta: { result_count: 0 } }; };
  await service.getUser({ id: '1' });
  await service.getUserPosts('1', { maxResults: 10 });
  assert.equal(calls[0].options.auth, undefined);
  assert.equal(calls[1].options.auth, undefined);
  assert.equal(calls[1].options.query.max_results, 10);
});

test('analytics leaves unavailable X metrics undefined', () => {
  const analytics = new AnalyticsService().posts([{ id: '1', text: 'a', metrics: {}, media: [], hashtags: [], mentions: [] }]);
  assert.equal(analytics.averageLikes, undefined);
  assert.equal(analytics.averageImpressions, undefined);
  assert.equal(analytics.averageEngagement, undefined);
});

test('analytics are deterministic and labeled as derived', () => {
  const analytics = new AnalyticsService().posts([{ id: '1', text: 'a', metrics: { likes: 10, replies: 2, reposts: 1, quotes: 0, bookmarks: 0, impressions: 0 }, media: [], hashtags: ['MCP'], mentions: [], createdAt: '2026-01-01T10:00:00Z' }, { id: '2', text: 'b', metrics: { likes: 2, replies: 1, reposts: 0, quotes: 1, bookmarks: 0, impressions: 0 }, media: [], hashtags: ['mcp'], mentions: [], createdAt: '2026-01-02T10:00:00Z' }]);
  assert.equal(analytics.label, 'Derived Metric');
  assert.equal(analytics.averageEngagement, 8.5);
  assert.equal(analytics.commonHashtags[0].count, 2);
});

test('destructive confirmation schema rejects missing confirmation', () => {
  assert.equal(confirmSchema.safeParse({ confirm: false }).success, false);
  assert.equal(confirmSchema.safeParse({ confirm: true }).success, true);
});

test('thread creation returns partial failure state', async () => {
  const service = new XService();
  let calls = 0;
  service.createPost = async (input) => { calls += 1; if (calls === 2) throw new Error('simulated API failure'); return { id: String(calls), text: input.text ?? '', media: [], metrics: { likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, impressions: 0 }, hashtags: [], mentions: [] }; };
  const result = await service.createThread([{ text: 'one' }, { text: 'two' }, { text: 'three' }]);
  assert.deepEqual(result.successfulPosts.map((post) => post.postId), ['1']);
  assert.equal(result.failedIndex, 1);
  assert.match(result.failureReason, /simulated/);
});

test('PKCE uses S256 and OAuth state is one-time and expiring', () => {
  const verifier = createXOAuthCodeVerifier();
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.equal(createXOAuthCodeChallenge(verifier).length, 43);
  assert.match(createXOAuthState(), /^[A-Za-z0-9_-]+$/);
  const store = new XOAuthTokenStore();
  store.savePending('one-time-state', { codeVerifier: verifier, redirectUri: 'http://localhost:3000/auth/x/callback', scopes: ['tweet.read'], expiresAt: Date.now() + 1000 });
  assert.equal(store.consumePending('wrong-state'), undefined);
  assert.equal(store.consumePending('one-time-state').redirectUri, 'http://localhost:3000/auth/x/callback');
  assert.equal(store.consumePending('one-time-state'), undefined);
  store.savePending('expired-state', { codeVerifier: verifier, redirectUri: 'http://localhost:3000/auth/x/callback', scopes: ['tweet.read'], expiresAt: Date.now() - 1 });
  assert.equal(store.consumePending('expired-state'), undefined);
});

test('OAuth callback rejects invalid state and missing code without contacting X', async () => {
  const store = new XOAuthTokenStore();
  const service = new XOAuthService(new XService(store), store);
  await assert.rejects(() => service.handleCallback({ state: 'missing' }), (error) => error instanceof XIntelligenceError && error.code === 'AUTHENTICATION_ERROR');
  store.savePending('valid-state', { codeVerifier: 'verifier', redirectUri: 'http://localhost:3000/auth/x/callback', scopes: ['tweet.read'], expiresAt: Date.now() + 1000 });
  await assert.rejects(() => service.handleCallback({ state: 'valid-state' }), (error) => error instanceof XIntelligenceError && error.code === 'AUTHENTICATION_ERROR');
  assert.equal(store.consumePending('valid-state'), undefined);
});

test('confidential authorization-code exchange uses Basic auth and does not put the secret in the form body', async () => {
  const originalFetch = globalThis.fetch;
  let requestInit;
  globalThis.fetch = async (_input, init) => { requestInit = init; return new Response(JSON.stringify({ access_token: 'oauth-access', refresh_token: 'oauth-refresh', token_type: 'bearer', expires_in: 7200, scope: 'tweet.read offline.access' }), { status: 200 }); };
  try {
    const client = new XApiClient({ ...config, X_CLIENT_ID: 'client-id', X_CLIENT_SECRET: 'client-secret' });
    const token = await client.exchangeAuthorizationCode({ code: 'auth-code', codeVerifier: 'verifier', redirectUri: 'http://localhost:3000/auth/x/callback' });
    assert.equal(token.access_token, 'oauth-access');
    assert.match(requestInit.headers.Authorization, /^Basic /);
    assert.doesNotMatch(String(requestInit.body), /client-secret/);
    assert.doesNotMatch(JSON.stringify(client.oauthToken ?? {}), /client-secret/);
  } finally { globalThis.fetch = originalFetch; }
});

test('expired OAuth access token refreshes once and retries the original request', async () => {
  const originalFetch = globalThis.fetch;
  const store = new XOAuthTokenStore();
  store.saveToken({ accessToken: 'expired-access', refreshToken: 'refresh-token', tokenType: 'bearer', scopes: ['tweet.read', 'offline.access'], expiresAt: Date.now() - 1, connectedAt: new Date().toISOString() });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith('/2/oauth2/token')) return new Response(JSON.stringify({ access_token: 'refreshed-access', refresh_token: 'new-refresh', expires_in: 3600, scope: 'tweet.read offline.access' }), { status: 200 });
    if (requests.length === 1) return new Response(JSON.stringify({ errors: [{ title: 'Unauthorized', detail: 'expired' }] }), { status: 401 });
    return new Response(JSON.stringify({ data: { id: 'post-1' } }), { status: 200 });
  };
  try {
    const client = new XApiClient({ ...config, X_CLIENT_ID: 'client-id', X_CLIENT_SECRET: 'client-secret' }, store);
    const response = await client.request('/2/tweets/post-1', { auth: 'user' });
    assert.equal(response.data.id, 'post-1');
    assert.equal(requests.length, 3);
    assert.equal(store.getToken().accessToken, 'refreshed-access');
    assert.equal(store.getToken().refreshToken, 'new-refresh');
  } finally { globalThis.fetch = originalFetch; }
});

test('refresh failure returns TOKEN_EXPIRED and does not retry repeatedly', async () => {
  const originalFetch = globalThis.fetch;
  const store = new XOAuthTokenStore();
  store.saveToken({ accessToken: 'expired-access', refreshToken: 'bad-refresh', tokenType: 'bearer', scopes: ['tweet.read', 'offline.access'], expiresAt: Date.now() - 1, connectedAt: new Date().toISOString() });
  let tokenRequests = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/2/oauth2/token')) { tokenRequests += 1; return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }); }
    return new Response(JSON.stringify({ errors: [{ title: 'Unauthorized' }] }), { status: 401 });
  };
  try {
    const client = new XApiClient({ ...config, X_CLIENT_ID: 'client-id', X_CLIENT_SECRET: 'client-secret' }, store);
    await assert.rejects(() => client.request('/2/users/me', { auth: 'user' }), (error) => error instanceof XIntelligenceError && error.code === 'TOKEN_EXPIRED');
    assert.equal(tokenRequests, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('authorization URL contains the registered callback, offline access, and S256 PKCE', () => {
  const names = ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_REDIRECT_URI', 'X_SCOPES'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.X_CLIENT_ID = 'client-id';
    process.env.X_CLIENT_SECRET = 'client-secret';
    process.env.X_REDIRECT_URI = 'http://localhost:3000/auth/x/callback';
    process.env.X_SCOPES = 'tweet.read users.read offline.access';
    resetConfigForTests();
    const store = new XOAuthTokenStore();
    const service = new XOAuthService(new XService(store), store);
    const url = new URL(service.getAuthorizationUrl());
    assert.equal(url.origin + url.pathname, 'https://x.com/i/oauth2/authorize');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/auth/x/callback');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.match(url.searchParams.get('scope'), /offline\.access/);
    assert.equal(store.consumePending(url.searchParams.get('state')).redirectUri, 'http://localhost:3000/auth/x/callback');
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    resetConfigForTests();
  }
});

test('capabilities distinguish manual token and OAuth-connected state', async () => {
  const names = ['X_ACCESS_TOKEN', 'X_BEARER_TOKEN', 'X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_REFRESH_TOKEN', 'X_REDIRECT_URI', 'X_SCOPES'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.X_ACCESS_TOKEN = 'manual-token';
    process.env.X_BEARER_TOKEN = '';
    process.env.X_CLIENT_ID = '';
    process.env.X_CLIENT_SECRET = '';
    process.env.X_REFRESH_TOKEN = '';
    process.env.X_REDIRECT_URI = 'http://localhost:3000/auth/x/callback';
    process.env.X_SCOPES = 'tweet.read users.read';
    resetConfigForTests();
    const store = new XOAuthTokenStore();
    const service = new XService(store);
    assert.equal((await service.getCapabilities()).authorization.state, 'manual_token');
    store.saveToken({ accessToken: 'oauth-token', refreshToken: 'refresh-token', tokenType: 'bearer', scopes: ['tweet.read', 'users.read', 'tweet.write', 'offline.access'], connectedAt: new Date().toISOString() });
    assert.equal((await service.getCapabilities()).authorization.state, 'oauth_connected');
    assert.doesNotMatch(JSON.stringify((await service.getCapabilities()).authorization), /oauth-token|refresh-token/);
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    resetConfigForTests();
  }
});
