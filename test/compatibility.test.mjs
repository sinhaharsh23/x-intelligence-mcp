import assert from 'node:assert/strict';
import test from 'node:test';
import { MCP_SERVER_DESCRIPTION, MCP_SERVER_NAME, MCP_SERVER_VERSION, safeAuthenticationDescription, selectedCompatibilityProvider } from '../dist/common/compatibility.js';

test('multi-client metadata is stable and safe', () => {
  assert.equal(MCP_SERVER_NAME, 'X Intelligence MCP');
  assert.equal(MCP_SERVER_VERSION, '1.1.0');
  assert.match(MCP_SERVER_DESCRIPTION, /official|grounded|X data/i);
  const config = { AI_PROVIDER: 'auto', OPENAI_API_KEY: undefined, GROQ_API_KEY: 'configured', GEMINI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined, OAUTH_REQUIRED: 'true' };
  assert.equal(selectedCompatibilityProvider(config), 'groq');
  assert.match(safeAuthenticationDescription(config), /required/i);
});

test('compatibility metadata does not expose credential values', () => {
  const config = { AI_PROVIDER: 'auto', OPENAI_API_KEY: 'openai-secret', GROQ_API_KEY: 'groq-secret', GEMINI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined, OAUTH_REQUIRED: 'false' };
  const output = JSON.stringify({ provider: selectedCompatibilityProvider(config), auth: safeAuthenticationDescription(config) });
  assert.doesNotMatch(output, /secret/i);
  assert.equal(selectedCompatibilityProvider(config), 'openai');
});
