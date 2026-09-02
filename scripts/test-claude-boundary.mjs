import 'dotenv/config';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const MCP_PORT = 3460;
const INTROSPECTION_PORT = 3461;
const ENDPOINT = `http://127.0.0.1:${MCP_PORT}/mcp`;
const PROTOCOL_VERSION = '2025-06-18';
const TEST_AUDIENCE = 'https://mcp.example.test';
const TEST_ISSUER = 'https://x-intelligence-mcp.au.auth0.com/';

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function parseMcpBody(text, contentType) {
  if (!text) return {};
  if (contentType.includes('text/event-stream')) {
    const lines = text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).filter(Boolean);
    try { return JSON.parse(lines.at(-1) ?? '{}'); } catch { return {}; }
  }
  try { return JSON.parse(text); } catch { return {}; }
}

const introspectionServer = createServer(async (request, response) => {
  if (request.method !== 'POST') {
    response.writeHead(405).end();
    return;
  }
  for await (const _chunk of request) { /* consume the opaque token without logging it */ }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ active: true, aud: [TEST_AUDIENCE], iss: TEST_ISSUER, sub: 'claude-test', scope: 'read write offline_access' }));
});

await new Promise((resolve, reject) => {
  introspectionServer.once('error', reject);
  introspectionServer.listen(INTROSPECTION_PORT, '127.0.0.1', resolve);
});

const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '0.0.0.0',
    PORT: String(MCP_PORT),
    MCP_TRANSPORT_TYPE: 'dual',
    DEMO_CANVAS_MODE: 'true',
    OAUTH_REQUIRED: 'true',
    RESOURCE_URI: 'https://mcp.example.test',
    AUTH_SERVER_URL: 'https://x-intelligence-mcp.au.auth0.com/',
    TOKEN_AUDIENCE: TEST_AUDIENCE,
    TOKEN_ISSUER: TEST_ISSUER,
    INTROSPECTION_ENDPOINT: `http://127.0.0.1:${INTROSPECTION_PORT}/introspect`,
    INTROSPECTION_CLIENT_ID: 'claude-test-client',
    INTROSPECTION_CLIENT_SECRET: 'test-only-secret',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
child.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

let sessionId;
let requestId = 0;
async function rpc(method, params = {}, scheme = 'Bearer', notification = false) {
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    Origin: 'https://claude.ai',
    Authorization: `${scheme} test-token`,
    ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
  };
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++requestId }), method, params }),
  });
  sessionId = response.headers.get('mcp-session-id') ?? sessionId;
  const body = parseMcpBody(await response.text(), response.headers.get('content-type') ?? '');
  return { response, body };
}

try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverOutput.includes(`Streamable HTTP transport listening on http://0.0.0.0:${MCP_PORT}/mcp`)) break;
    if (child.exitCode !== null) throw new Error('local MCP server exited before readiness');
    await sleep(100);
    if (attempt === 99) throw new Error('local MCP server readiness timed out');
  }

  const initialize = await rpc('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'claude-web', version: 'test' } });
  if (!initialize.response.ok || initialize.body.result?.protocolVersion !== PROTOCOL_VERSION || !sessionId) throw new Error('Claude-style initialize failed');
  const initialized = await rpc('notifications/initialized', {}, 'Bearer', true);
  if (initialized.response.status !== 202 && initialized.response.status !== 200) throw new Error('Claude-style initialized notification failed');
  const listed = await rpc('tools/list');
  const tools = listed.body.result?.tools ?? [];
  if (listed.response.status !== 200 || tools.length !== 21) throw new Error(`Claude-style tools/list returned ${tools.length} tools`);

  // Auth middleware accepts this scheme, and the fixed tool guard must accept it too.
  // This reproduces the production failure boundary without using any real credential.
  const call = await rpc('tools/call', { name: 'x_get_capabilities', arguments: {} }, 'bearer');
  const callResult = call.body.result;
  if (call.response.status !== 200 || callResult?.isError || !Array.isArray(callResult?.content)) throw new Error('Claude-style tools/call did not reach a successful handler result');

  console.log(JSON.stringify({
    pass: true,
    origin: 'https://claude.ai',
    bearerScheme: 'lowercase accepted at HTTP and tool guard boundaries',
    initialize: initialize.body.result?.protocolVersion,
    session: Boolean(sessionId),
    tools: tools.length,
    toolCall: 'x_get_capabilities PASS',
  }, null, 2));
} finally {
  await new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 1000);
    child.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill('SIGTERM');
  });
  introspectionServer.close();
}
