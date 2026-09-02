import { runRemoteMcpDiagnostics } from './remote-mcp-diagnostics.mjs';

const result = await runRemoteMcpDiagnostics({ clientName: 'generic-mcp-client' });
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.overall === 'PASS' ? 0 : 1;
