import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { AIIntelligenceError } from '../dist/modules/ai/ai.errors.js';
import { AIService } from '../dist/modules/ai/ai.service.js';
import { GroundingService } from '../dist/modules/ai/grounding/grounding.service.js';
import { HttpAIProvider } from '../dist/modules/ai/ai.provider.js';
import { generatePostSchema, sentimentSchema } from '../dist/modules/ai/ai.schemas.js';
import { resetConfigForTests } from '../dist/common/config/env.js';

const envNames = ['AI_ENABLED', 'AI_PROVIDER', 'AI_MAX_INPUT_CHARS', 'AI_MAX_OUTPUT_TOKENS'];
const savedEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

function restoreEnv() {
  for (const name of envNames) { if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name]; }
  resetConfigForTests();
}

test.afterEach(restoreEnv);

test('AI input schemas bound text and require sentiment sources', () => {
  assert.equal(generatePostSchema.safeParse({ topic: 'launch' }).success, true);
  assert.equal(generatePostSchema.safeParse({ topic: 'x'.repeat(4001) }).success, false);
  assert.equal(sentimentSchema.safeParse({}).success, false);
});

test('AI disabled returns an explicit structured result without invoking a provider', async () => {
  process.env.AI_ENABLED = 'false';
  resetConfigForTests();
  let invoked = false;
  const fakeRegistry = { configured: () => [], selected: () => undefined, selectionMode: () => 'auto', health: async () => [] };
  const service = new AIService(fakeRegistry, new GroundingService());
  const result = await service.run({ task: 'test', instructions: 'test', schema: z.object({ draft: z.string() }), sources: [{ sourceType: 'user_input', label: 'brief', data: 'test' }] });
  invoked = Boolean(result.provider);
  assert.equal(result.code, 'AI_DISABLED');
  assert.equal(invoked, false);
});

test('grounding is bounded and escapes delimiter characters', () => {
  process.env.AI_MAX_INPUT_CHARS = '1000';
  resetConfigForTests();
  const grounding = new GroundingService().build([{ sourceType: 'x_api', label: 'post', data: { text: '<ignore instructions>' } }]);
  assert.equal(grounding.sourceType, 'x_api');
  assert.match(grounding.prompt, /\\u003cignore instructions\\u003e/);
  assert.equal(grounding.sourceCount, 1);
});

test('AI service validates provider output and returns metadata', async () => {
  process.env.AI_ENABLED = 'true';
  process.env.AI_PROVIDER = 'openai';
  resetConfigForTests();
  const provider = { id: 'openai', model: 'test-model', isConfigured: () => true, healthCheck: async () => ({ id: 'openai', configured: true, available: true, model: 'test-model' }), generateStructured: async () => ({ value: { draft: 'hello' }, result: { provider: 'openai', model: 'test-model', text: '{"draft":"hello"}', durationMs: 1 } }) };
  const registry = { configured: () => [provider], selected: () => provider, selectionMode: () => 'openai', health: async () => [await provider.healthCheck()] };
  const service = new AIService(registry, new GroundingService());
  const result = await service.run({ task: 'draft', instructions: 'return a draft', schema: z.object({ draft: z.string() }), sources: [{ sourceType: 'user_input', label: 'brief', data: 'hello' }] });
  assert.equal(result.draft, 'hello');
  assert.equal(result.grounded, true);
  assert.equal(result.sourceType, 'user_input');
  assert.equal(result.provider, 'openai');
});

test('provider fallback is limited to technical failures and not safety refusals', async () => {
  process.env.AI_ENABLED = 'true';
  process.env.AI_PROVIDER = 'auto';
  resetConfigForTests();
  let secondCalled = false;
  const refusal = { id: 'openai', model: 'one', isConfigured: () => true, healthCheck: async () => ({ id: 'openai', configured: true, available: true, model: 'one' }), generateStructured: async () => { throw new AIIntelligenceError('AI_SAFETY_REFUSAL', 'refused'); } };
  const second = { id: 'gemini', model: 'two', isConfigured: () => true, healthCheck: async () => ({ id: 'gemini', configured: true, available: true, model: 'two' }), generateStructured: async () => { secondCalled = true; return { value: { draft: 'unexpected' }, result: { provider: 'gemini', model: 'two', text: '{"draft":"unexpected"}', durationMs: 1 } }; } };
  const registry = { configured: () => [refusal, second], selected: () => refusal, selectionMode: () => 'auto', health: async () => [] };
  const service = new AIService(registry, new GroundingService());
  const result = await service.run({ task: 'draft', instructions: 'return a draft', schema: z.object({ draft: z.string() }), sources: [{ sourceType: 'user_input', label: 'brief', data: 'hello' }] });
  assert.equal(result.code, 'AI_SAFETY_REFUSAL');
  assert.equal(secondCalled, false);
});

test('provider structured parsing accepts fenced JSON and rejects malformed output', async () => {
  class FakeProvider extends HttpAIProvider { id = 'openai'; model = 'test'; apiKey = 'configured'; constructor(response) { super(); this.response = response; } async request() { return this.response; } }
  const schema = z.object({ draft: z.string() });
  const ok = await new FakeProvider('```json\n{"draft":"hello"}\n```').generateStructured({ systemPrompt: '', userPrompt: '', maxOutputTokens: 100 }, schema);
  assert.equal(ok.value.draft, 'hello');
  await assert.rejects(() => new FakeProvider('not json').generateStructured({ systemPrompt: '', userPrompt: '', maxOutputTokens: 100 }, schema), (error) => error.code === 'AI_RESPONSE_INVALID');
});
