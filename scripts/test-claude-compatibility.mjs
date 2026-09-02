import { runRemoteMcpDiagnostics } from './remote-mcp-diagnostics.mjs';

const result = await runRemoteMcpDiagnostics({ clientName: 'claude-custom-connector' });
const check = (name) => result.checks.find((item) => item.name === name);
const list = check('tools/list');
const resources = check('resources/list');
const user = check('safe tools/call x_get_user');
console.log(`[CLAUDE-MCP-1] OAuth authenticated: ${process.env.MCP_BEARER_TOKEN ? 'token supplied (redacted)' : 'token not supplied'}`);
console.log(`[CLAUDE-MCP-2] initialize received: ${check('initialize')?.status ?? 'NOT_RUN'}`);
console.log(`[CLAUDE-MCP-3] initialize response: ${check('initialize')?.protocolVersion ?? 'NOT_RUN'}`);
console.log(`[CLAUDE-MCP-4] initialized notification received: ${check('notifications/initialized')?.status ?? 'NOT_RUN'}`);
console.log(`[CLAUDE-MCP-5] tools/list received: ${list?.status ?? 'NOT_RUN'}`);
console.log(`[CLAUDE-MCP-6] number of tools returned: ${list?.toolCount ?? 0}`);
console.log(`[CLAUDE-MCP-7] first tool names: ${JSON.stringify(list?.firstToolNames ?? [])}`);
console.log(`[CLAUDE-MCP-8] resources/list count: ${resources?.resourceCount ?? 0}`);
console.log(`[CLAUDE-MCP-9] x_get_user call result: ${user?.status ?? 'NOT_RUN'}`);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.overall === 'PASS' ? 0 : 1;
