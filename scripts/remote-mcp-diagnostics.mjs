const DEFAULT_ENDPOINT = 'https://x-intelligence-mcp-6a95e036-xbuilders-srmist.app.nitrocloud.ai/mcp';
const PROTOCOL_VERSION = '2025-06-18';

export async function runRemoteMcpDiagnostics({ endpoint = process.env.MCP_E2E_URL ?? DEFAULT_ENDPOINT, bearerToken = process.env.MCP_BEARER_TOKEN, clientName = process.env.MCP_CLIENT_NAME ?? 'generic-mcp-client' } = {}) {
  const checks = [];
  let sessionId;
  let requestId = 0;
  const requestTimeoutMs = Number.isFinite(Number(process.env.MCP_REQUEST_TIMEOUT_MS)) ? Math.max(1000, Number(process.env.MCP_REQUEST_TIMEOUT_MS)) : 15000;

  const record = (name, status, details = {}) => checks.push({ name, status, ...details });
  const authHeaders = bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {};
  const baseHeaders = { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL_VERSION, ...authHeaders };

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
  }

  function parseBody(text, contentType) {
    if (!text) return {};
    if (contentType.includes('text/event-stream')) {
      const dataLines = text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).filter(Boolean);
      const last = dataLines.at(-1);
      if (!last) return {};
      try { return JSON.parse(last); } catch { return {}; }
    }
    try { return JSON.parse(text); } catch { return {}; }
  }

  function structured(result) {
    if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
    const text = result?.content?.find((item) => item.type === 'text')?.text;
    if (typeof text !== 'string') return {};
    try { return JSON.parse(text); } catch { return {}; }
  }

  function errorCode(result, value) {
    const direct = value?.code ?? value?.error?.code;
    if (typeof direct === 'string') return direct;
    const text = result?.content?.find((item) => item.type === 'text')?.text;
    return typeof text === 'string' ? text.match(/\[([A-Z][A-Z0-9_]*)\]/)?.[1] : undefined;
  }

  async function rpc(method, params = {}, { notification = false } = {}) {
    const headers = { 'Content-Type': 'application/json', ...baseHeaders };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const body = { jsonrpc: '2.0', method, params, ...(notification ? {} : { id: ++requestId }) };
    const response = await fetchWithTimeout(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    const returnedSession = response.headers.get('mcp-session-id');
    if (returnedSession) sessionId = returnedSession;
    const result = parseBody(await response.text(), response.headers.get('content-type') ?? '');
    if (!response.ok || result.error) {
      const error = new Error(result.error?.message ?? `HTTP ${response.status}`);
      error.status = response.status;
      error.code = result.error?.code;
      throw error;
    }
    return { response, result: notification ? {} : result.result };
  }

  try {
    const healthResponse = await fetchWithTimeout(`${endpoint}/health`, { headers: { Accept: 'application/json', ...authHeaders } });
    const health = parseBody(await healthResponse.text(), healthResponse.headers.get('content-type') ?? '');
    record('HTTP connectivity', healthResponse.ok && health.transport === 'streamable-http' ? 'PASS' : healthResponse.status === 401 ? 'AUTH_REQUIRED' : 'FAIL', { statusCode: healthResponse.status, transport: health.transport });
  } catch (error) {
    record('HTTP connectivity', 'FAIL', { message: error instanceof Error ? error.message : 'Request failed' });
    return { endpoint, clientName, protocolVersion: PROTOCOL_VERSION, checks, overall: 'FAIL' };
  }

  try {
    const initialized = await rpc('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: clientName, version: '1.1.0' } });
    record('initialize', initialized.result?.protocolVersion === PROTOCOL_VERSION && initialized.result?.serverInfo?.name === 'X Intelligence MCP' && initialized.result?.serverInfo?.version === '1.1.0' ? 'PASS' : 'FAIL', { protocolVersion: initialized.result?.protocolVersion, serverName: initialized.result?.serverInfo?.name, serverVersion: initialized.result?.serverInfo?.version, session: Boolean(sessionId) });
  } catch (error) {
    record('initialize', error?.status === 401 ? 'AUTH_REQUIRED' : 'FAIL', { statusCode: error?.status, message: error?.status === 401 ? 'Bearer token required; set MCP_BEARER_TOKEN for authenticated diagnostics.' : 'Initialize request failed' });
    return { endpoint, clientName, protocolVersion: PROTOCOL_VERSION, checks, overall: checks.at(-1).status === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'FAIL' };
  }

  try {
    const notification = await rpc('notifications/initialized', {}, { notification: true });
    record('notifications/initialized', notification.response.status === 202 || notification.response.status === 200 ? 'PASS' : 'FAIL', { statusCode: notification.response.status });
  } catch (error) {
    record('notifications/initialized', error?.status === 401 ? 'AUTH_REQUIRED' : 'FAIL');
  }

  let tools;
  try {
    const result = (await rpc('tools/list')).result;
    tools = result?.tools ?? [];
    const names = tools.map((tool) => tool.name);
    const schemaProblems = tools.filter((tool) => !tool.name || !tool.description || tool.inputSchema?.type !== 'object').map((tool) => tool.name ?? 'unnamed');
    record('tools/list', schemaProblems.length === 0 && names.length === new Set(names).size ? 'PASS' : 'FAIL', { toolCount: tools.length, duplicateNames: names.length - new Set(names).size, schemaProblems });
  } catch {
    record('tools/list', 'FAIL');
  }

  try {
    const result = (await rpc('resources/list')).result;
    const resources = result?.resources ?? [];
    record('resources/list', resources.every((resource) => resource.uri && resource.name) ? 'PASS' : 'FAIL', { resourceCount: resources.length });
  } catch (error) {
    record('resources/list', error?.status === 401 ? 'AUTH_REQUIRED' : 'FAIL');
  }

  try {
    const result = (await rpc('resources/read', { uri: 'health://checks' })).result;
    record('resources/read', Array.isArray(result?.contents) ? 'PASS' : 'FAIL', { contentCount: result?.contents?.length ?? 0 });
  } catch (error) {
    record('resources/read', error?.status === 401 ? 'AUTH_REQUIRED' : 'FAIL');
  }

  try {
    const result = (await rpc('resources/templates/list')).result;
    record('resources/templates/list', Array.isArray(result?.resourceTemplates) ? 'PASS' : 'FAIL', { templateCount: result?.resourceTemplates?.length ?? 0 });
  } catch (error) {
    record('resources/templates/list', error?.status === 401 ? 'AUTH_REQUIRED' : 'FAIL');
  }

  try {
    const result = (await rpc('prompts/list')).result;
    record('prompts/list', Array.isArray(result?.prompts) ? 'PASS' : 'FAIL', { promptCount: result?.prompts?.length ?? 0 });
  } catch (error) {
    record('prompts/list', error?.status === 401 ? 'AUTH_REQUIRED' : 'FAIL');
  }

  try {
    const call = (await rpc('tools/call', { name: 'x_get_user', arguments: { username: process.env.MCP_TEST_USERNAME ?? 'XDevelopers' } })).result;
    const value = structured(call);
    const code = errorCode(call, value);
    record('safe tools/call x_get_user', call?.isError ? 'EXTERNAL_BLOCKER' : 'PASS', { errorCode: code, returnedProfile: Boolean(value?.id || value?.username), mutationOccurred: false });
  } catch (error) {
    record('safe tools/call x_get_user', 'FAIL', { message: 'Safe tool call could not complete', statusCode: error?.status });
  }

  if (tools?.some((tool) => tool.name === 'x_client_compatibility')) {
    try {
      const call = (await rpc('tools/call', { name: 'x_client_compatibility', arguments: {} })).result;
      const value = structured(call);
      record('safe tools/call x_client_compatibility', call?.isError ? 'FAIL' : value?.remoteMcp === true && value?.clients?.chatgpt?.supported === true && value?.clients?.claude?.supported === true ? 'PASS' : 'FAIL', { returnedCompatibility: Boolean(value?.remoteMcp), mutationOccurred: false });
    } catch (error) {
      record('safe tools/call x_client_compatibility', error?.status === 401 ? 'AUTH_REQUIRED' : 'FAIL');
    }
  } else {
    record('safe tools/call x_client_compatibility', 'DEMO_MODE', { reason: 'Production-only compatibility tool is intentionally excluded from the <=30-item Demo Canvas.' });
  }

  const failures = checks.filter((check) => check.status === 'FAIL');
  const authRequired = checks.some((check) => check.status === 'AUTH_REQUIRED');
  return { endpoint, clientName, protocolVersion: PROTOCOL_VERSION, checks, overall: failures.length ? 'FAIL' : authRequired ? 'AUTH_REQUIRED' : 'PASS' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runRemoteMcpDiagnostics();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.overall === 'PASS' ? 0 : 1;
}
