import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import 'dotenv/config';

const envNames = [
  'AI_ENABLED', 'AI_PROVIDER', 'GROQ_API_KEY', 'GROQ_MODEL',
  'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY',
];
const savedEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

for (const name of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY']) delete process.env[name];
process.env.GROQ_API_KEY = 'test-groq-key';
process.env.GROQ_MODEL = 'openai/gpt-oss-20b';
process.env.AI_ENABLED = 'true';
process.env.AI_PROVIDER = 'groq';

const [{ GroqProvider }, { AIRegistry }, { AIService }, { GroundingService }, { AIIntelligenceError }, config] = await Promise.all([
  import('../dist/modules/ai/providers/groq.provider.js'),
  import('../dist/modules/ai/ai.registry.js'),
  import('../dist/modules/ai/ai.service.js'),
  import('../dist/modules/ai/grounding/grounding.service.js'),
  import('../dist/modules/ai/ai.errors.js'),
  import('../dist/common/config/env.js'),
]);

const originalFetch = globalThis.fetch;
const request = { systemPrompt: 'system', userPrompt: 'return json', maxOutputTokens: 16 };

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function restoreEnv() {
  for (const name of envNames) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  globalThis.fetch = originalFetch;
  config.resetConfigForTests();
}

test.after(restoreEnv);

test('Groq config detection and explicit registry selection work', () => {
  config.resetConfigForTests();
  const provider = new GroqProvider();
  assert.equal(provider.isConfigured(), true);
  assert.equal(provider.model, 'openai/gpt-oss-20b');
  assert.equal(new AIRegistry().selected().id, 'groq');
});

test('auto selection prioritizes Groq after OpenAI and before Gemini/Anthropic', () => {
  process.env.AI_PROVIDER = 'auto';
  config.resetConfigForTests();
  assert.equal(new AIRegistry().selected().id, 'groq');
  assert.deepEqual(new AIRegistry().list().map((provider) => provider.id), ['openai', 'groq', 'gemini', 'anthropic']);
});

test('Groq normalizes Chat Completions output and uses the current REST contract', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return response({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] });
  };
  config.resetConfigForTests();
  const result = await new GroqProvider().generate(request);
  const body = JSON.parse(captured.init.body);
  assert.equal(result.text, 'OK');
  assert.equal(captured.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.Authorization.startsWith('Bearer '), true);
  assert.deepEqual(body.messages, [{ role: 'system', content: 'system' }, { role: 'user', content: 'return json' }]);
  assert.equal(body.model, 'openai/gpt-oss-20b');
  assert.equal(body.max_completion_tokens, 2048);
  assert.equal(body.reasoning_effort, 'low');
  assert.deepEqual(body.response_format, { type: 'json_object' });
});

test('Groq rate-limit and authentication responses map to safe normalized errors', async () => {
  for (const [status, code] of [[429, 'AI_RATE_LIMITED'], [401, 'AI_PROVIDER_AUTH_ERROR']]) {
    globalThis.fetch = async () => response({ error: { message: 'safe provider error' } }, status);
    config.resetConfigForTests();
    await assert.rejects(() => new GroqProvider().generate(request), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.details.httpStatus, status);
      assert.doesNotMatch(error.message, /test-groq-key/);
      return true;
    });
  }
});

test('Groq oversized requests map to context-limit errors', async () => {
  globalThis.fetch = async () => response({ error: { message: 'request too large' } }, 413);
  config.resetConfigForTests();
  await assert.rejects(() => new GroqProvider().generate(request), (error) => error.code === 'AI_CONTEXT_TOO_LARGE' && error.details.httpStatus === 413);
});

test('Groq timeout is normalized without leaking request details', async () => {
  globalThis.fetch = async () => { throw new DOMException('aborted', 'AbortError'); };
  config.resetConfigForTests();
  await assert.rejects(() => new GroqProvider().generate(request), (error) => error.code === 'AI_TIMEOUT');
});

test('malformed Groq output is rejected as a structured-response error', async () => {
  globalThis.fetch = async () => response({ choices: [{ message: { role: 'assistant' }, finish_reason: 'stop' }] });
  config.resetConfigForTests();
  await assert.rejects(() => new GroqProvider().generate(request), (error) => error.code === 'AI_BAD_RESPONSE');

  globalThis.fetch = async () => response({ choices: [{ message: { role: 'assistant', content: 'not json' } }] });
  await assert.rejects(() => new GroqProvider().generateStructured(request, z.object({ ok: z.boolean() })), (error) => error.code === 'AI_RESPONSE_INVALID');
});

test('auto fallback proceeds after a Groq technical error', async () => {
  process.env.AI_PROVIDER = 'auto';
  config.resetConfigForTests();
  let fallbackCalled = false;
  const groq = { id: 'groq', model: 'groq-model', isConfigured: () => true, healthCheck: async () => ({ id: 'groq', configured: true, available: true, model: 'groq-model' }), generateStructured: async () => { throw new AIIntelligenceError('AI_RATE_LIMITED', 'limited', true); } };
  const gemini = { id: 'gemini', model: 'gemini-model', isConfigured: () => true, healthCheck: async () => ({ id: 'gemini', configured: true, available: true, model: 'gemini-model' }), generateStructured: async () => { fallbackCalled = true; return { value: { draft: 'safe draft' }, result: { provider: 'gemini', model: 'gemini-model', text: '{}', durationMs: 1 } }; } };
  const service = new AIService({ configured: () => [groq, gemini], selected: () => groq, selectionMode: () => 'auto', health: async () => [] }, new GroundingService());
  const result = await service.run({ task: 'draft', instructions: 'return a draft', schema: z.object({ draft: z.string() }), sources: [{ sourceType: 'user_input', label: 'brief', data: 'hello' }] });
  assert.equal(result.draft, 'safe draft');
  assert.equal(fallbackCalled, true);
});

test('AI service does not fallback after a Groq safety refusal', async () => {
  process.env.AI_PROVIDER = 'auto';
  config.resetConfigForTests();
  let fallbackCalled = false;
  const groq = { id: 'groq', model: 'groq-model', isConfigured: () => true, healthCheck: async () => ({ id: 'groq', configured: true, available: true, model: 'groq-model' }), generateStructured: async () => { throw new AIIntelligenceError('AI_SAFETY_REFUSAL', 'refused', false); } };
  const other = { id: 'anthropic', model: 'other-model', isConfigured: () => true, healthCheck: async () => ({ id: 'anthropic', configured: true, available: true, model: 'other-model' }), generateStructured: async () => { fallbackCalled = true; return { value: { draft: 'unexpected' }, result: { provider: 'anthropic', model: 'other-model', text: '{}', durationMs: 1 } }; } };
  const service = new AIService({ configured: () => [groq, other], selected: () => groq, selectionMode: () => 'auto', health: async () => [] }, new GroundingService());
  const result = await service.run({ task: 'draft', instructions: 'return a draft', schema: z.object({ draft: z.string() }), sources: [{ sourceType: 'user_input', label: 'brief', data: 'hello' }] });
  assert.equal(result.code, 'AI_SAFETY_REFUSAL');
  assert.equal(fallbackCalled, false);
});

test('AI-disabled behavior remains unchanged and status does not expose keys', async () => {
  process.env.AI_ENABLED = 'false';
  process.env.AI_PROVIDER = 'groq';
  config.resetConfigForTests();
  const disabled = await new AIService({ configured: () => [], selected: () => undefined, selectionMode: () => 'groq', health: async () => [] }, new GroundingService()).run({ task: 'draft', instructions: 'test', schema: z.object({ draft: z.string() }), sources: [{ sourceType: 'user_input', label: 'brief', data: 'hello' }] });
  assert.equal(disabled.code, 'AI_DISABLED');
  const status = JSON.stringify(await new AIRegistry().health());
  assert.doesNotMatch(status, /test-groq-key/);
});
