import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthMiddleware } from '@nitrostack/core';
import { assertProductionSecurity } from '../dist/common/config/production-security.js';
import { getConfig, resetConfigForTests } from '../dist/common/config/env.js';

const envNames = [
  'NODE_ENV', 'HOST', 'MCP_TRANSPORT_TYPE', 'OAUTH_REQUIRED', 'RESOURCE_URI',
  'AUTH_SERVER_URL', 'TOKEN_AUDIENCE', 'TOKEN_ISSUER', 'JWKS_URI',
  'INTROSPECTION_ENDPOINT', 'INTROSPECTION_CLIENT_ID', 'INTROSPECTION_CLIENT_SECRET',
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of envNames) delete process.env[name];
    Object.assign(process.env, values);
    resetConfigForTests();
    return callback();
  } finally {
    for (const name of envNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    resetConfigForTests();
  }
}

const productionJwks = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  MCP_TRANSPORT_TYPE: 'dual',
  OAUTH_REQUIRED: 'true',
  RESOURCE_URI: 'https://mcp.example.test',
  AUTH_SERVER_URL: 'https://auth.example.test',
  TOKEN_AUDIENCE: 'https://mcp.example.test',
  TOKEN_ISSUER: 'https://auth.example.test/',
  JWKS_URI: 'https://auth.example.test/.well-known/jwks.json',
};

test('local development remains open only under the explicit development policy', () => {
  withEnvironment({ NODE_ENV: 'development', MCP_TRANSPORT_TYPE: 'dual', OAUTH_REQUIRED: 'false' }, () => {
    assert.doesNotThrow(() => assertProductionSecurity(getConfig()));
  });
});

test('production fails closed when MCP OAuth enforcement is disabled', () => {
  withEnvironment({ ...productionJwks, OAUTH_REQUIRED: 'false' }, () => {
    assert.throws(() => assertProductionSecurity(getConfig()), /OAUTH_REQUIRED=true is required/);
  });
});

test('production fails closed when HTTP binds only to loopback', () => {
  withEnvironment({ ...productionJwks, HOST: '127.0.0.1' }, () => {
    assert.throws(() => assertProductionSecurity(getConfig()), /HOST must not be a loopback address in production/);
  });
});

test('production fails closed when no NitroStack token verifier is configured', () => {
  withEnvironment({ ...productionJwks, JWKS_URI: undefined, TOKEN_ISSUER: undefined }, () => {
    delete process.env.JWKS_URI;
    delete process.env.TOKEN_ISSUER;
    assert.throws(() => assertProductionSecurity(getConfig()), /JWKS_URI or INTROSPECTION_ENDPOINT is required/);
  });
});

test('production accepts a complete JWKS verifier configuration', () => {
  withEnvironment(productionJwks, () => {
    assert.doesNotThrow(() => assertProductionSecurity(getConfig()));
  });
});

test('production accepts a complete opaque-token introspection configuration', () => {
  withEnvironment({
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    MCP_TRANSPORT_TYPE: 'http',
    OAUTH_REQUIRED: 'true',
    RESOURCE_URI: 'https://mcp.example.test',
    AUTH_SERVER_URL: 'https://auth.example.test',
    TOKEN_AUDIENCE: 'https://mcp.example.test',
    INTROSPECTION_ENDPOINT: 'https://auth.example.test/oauth/introspect',
    INTROSPECTION_CLIENT_ID: 'mcp-server',
    INTROSPECTION_CLIENT_SECRET: 'test-only-secret',
  }, () => {
    assert.doesNotThrow(() => assertProductionSecurity(getConfig()));
  });
});

test('NitroStack auth middleware denies an MCP tool call without a bearer token', async () => {
  const middleware = createAuthMiddleware({
    resourceUri: 'https://mcp.example.test',
    authorizationServers: ['https://auth.example.test'],
    tokenIntrospectionEndpoint: 'https://auth.example.test/oauth/introspect',
    audience: 'https://mcp.example.test',
  });
  let nextCalled = false;
  let responseStatus;
  let responseBody;
  const response = {
    setHeader() {},
    header() { return this; },
    status(code) { responseStatus = code; return this; },
    json(body) { responseBody = body; },
  };
  await middleware(
    { method: 'POST', path: '/mcp', body: { method: 'tools/call' }, headers: {} },
    response,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, false);
  assert.equal(responseStatus, 401);
  assert.equal(responseBody.error, 'unauthorized');
});

test('NitroStack auth middleware accepts a valid introspection result', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    active: true,
    sub: 'test-client',
    client_id: 'test-client',
    aud: ['https://mcp.example.test'],
    scope: 'mcp:read mcp:execute',
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const middleware = createAuthMiddleware({
      resourceUri: 'https://mcp.example.test',
      authorizationServers: ['https://auth.example.test'],
      tokenIntrospectionEndpoint: 'https://auth.example.test/oauth/introspect',
      audience: 'https://mcp.example.test',
    });
    let nextCalled = false;
    const request = { method: 'POST', path: '/mcp', body: { method: 'tools/call' }, headers: { authorization: 'Bearer test-only-token' } };
    await middleware(request, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(request.auth.authenticated, true);
    assert.equal(request.auth.subject, 'test-client');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
