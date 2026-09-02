import assert from 'node:assert/strict';
import test from 'node:test';
import { getCacheMetadata } from '@nitrostack/core';
import { normalizeUsername, usernameSchema } from '../dist/modules/x/x.schemas.js';
import { XService } from '../dist/modules/x/x.service.js';

test('x_get_user username normalization never truncates handles', () => {
  for (const value of ['XDevelopers', '@XDevelopers', 'HarshRajhhh', '@HarshRajhhh']) {
    const parsed = usernameSchema.parse(value);
    assert.equal(parsed.length, value.replace(/^@/, '').length);
    assert.equal(parsed, value.replace(/^@/, ''));
    assert.equal(normalizeUsername(value), parsed);
  }
});

test('x_get_user cache keys use the complete normalized username', () => {
  const metadata = getCacheMetadata(XService.prototype, 'getUser');
  assert.equal(typeof metadata?.key, 'function');
  const key = metadata.key;
  assert.equal(key({ username: 'XDevelopers' }), 'x:user:{"username":"XDevelopers"}');
  assert.equal(key({ username: '@XDevelopers' }), 'x:user:{"username":"XDevelopers"}');
  assert.equal(key({ username: 'HarshRajhhh' }), 'x:user:{"username":"HarshRajhhh"}');
  assert.equal(key({ username: '@HarshRajhhh' }), 'x:user:{"username":"HarshRajhhh"}');
  assert.notEqual(key({ username: 'XDevelopers' }), 'x:user:{"username":"X"}');
  assert.notEqual(key({ username: 'HarshRajhhh' }), 'x:user:{"username":"H"}');
});

test('x_get_user service sends the complete normalized username to X', async () => {
  const service = new XService();
  const requests = [];
  service.client.request = async (path) => {
    requests.push(path);
    return { data: { id: String(requests.length), name: 'Test account', username: path.split('/').at(-1) } };
  };

  const xDevelopers = await service.getUser({ username: '@XDevelopers' });
  const harsh = await service.getUser({ username: '@HarshRajhhh' });
  assert.match(requests[0], /\/2\/users\/by\/username\/XDevelopers$/);
  assert.match(requests[1], /\/2\/users\/by\/username\/HarshRajhhh$/);
  assert.equal(xDevelopers.username, 'XDevelopers');
  assert.equal(harsh.username, 'HarshRajhhh');
});
