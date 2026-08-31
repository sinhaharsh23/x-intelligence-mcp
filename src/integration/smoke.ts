import 'dotenv/config';
import { getConfig } from '../common/config/env.js';
import { XService } from '../modules/x/x.service.js';
import { XOAuthTokenStore } from '../modules/x/x-oauth.store.js';

async function main(): Promise<void> {
  const config = getConfig();
  if (!config.X_ACCESS_TOKEN && !config.X_BEARER_TOKEN) {
    console.error('[BLOCKED — API CREDENTIALS] Set X_ACCESS_TOKEN or X_BEARER_TOKEN before running the X smoke test. No write operation is attempted.');
    return;
  }
  const x = new XService(new XOAuthTokenStore());
  const capabilities = await x.getCapabilities();
  console.log(JSON.stringify({ step: 'capabilities', capabilities }, null, 2));
  const profile = await x.getMe();
  console.log(JSON.stringify({ step: 'authenticated_user', id: profile.id, username: profile.username }, null, 2));
  const posts = await x.getUserPosts(profile.id, { maxResults: 10 });
  console.log(JSON.stringify({ step: 'profile_posts', resultCount: posts.pagination.resultCount }, null, 2));
  const search = await x.searchPosts({ query: 'from:' + profile.username, maxResults: 10 });
  console.log(JSON.stringify({ step: 'recent_search', resultCount: search.pagination.resultCount }, null, 2));
  console.log('Smoke test completed without write operations.');
}

void main().catch((error: unknown) => { console.error('[SMOKE TEST FAILED]', error instanceof Error ? error.message : 'unknown error'); process.exitCode = 1; });
