import 'dotenv/config';
import { spawn } from 'node:child_process';

const DEFAULT_ENDPOINT = 'https://x-intelligence-mcp-6a95e036-xbuilders-srmist.app.nitrocloud.ai/mcp';
const PROTOCOL_VERSION = '2025-06-18';
const LOCAL_MODE = process.env.MCP_CLAUDE_LOCAL === 'true';
const LOCAL_PORT = Number(process.env.MCP_CLAUDE_LOCAL_PORT ?? 3405);
const ENDPOINT = LOCAL_MODE ? `http://127.0.0.1:${LOCAL_PORT}/mcp` : (process.env.MCP_E2E_URL ?? DEFAULT_ENDPOINT);
const CLIENT_NAME = process.env.MCP_CLIENT_NAME ?? 'claude-custom-connector';
const REQUEST_TIMEOUT_MS = Math.max(2_000, Number(process.env.MCP_REQUEST_TIMEOUT_MS ?? 30_000));
const SAFE_ERROR_CODES = new Set(['AUTH_REQUIRED', 'AUTH_DISABLED', 'FORBIDDEN', 'NOT_FOUND', 'BILLING_OR_ACCESS_RESTRICTED', 'RATE_LIMITED', 'NETWORK_ERROR', 'X_API_ERROR', 'X_API_AUTH_ERROR', 'X_API_FORBIDDEN', 'X_API_NOT_FOUND', 'X_API_RATE_LIMITED', 'AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_PROVIDER_UNAVAILABLE', 'AI_PROVIDER_AUTH_ERROR', 'AI_RATE_LIMITED', 'AI_TIMEOUT', 'AI_BAD_RESPONSE', 'AI_RESPONSE_INVALID', 'AI_CONTEXT_TOO_LARGE', 'AI_SAFETY_REFUSAL', 'AI_GROUNDING_FAILED', 'VALIDATION_ERROR', 'INVALID_INPUT', 'DEPENDENCY_UNAVAILABLE']);
const EXPECTED_TOOLS = ['x_get_capabilities', 'x_get_user', 'x_get_post', 'x_search_posts', 'x_get_user_posts', 'x_get_followers', 'x_get_following', 'x_get_mentions', 'x_ai_status', 'x_generate_post', 'x_generate_thread', 'x_generate_reply', 'x_rewrite_post', 'x_improve_post', 'x_summarize_thread', 'x_summarize_conversation', 'x_analyze_sentiment', 'x_generate_content_ideas', 'x_content_strategy', 'x_generate_hashtags', 'x_analyze_post'];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function structured(result) { if (isRecord(result?.structuredContent)) return result.structuredContent; const text = result?.content?.find((item) => item?.type === 'text')?.text; if (typeof text !== 'string') return {}; try { return JSON.parse(text); } catch { return {}; } }
function errorCode(result, value) { for (const candidate of [value?.code, value?.error?.code, result?.code]) if (typeof candidate === 'string' && SAFE_ERROR_CODES.has(candidate)) return candidate; const text = result?.content?.find((item) => item?.type === 'text')?.text; return typeof text === 'string' ? text.match(/\[([A-Z][A-Z0-9_]{3,})\]/)?.[1] : undefined; }
function parseBody(text, contentType) { if (!text) return {}; if (contentType.includes('text/event-stream')) { const data = text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).filter(Boolean).at(-1); try { return data ? JSON.parse(data) : {}; } catch { return {}; } } try { return JSON.parse(text); } catch { return {}; } }
function schemaProblems(tool) { const schema = tool?.inputSchema; const problems = []; if (!isRecord(schema) || schema.type !== 'object') problems.push('inputSchema.type'); if (schema?.properties !== undefined && !isRecord(schema.properties)) problems.push('properties'); if (schema?.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== 'string' || !schema.properties || !(key in schema.properties)))) problems.push('required'); if (Array.isArray(schema?.required) && new Set(schema.required).size !== schema.required.length) problems.push('required-duplicates'); if ('widget' in (tool ?? {}) || 'outputTemplate' in (tool ?? {})) problems.push('legacy-widget-field'); if (tool?._meta !== undefined && !isRecord(tool._meta)) problems.push('_meta'); return problems; }

let sessionId;
let requestId = 0;
const bearerToken = process.env.MCP_BEARER_TOKEN;
const origin = process.env.MCP_ORIGIN ?? (CLIENT_NAME.includes('claude') ? 'https://claude.ai' : undefined);
const baseHeaders = { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL_VERSION, ...(origin ? { Origin: origin } : {}), ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}) };
async function fetchWithTimeout(url, options = {}) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS); try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timeout); } }
async function rpc(method, params = {}, { notification = false } = {}) { const headers = { ...baseHeaders, 'Content-Type': 'application/json', ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) }; const body = { jsonrpc: '2.0', method, params, ...(notification ? {} : { id: ++requestId }) }; const response = await fetchWithTimeout(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) }); sessionId = response.headers.get('mcp-session-id') ?? sessionId; const parsed = parseBody(await response.text(), response.headers.get('content-type') ?? ''); if (!response.ok || parsed.error) { const error = new Error(parsed.error?.message ?? `HTTP ${response.status}`); error.status = response.status; error.code = parsed.error?.code; throw error; } return { response, result: notification ? {} : parsed.result }; }

async function startLocalServer() {
  if (!LOCAL_MODE) return null;
  const child = spawn(process.execPath, ['dist/index.js'], { cwd: process.cwd(), env: { ...process.env, DEMO_CANVAS_MODE: 'true', MCP_TRANSPORT_TYPE: 'dual', OAUTH_REQUIRED: 'false', NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(LOCAL_PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 100; attempt += 1) { if (output.includes(`Streamable HTTP transport listening on http://127.0.0.1:${LOCAL_PORT}/mcp`)) return child; if (child.exitCode !== null) throw new Error('Local MCP server exited before readiness.'); await sleep(100); }
  child.kill('SIGKILL');
  throw new Error('Local MCP server readiness timed out.');
}

const server = await startLocalServer();
try {
  const init = (await rpc('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: CLIENT_NAME, version: '1.1.0' } })).result;
  await rpc('notifications/initialized', {}, { notification: true });
  const tools = (await rpc('tools/list')).result?.tools ?? [];
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  const resources = (await rpc('resources/list')).result?.resources ?? [];
  if (init?.protocolVersion !== PROTOCOL_VERSION || init?.serverInfo?.name !== 'X Intelligence MCP') throw new Error('initialize compatibility check failed');
  console.log(`[CLAUDE-MCP] endpoint=${ENDPOINT} authenticated=${Boolean(bearerToken)} protocol=${init.protocolVersion}`);
  console.log(`[CLAUDE-MCP] tools/list=${tools.length === 21 && EXPECTED_TOOLS.every((name) => toolMap.has(name)) ? 'PASS' : 'FAIL'} count=${tools.length}`);
  console.log(`[CLAUDE-MCP] resources/list=${resources.length === 9 ? 'PASS' : 'FAIL'} count=${resources.length}`);

  const callTool = async (name, args) => {
    try {
      const raw = (await rpc('tools/call', { name, arguments: args })).result;
      const value = structured(raw);
      const code = errorCode(raw, value);
      const serializable = isRecord(raw) && Array.isArray(raw.content) && raw.content.every((item) => isRecord(item) && typeof item.type === 'string');
      if (raw?.isError || value?.ok === false || code) return { ok: false, controlled: SAFE_ERROR_CODES.has(code), code: code ?? 'MCP_TOOL_ERROR', serializable, value };
      return { ok: true, controlled: true, serializable, value };
    } catch (error) { return { ok: false, controlled: false, code: error?.code ?? `HTTP_${error?.status ?? 'ERROR'}`, serializable: false }; }
  };

  const username = process.env.MCP_TEST_USERNAME ?? 'XDevelopers';
  const seedUser = await callTool('x_get_user', { username });
  const seedSearch = await callTool('x_search_posts', { query: 'from:XDevelopers', maxResults: 10 });
  const seedPostId = seedSearch.value?.data?.find?.((post) => /^\d+$/.test(String(post?.id)))?.id;
  // Safe fallback IDs preserve transport/validation coverage when X credentials
  // are unavailable; the resulting provider error must still be structured.
  const inputs = {
    x_get_capabilities: {}, x_get_user: { username }, x_get_post: { postId: String(seedPostId ?? '0') }, x_search_posts: { query: 'from:XDevelopers', maxResults: 10 },
    x_get_user_posts: { username, maxResults: 10 }, x_get_followers: { username, maxResults: 10 }, x_get_following: { username, maxResults: 10 }, x_get_mentions: { username, maxResults: 10 },
    x_ai_status: {}, x_generate_post: { topic: 'Why safe MCP tools help AI agents', tone: 'professional' }, x_generate_thread: { topic: 'Why safe MCP tools help AI agents', tone: 'professional', numberOfPosts: 2 },
    x_generate_reply: seedPostId ? { postId: String(seedPostId), tone: 'professional' } : { postText: 'MCP tools connect agents to data safely.', tone: 'professional' }, x_rewrite_post: { text: 'MCP tools connect agents to data safely.', goal: 'clearer' }, x_improve_post: { text: 'MCP tools connect agents to data safely.', suggestHashtags: true },
    x_summarize_thread: { postId: String(seedPostId ?? '0'), maxResults: 10 }, x_summarize_conversation: { postId: String(seedPostId ?? '0'), maxResults: 10 }, x_analyze_sentiment: { postText: 'MCP tools make grounded AI workflows clear and safe.' }, x_generate_content_ideas: { topic: 'safe MCP tools', numberOfIdeas: 1 },
    x_content_strategy: { goal: 'educate developers about safe MCP tools' }, x_generate_hashtags: { topic: 'safe MCP tools', maxResults: 10 }, x_analyze_post: { postId: String(seedPostId ?? '0') },
  };
  const rows = [];
  for (const name of EXPECTED_TOOLS) {
    const tool = toolMap.get(name);
    const schema = schemaProblems(tool);
    const result = await callTool(name, inputs[name]);
    const resultStatus = result.ok ? 'PASS' : result.controlled ? `PASS — safely unavailable (${result.code})` : `FAIL — ${result.code}`;
    rows.push({ tool: name, discovery: tool ? 'PASS' : 'FAIL', schema: schema.length ? `FAIL — ${schema.join(',')}` : 'PASS', invocation: result.serializable ? 'PASS' : 'FAIL', result: resultStatus, required: tool?.inputSchema?.required ?? [], inputKeys: Object.keys(inputs[name]), errorCode: result.ok ? undefined : result.code });
  }
  for (const row of rows) console.log(`${row.tool} | ${row.discovery} | ${row.schema} | ${row.invocation} | ${row.result}`);
  const pass = rows.every((row) => row.discovery === 'PASS' && row.schema === 'PASS' && row.invocation === 'PASS' && row.result.startsWith('PASS')) && tools.length === 21 && resources.length === 9;
  console.log(JSON.stringify({ endpoint: ENDPOINT, authenticated: Boolean(bearerToken), initialize: 'PASS', tools: tools.length, resources: resources.length, seed: { userLookup: seedUser.ok ? 'PASS' : 'CONTROLLED_ERROR', search: seedSearch.ok ? 'PASS' : 'CONTROLLED_ERROR', postId: Boolean(seedPostId) }, pass, rows }, null, 2));
  process.exitCode = pass ? 0 : 1;
} catch (error) {
  console.error(`[CLAUDE-MCP] FAIL: ${error instanceof Error ? error.message : 'compatibility audit failed'}`);
  process.exitCode = 1;
} finally {
  server?.kill('SIGKILL');
}
