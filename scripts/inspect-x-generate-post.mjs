import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, DEMO_CANVAS_MODE: 'true', PORT: '3299', HOST: '127.0.0.1', NODE_ENV: 'development', MCP_TRANSPORT_TYPE: 'dual', OAUTH_REQUIRED: 'false' },
  stdio: ['pipe', 'pipe', 'ignore'],
});

let buffer = '';
let id = 0;
const pending = new Map();
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error('MCP request failed.'));
      else waiter.resolve(message.result);
    } catch {
      // Ignore non-protocol output; diagnostics never echo child logs.
    }
  }
});

function rpc(method, params = {}, timeoutMs = 10_000) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error('MCP request timed out.')); }, timeoutMs);
    pending.set(requestId, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
  });
}

function sanitize(value, depth = 0) {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 1000) : value;
  const blocked = /token|secret|authorization|bearer|api[_-]?key|verifier|oauth.?code|private.?key/i;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.test(key)).map(([key, child]) => [key, sanitize(child, depth + 1)]));
}

try {
  let initialized = false;
  for (let attempt = 0; attempt < 80 && !initialized; attempt += 1) {
    try {
      await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x-generate-post-diagnostic', version: '1.0.0' } }, 2_000);
      initialized = true;
    } catch (error) {
      if (attempt === 79) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  const result = await rpc('tools/call', { name: 'x_generate_post', arguments: { topic: 'Why MCP servers are important for AI agents', tone: 'clear and useful' } }, 60_000);
  console.log(JSON.stringify(sanitize({ provider: 'groq', tool: 'x_generate_post', result }), null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, code: 'MCP_DIAGNOSTIC_FAILED', message: error instanceof Error ? error.message : 'Diagnostic failed.' }, null, 2));
  process.exitCode = 1;
} finally {
  child.kill('SIGKILL');
}
