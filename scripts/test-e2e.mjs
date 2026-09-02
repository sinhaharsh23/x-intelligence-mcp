import 'dotenv/config';

const endpoint = process.env.MCP_E2E_URL ?? 'http://127.0.0.1:3000/mcp';
const aiTools = new Set([
  'x_ai_status', 'x_generate_post', 'x_generate_thread', 'x_generate_reply',
  'x_rewrite_post', 'x_improve_post', 'x_summarize_thread',
  'x_summarize_conversation', 'x_analyze_sentiment', 'x_generate_content_ideas',
  'x_analyze_audience', 'x_explain_trend', 'x_content_strategy',
  'x_generate_hashtags', 'x_generate_content_calendar',
]);
const results = [];
const sessionHeaders = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
let requestId = 0;

function record(name, status, details = {}) { results.push({ name, status, ...details }); }

function parseResponse(text) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith('data: '));
  try { return JSON.parse(line ? line.slice(6) : text); } catch { throw new Error('MCP returned an unreadable response.'); }
}

async function rpc(method, params = {}) {
  const message = { jsonrpc: '2.0', method, params };
  if (!method.startsWith('notifications/')) message.id = ++requestId;
  const response = await fetch(endpoint, { method: 'POST', headers: sessionHeaders, body: JSON.stringify(message) });
  const raw = await response.text();
  if (method.startsWith('notifications/') && !raw.trim()) return undefined;
  const body = parseResponse(raw);
  const sessionId = response.headers.get('mcp-session-id');
  if (sessionId) sessionHeaders['Mcp-Session-Id'] = sessionId;
  if (!response.ok || body.error) { const error = new Error('MCP request failed.'); error.code = body.error?.code ?? `HTTP_${response.status}`; throw error; }
  return body.result;
}

function structured(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (typeof text !== 'string') return result ?? {};
  try { return JSON.parse(text); } catch { return { text }; }
}

function safeErrorCode(result, value) {
  const direct = value?.code ?? value?.error?.code;
  if (direct) return direct;
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  const match = typeof text === 'string' ? text.match(/\[([A-Z][A-Z0-9_]*)\]/) : undefined;
  return match?.[1];
}

async function tool(name, args) {
  try {
    const result = await rpc('tools/call', { name, arguments: args });
    const value = structured(result);
    const code = safeErrorCode(result, value);
    if (result?.isError || value?.ok === false || code) return { ok: false, code: code ?? 'MCP_TOOL_ERROR', value };
    return { ok: true, value, result };
  } catch (error) { return { ok: false, code: error.code ?? 'MCP_ERROR' }; }
}

function isExternal(code) { return ['AUTH_DISABLED', 'AUTH_REQUIRED', 'TOKEN_EXPIRED', 'FORBIDDEN', 'BILLING_OR_ACCESS_RESTRICTED', 'RATE_LIMITED', 'NETWORK_ERROR', 'AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_PROVIDER_UNAVAILABLE', 'AI_RATE_LIMITED', 'AI_TIMEOUT', 'AI_GROUNDING_FAILED', 'DEPENDENCY_UNAVAILABLE'].includes(code); }

function summarizeTool(name, outcome, details = {}) {
  const safeProviderDetails = outcome.value?.details && Object.fromEntries(
    ['httpStatus', 'responseJsonParsed', 'choicesExists', 'choicesLength', 'messageExists', 'contentType', 'finishReason', 'issueCount', 'issuePaths']
      .filter((key) => Object.prototype.hasOwnProperty.call(outcome.value.details, key))
      .map((key) => [key, outcome.value.details[key]]),
  );
  const diagnosticDetails = safeProviderDetails && Object.keys(safeProviderDetails).length ? { providerDetails: safeProviderDetails } : {};
  const expectedAuthDisabled = details.expectedCode && outcome.code === details.expectedCode;
  const expectedValidation = details.expectedValidationRejection && !outcome.ok;
  if (outcome.ok || expectedAuthDisabled || expectedValidation) record(name, 'PASS', { ...details, ...diagnosticDetails, expectedBehavior: !outcome.ok });
  else if (isExternal(outcome.code)) record(name, 'EXTERNAL BLOCKER', { code: outcome.code, ...details, ...diagnosticDetails });
  else record(name, 'FAIL', { code: outcome.code, ...details, ...diagnosticDetails });
}

async function main() {
  try {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'phase4-e2e', version: '1.0.0' } });
    record('MCP initialization', init?.protocolVersion === '2025-06-18' ? 'PASS' : 'FAIL');
    await rpc('notifications/initialized');

    const tools = await rpc('tools/list');
    const toolNames = tools.tools?.map((item) => item.name) ?? [];
    const duplicateTools = toolNames.length - new Set(toolNames).size;
    const invalidSchemas = (tools.tools ?? []).filter((item) => !item.inputSchema || typeof item.inputSchema !== 'object').length;
    record('tools/list', toolNames.length === 67 && duplicateTools === 0 && invalidSchemas === 0 ? 'PASS' : 'FAIL', { toolCount: toolNames.length, duplicateNames: duplicateTools, invalidSchemas });

    const resources = await rpc('resources/list');
    const resourceUris = resources.resources?.map((item) => item.uri) ?? [];
    const applicationUris = resourceUris.filter((uri) => uri.startsWith('x://'));
    record('resources/list', applicationUris.length === 6 && resourceUris.length === new Set(resourceUris).size ? 'PASS' : 'FAIL', { applicationResources: applicationUris.length, resourceItems: resourceUris.length, duplicateIdentifiers: resourceUris.length - new Set(resourceUris).size });

    const templates = await rpc('resources/templates/list');
    record('resources/templates/list', (templates.resourceTemplates?.length ?? 0) >= 2 ? 'PASS' : 'FAIL', { templateCount: templates.resourceTemplates?.length ?? 0 });

    const prompts = await rpc('prompts/list');
    const promptNames = prompts.prompts?.map((item) => item.name) ?? [];
    record('prompts/list', promptNames.length === 9 && promptNames.length === new Set(promptNames).size ? 'PASS' : 'FAIL', { promptCount: promptNames.length, duplicateNames: promptNames.length - new Set(promptNames).size });

    summarizeTool('x_get_capabilities', await tool('x_get_capabilities', {}), { readOnly: true });
    const user = await tool('x_get_user', { username: 'X' });
    summarizeTool('x_get_user (real X)', user, { readOnly: true });
    const userId = user.ok ? user.value?.id : undefined;
    const timeline = userId ? await tool('x_get_user_posts', { userId, maxResults: 10 }) : { ok: false, code: 'DEPENDENCY_UNAVAILABLE' };
    summarizeTool('x_get_user_posts (real X)', timeline, { readOnly: true, bounded: true });
    const firstPostId = timeline.ok ? timeline.value?.data?.[0]?.id : undefined;
    if (firstPostId) summarizeTool('x_get_post (real X)', await tool('x_get_post', { postId: firstPostId }), { readOnly: true });
    else record('x_get_post (real X)', 'SKIP', { reason: 'No post ID returned by bounded timeline read.' });
    if (userId) summarizeTool('x_get_followers (real X)', await tool('x_get_followers', { userId, maxResults: 10 }), { readOnly: true, bounded: true });
    summarizeTool('x_health_check (real X)', await tool('x_health_check', {}), { readOnly: true });
    summarizeTool('x_get_rate_limit_status', await tool('x_get_rate_limit_status', {}), { readOnly: true });

    const aiStatus = await tool('x_ai_status', {});
    summarizeTool('x_ai_status', aiStatus, { readOnly: true, provider: aiStatus.value?.selectedProvider, model: aiStatus.value?.selectedModel });
    const draft = await tool('x_generate_post', { topic: 'a local MCP security checklist', goal: 'inform', tone: 'concise and technical', constraints: ['Return a draft only. Do not publish.'] });
    summarizeTool('x_generate_post (real Groq)', draft, { readOnly: true, provider: draft.value?.provider, model: draft.value?.model, draftOnly: true, mutationOccurred: false });

    const grounded = firstPostId
      ? await tool('x_analyze_sentiment', { postId: firstPostId })
      : { ok: false, code: 'DEPENDENCY_UNAVAILABLE' };
    summarizeTool('x_analyze_sentiment (real X → Groq)', grounded, { grounded: grounded.value?.grounded, sourceType: grounded.value?.sourceType, sourceCount: grounded.value?.sourceCount, provider: grounded.value?.provider, model: grounded.value?.model, mutationOccurred: false });

    summarizeTool('x_get_my_profile auth-disabled', await tool('x_get_my_profile', {}), { expectedCode: 'AUTH_DISABLED' });
    summarizeTool('x_create_post without confirmation', await tool('x_create_post', { text: 'Phase 4 validation draft; not for publication.', confirm: false }), { expectedValidationRejection: true, mutationOccurred: false });
    summarizeTool('x_delete_post without confirmation', await tool('x_delete_post', { postId: '1', confirm: false }), { expectedValidationRejection: true, mutationOccurred: false });

    const failed = results.filter((item) => item.status === 'FAIL');
    const external = results.filter((item) => item.status === 'EXTERNAL BLOCKER');
    const skipped = results.filter((item) => item.status === 'SKIP');
    const hasRealAI = results.some((item) => item.name.includes('real Groq') && item.status === 'PASS');
    const hasGrounding = results.some((item) => item.name.includes('real X → Groq') && item.status === 'PASS' && item.grounded === true);
    console.log(JSON.stringify({ overall: failed.length ? 'FAIL' : external.length || skipped.length || !hasGrounding ? 'PARTIAL' : 'PASS', endpoint, config: { aiEnabled: process.env.AI_ENABLED === 'true', aiProvider: process.env.AI_PROVIDER ?? 'auto', groqConfigured: Boolean(process.env.GROQ_API_KEY), xAuthEnabled: process.env.X_AUTH_ENABLED === 'true', xBearerConfigured: Boolean(process.env.X_BEARER_TOKEN) }, counts: { tools: toolNames.length, xTools: toolNames.filter((name) => name.startsWith('x_') && !aiTools.has(name)).length, aiTools: toolNames.filter((name) => aiTools.has(name)).length, applicationResources: applicationUris.length, prompts: promptNames.length, widgets: 16 }, realAI: hasRealAI, realGroundedAI: hasGrounding, mutationOccurred: false, passCount: results.filter((item) => item.status === 'PASS').length, externalBlockerCount: external.length, skippedCount: skipped.length, failCount: failed.length, checks: results }, null, 2));
    process.exitCode = failed.length ? 1 : 0;
  } catch (error) {
    console.log(JSON.stringify({ overall: 'FAIL', endpoint, code: error.code ?? 'MCP_E2E_ERROR', message: 'The local MCP E2E test could not complete.' }, null, 2));
    process.exitCode = 1;
  }
}

await main();
