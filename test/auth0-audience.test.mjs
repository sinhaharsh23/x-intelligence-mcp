import assert from 'node:assert/strict';
import test from 'node:test';
import { OAuthModule, validateAudience } from '@nitrostack/core';
import {
  AUTH0_ISSUER,
  CLAUDE_AUTH0_AUDIENCE,
  EXISTING_AUTH0_AUDIENCE,
  configuredAuth0Audiences,
  hasValidAuth0Issuer,
} from '../dist/common/config/auth0.js';

const baseConfig = {
  AUTH0_AUDIENCE: undefined,
  AUTH0_AUDIENCES: undefined,
  TOKEN_AUDIENCE: EXISTING_AUTH0_AUDIENCE,
};

test('legacy TOKEN_AUDIENCE resolves to the compatibility pair', () => {
  assert.deepEqual(configuredAuth0Audiences(baseConfig), [
    EXISTING_AUTH0_AUDIENCE,
    CLAUDE_AUTH0_AUDIENCE,
  ]);
});

test('explicit AUTH0_AUDIENCES remains a configuration-based allowlist', () => {
  assert.deepEqual(configuredAuth0Audiences({
    AUTH0_AUDIENCE: undefined,
    AUTH0_AUDIENCES: `${EXISTING_AUTH0_AUDIENCE}, ${CLAUDE_AUTH0_AUDIENCE}`,
    TOKEN_AUDIENCE: undefined,
  }), [EXISTING_AUTH0_AUDIENCE, CLAUDE_AUTH0_AUDIENCE]);
});

test('NitroStack audience validation accepts either configured Auth0 audience', () => {
  const expected = [EXISTING_AUTH0_AUDIENCE, CLAUDE_AUTH0_AUDIENCE];
  assert.equal(validateAudience({ active: true, aud: EXISTING_AUTH0_AUDIENCE }, expected), true);
  assert.equal(validateAudience({ active: true, aud: CLAUDE_AUTH0_AUDIENCE }, expected), true);
});

test('NitroStack audience validation rejects unrelated and missing audiences', () => {
  const expected = [EXISTING_AUTH0_AUDIENCE, CLAUDE_AUTH0_AUDIENCE];
  assert.equal(validateAudience({ active: true, aud: 'https://unrelated.example' }, expected), false);
  assert.equal(validateAudience({ active: true }, expected), false);
});

test('issuer validation accepts the configured Auth0 issuer and rejects another issuer', () => {
  assert.equal(hasValidAuth0Issuer({ iss: AUTH0_ISSUER }, AUTH0_ISSUER), true);
  assert.equal(hasValidAuth0Issuer({ iss: 'https://unrelated.auth0.com/' }, AUTH0_ISSUER), false);
  assert.equal(hasValidAuth0Issuer({}, AUTH0_ISSUER), false);
});

test('OAuthModule verifier enforces multi-audience and issuer checks on introspection', async () => {
  const originalFetch = globalThis.fetch;
  let introspection = {
    active: true,
    aud: CLAUDE_AUTH0_AUDIENCE,
    iss: AUTH0_ISSUER,
    sub: 'test-client',
  };
  globalThis.fetch = async () => new Response(JSON.stringify(introspection), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  try {
    OAuthModule.forRoot({
      resourceUri: CLAUDE_AUTH0_AUDIENCE,
      authorizationServers: [AUTH0_ISSUER],
      tokenIntrospectionEndpoint: 'https://x-intelligence-mcp.au.auth0.com/oauth/token/introspection',
      audience: [EXISTING_AUTH0_AUDIENCE, CLAUDE_AUTH0_AUDIENCE],
      issuer: AUTH0_ISSUER,
      customValidation: (payload) => hasValidAuth0Issuer(payload, AUTH0_ISSUER),
    });

    assert.equal((await OAuthModule.validateToken('header.payload.claude-audience')).valid, true);
    introspection = { ...introspection, aud: EXISTING_AUTH0_AUDIENCE };
    assert.equal((await OAuthModule.validateToken('header.payload.existing-audience')).valid, true);
    introspection = { ...introspection, aud: 'https://unrelated.example' };
    assert.equal((await OAuthModule.validateToken('header.payload.unrelated-audience')).valid, false);
    introspection = { ...introspection, aud: undefined };
    assert.equal((await OAuthModule.validateToken('header.payload.missing-audience')).valid, false);
    introspection = { ...introspection, aud: CLAUDE_AUTH0_AUDIENCE, iss: 'https://unrelated.auth0.com/' };
    assert.equal((await OAuthModule.validateToken('header.payload.invalid-issuer')).valid, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
