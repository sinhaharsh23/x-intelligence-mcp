import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeToolsListResponse, toStandardMcpTool } from '../dist/common/mcp-tool-compatibility.js';

test('remote tool objects keep standard fields and remove legacy top-level widget fields', () => {
  const input = {
    name: 'x_get_user',
    description: 'Look up a user.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    _meta: { 'openai/outputTemplate': 'ui://widget/next-account-profile.html' },
    widget: { route: 'account-profile' },
    outputTemplate: 'ui://widget/next-account-profile.html',
  };
  assert.deepEqual(toStandardMcpTool(input), {
    name: input.name,
    description: input.description,
    inputSchema: input.inputSchema,
    _meta: input._meta,
  });
});

test('JSON and SSE tools/list responses are sanitized without changing tool count', () => {
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    result: { tools: [{ name: 'x_ai_status', description: 'Status', inputSchema: { type: 'object' }, widget: { route: 'system-status' } }] },
  };
  for (const body of [JSON.stringify(payload), `event: message\ndata: ${JSON.stringify(payload)}\n\n`]) {
    const sanitized = sanitizeToolsListResponse(body);
    assert.doesNotMatch(sanitized, /"widget"/);
    assert.match(sanitized, /x_ai_status/);
  }
});
