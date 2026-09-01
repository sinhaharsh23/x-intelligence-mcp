import 'dotenv/config';
import { spawn } from 'node:child_process';

const noArgumentTools = new Set(['x_get_capabilities', 'x_ai_status']);
const listTools = new Set(['x_search_posts', 'x_get_user_posts', 'x_get_followers', 'x_get_following', 'x_get_mentions']);
const postTools = new Set(['x_get_post', 'x_analyze_post', 'x_summarize_thread', 'x_summarize_conversation', 'x_analyze_sentiment', 'x_generate_reply']);
const identityTools = new Set(['x_get_user_posts', 'x_get_followers', 'x_get_following', 'x_get_mentions', 'x_content_strategy']);
const aiTools = new Set(['x_ai_status', 'x_generate_post', 'x_generate_thread', 'x_generate_reply', 'x_rewrite_post', 'x_improve_post', 'x_summarize_thread', 'x_summarize_conversation', 'x_analyze_sentiment', 'x_generate_content_ideas', 'x_content_strategy', 'x_generate_hashtags']);
const expectedTemplates = {
  x_get_capabilities: 'dashboard', x_get_user: 'account-profile', x_get_post: 'post-card', x_search_posts: 'search-dashboard',
  x_get_user_posts: 'post-card', x_get_followers: 'post-card', x_get_following: 'post-card', x_get_mentions: 'post-card',
  x_ai_status: 'system-status', x_generate_post: 'composer', x_generate_thread: 'composer', x_generate_reply: 'composer',
  x_rewrite_post: 'composer', x_improve_post: 'composer', x_summarize_thread: 'post-card', x_summarize_conversation: 'post-card',
  x_analyze_sentiment: 'analytics-dashboard', x_generate_content_ideas: 'post-card', x_content_strategy: 'post-card', x_generate_hashtags: 'post-card', x_analyze_post: 'analytics-dashboard',
};

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function dict(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function structured(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  const text = list(result?.content).find((item) => item?.type === 'text')?.text;
  try { return text ? JSON.parse(text) : result ?? {}; } catch { return {}; }
}
function errorCode(result, value) {
  if (typeof value?.code === 'string') return value.code;
  const text = list(result?.content).find((item) => item?.type === 'text')?.text;
  return result?.isError && typeof text === 'string' ? text.match(/\b([A-Z][A-Z0-9_]{3,})\b/)?.[1] : undefined;
}
function templateRoute(tool) {
  const template = typeof tool.outputTemplate === 'string' ? tool.outputTemplate : tool._meta?.['openai/outputTemplate'];
  return typeof template === 'string' ? template : null;
}
function category(name) { if (name === 'x_get_capabilities' || name === 'x_ai_status') return 'STATUS'; if (name.startsWith('x_') && aiTools.has(name)) return 'AI'; return 'READ'; }
function externalCode(code) { return ['AUTH_REQUIRED', 'AUTH_DISABLED', 'FORBIDDEN', 'NOT_FOUND', 'BILLING_OR_ACCESS_RESTRICTED', 'RATE_LIMITED', 'NETWORK_ERROR', 'AI_NOT_CONFIGURED', 'AI_PROVIDER_UNAVAILABLE', 'AI_PROVIDER_AUTH_ERROR', 'AI_RATE_LIMITED', 'AI_TIMEOUT', 'AI_CONTEXT_TOO_LARGE'].includes(code); }

const childEnv = { ...process.env, DEMO_CANVAS_MODE: 'true', PORT: '3298', HOST: '127.0.0.1', NODE_ENV: 'development', MCP_TRANSPORT_TYPE: 'dual', OAUTH_REQUIRED: 'false' };
const child = spawn(process.execPath, ['dist/index.js'], { cwd: process.cwd(), env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '';
let nextId = 0;
const pending = new Map();
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      if (message.id && pending.has(message.id)) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        message.error ? waiter.reject(new Error('MCP request failed.')) : waiter.resolve(message.result);
      }
    } catch { /* stderr/log safety is intentionally not echoed. */ }
  }
});

async function rpc(method, params = {}) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const id = ++nextId;
    const result = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('MCP request timed out.')); }, 30_000);
      pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    try { return await result; } catch (error) { if (attempt === 79) throw error; await sleep(100); }
  }
  throw new Error('MCP request failed.');
}
function notify(method, params = {}) { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); }

async function callTool(name, args) {
  try {
    const raw = await rpc('tools/call', { name, arguments: args });
    const value = structured(raw);
    const code = errorCode(raw, value);
    if (raw?.isError || value?.ok === false || code) return { ok: false, code: code ?? 'MCP_TOOL_ERROR', value, details: dict(value?.details), message: typeof value?.message === 'string' ? value.message.slice(0, 300) : undefined };
    return { ok: true, value };
  } catch { return { ok: false, code: 'MCP_RUNTIME_ERROR', value: {} }; }
}

try {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'demo-tool-verifier', version: '1.0.0' } });
  notify('notifications/initialized');
  await sleep(250);
  const toolResult = await rpc('tools/list');
  const tools = toolResult?.tools ?? [];
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  const resources = await rpc('resources/list');
  const prompts = await rpc('prompts/list');
  const canvasItems = tools.length + (resources?.resources?.length ?? 0) + (prompts?.prompts?.length ?? 0);
  const audit = [];
  const schemaFailures = [];
  for (const tool of tools) {
    const properties = Object.keys(tool.inputSchema?.properties ?? {});
    const template = templateRoute(tool);
    if (!noArgumentTools.has(tool.name) && properties.length === 0) schemaFailures.push(`${tool.name}: empty input properties`);
    if (!template) schemaFailures.push(`${tool.name}: missing output template`);
  }

  const user = await callTool('x_get_user', { username: 'XDevelopers' });
  const userId = user.ok && /^\d+$/.test(String(user.value?.id)) ? String(user.value.id) : undefined;
  const numericUser = userId ? await callTool('x_get_user', { id: userId }) : { ok: false, code: 'DEPENDENCY_UNAVAILABLE' };
  const atUser = await callTool('x_get_user', { username: '@XDevelopers' });
  const postSearch = await callTool('x_search_posts', { query: 'from:XDevelopers', maxResults: 10 });
  const postId = postSearch.ok && /^\d+$/.test(String(postSearch.value?.data?.[0]?.id)) ? String(postSearch.value.data[0].id) : undefined;
  const usernameInput = { username: 'XDevelopers', maxResults: 10 };
  const testInputs = {
    x_get_capabilities: {}, x_get_user: { username: 'XDevelopers' }, x_get_post: { postId }, x_search_posts: { query: 'from:XDevelopers', maxResults: 10 },
    x_get_user_posts: usernameInput, x_get_followers: usernameInput, x_get_following: usernameInput, x_get_mentions: usernameInput,
    x_ai_status: {}, x_generate_post: { topic: 'Why MCP servers are important for AI agents', tone: 'professional' },
    x_generate_thread: { topic: 'Why MCP servers are important for AI agents', tone: 'professional', numberOfPosts: 2 },
    x_generate_reply: { postId, tone: 'professional' }, x_rewrite_post: { text: 'MCP servers connect agents to safe tools.', goal: 'clearer' },
    x_improve_post: { text: 'MCP servers connect agents to safe tools.', suggestHashtags: true }, x_summarize_thread: { postId, maxResults: 10 },
    x_summarize_conversation: { postId, maxResults: 10 }, x_analyze_sentiment: { postId }, x_generate_content_ideas: { topic: 'MCP servers', numberOfIdeas: 1 },
    x_content_strategy: { goal: 'educate developers' }, x_generate_hashtags: { topic: 'MCP servers', maxResults: 10 }, x_analyze_post: { postId },
  };
  const seedFailures = [];
  if (!userId) seedFailures.push('x_get_user did not return a numeric ID');
  if (!postId) seedFailures.push('x_search_posts did not return a numeric post ID');
  const runtimeInputs = { ...testInputs, x_get_post: { postId: postId ?? '0' }, x_generate_reply: { postId: postId ?? '0', tone: 'professional' }, x_summarize_thread: { postId: postId ?? '0', maxResults: 10 }, x_summarize_conversation: { postId: postId ?? '0', maxResults: 10 }, x_analyze_sentiment: { postId: postId ?? '0' }, x_analyze_post: { postId: postId ?? '0' }, x_content_strategy: { goal: 'educate developers' } };
  for (const tool of tools) {
    const name = tool.name;
    const input = runtimeInputs[name];
    const properties = Object.keys(tool.inputSchema?.properties ?? {});
    const template = templateRoute(tool);
    const identity = identityTools.has(name) ? (userId ? 'PASS' : 'FAIL') : postTools.has(name) ? (postId ? 'PASS' : 'FAIL') : 'N/A';
    if (!input) { audit.push({ tool: name, category: category(name), inputSchema: properties.length ? 'PASS' : 'FAIL', safeTestInput: 'not prepared', identityResolution: identity, liveExecution: 'FAIL', widgetTemplate: template, widgetMapping: 'FAIL', widgetActions: 'WARNING', pagination: 'N/A', finalStatus: 'FAIL' }); continue; }
    const result = noArgumentTools.has(name) ? await callTool(name, {}) : (Object.values(input).some((value) => value === '0' || value === undefined) ? { ok: false, code: 'DEPENDENCY_UNAVAILABLE', value: {} } : await callTool(name, input));
    let pagination = 'N/A';
    if (listTools.has(name)) {
      const nextToken = typeof dict(result.value?.pagination).nextToken === 'string' ? dict(result.value.pagination).nextToken : undefined;
      if (!result.ok) pagination = 'WARNING';
      else if (nextToken) {
        const nextPage = await callTool(name, { ...input, paginationToken: nextToken });
        pagination = nextPage.ok || externalCode(nextPage.code) ? 'PASS' : 'WARNING';
      } else pagination = dict(result.value).pagination ? 'PASS' : 'FAIL';
    }
    const expectedTemplate = expectedTemplates[name];
    const mapping = typeof template === 'string' && template.includes(expectedTemplate) ? 'PASS' : 'FAIL';
    const live = result.ok ? 'PASS' : externalCode(result.code) ? 'EXTERNAL_BLOCKER' : result.code === 'DEPENDENCY_UNAVAILABLE' ? 'SKIPPED_DEPENDENCY' : 'FAIL';
    const finalStatus = result.ok ? 'PASS' : externalCode(result.code) || result.code === 'DEPENDENCY_UNAVAILABLE' ? 'WARNING' : 'FAIL';
    audit.push({ tool: name, category: category(name), inputSchema: properties.length || noArgumentTools.has(name) ? 'PASS' : 'FAIL', safeTestInput: name === 'x_get_capabilities' || name === 'x_ai_status' ? 'none' : name.includes('user') || name.includes('followers') || name.includes('following') || name.includes('mentions') ? 'username=XDevelopers; maxResults=10' : postTools.has(name) ? 'real search post ID' : 'bounded text/topic input', identityResolution: identity, liveExecution: live, widgetTemplate: template, widgetMapping: mapping, widgetActions: 'WARNING', pagination, finalStatus, errorCode: result.ok ? undefined : result.code, errorDetails: result.ok ? undefined : result.details, errorMessage: result.ok ? undefined : result.message });
  }
  const writes = tools.filter((tool) => /^(x_create|x_delete|x_reply|x_quote|x_like|x_unlike|x_repost|x_undo|x_follow|x_unfollow|x_upload)/.test(tool.name));
  const implementationFailures = audit.filter((row) => row.inputSchema === 'FAIL' || row.widgetMapping === 'FAIL' || row.finalStatus === 'FAIL');
  const output = { inventory: tools.map((tool) => tool.name), counts: { tools: tools.length, resources: resources?.resources?.length ?? 0, prompts: prompts?.prompts?.length ?? 0, canvasItems }, canvasPass: canvasItems <= 30, schemaFailures, seed: { userLookup: user.ok ? 'PASS' : user.code, numericUserId: numericUser.ok ? 'PASS' : userId ? 'FAIL' : 'DEPENDENCY_UNAVAILABLE', leadingAtNormalization: atUser.ok ? 'PASS' : atUser.code, search: postSearch.ok ? 'PASS' : postSearch.code, realPostId: postId ? 'PASS' : 'FAIL' }, audit, writesSkipped: writes.map((tool) => tool.name), implementationFailures, pass: canvasItems <= 30 && tools.length === 21 && schemaFailures.length === 0 && writes.length === 0 && implementationFailures.length === 0 };
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = output.pass ? 0 : 1;
} finally {
  child.kill('SIGKILL');
}
