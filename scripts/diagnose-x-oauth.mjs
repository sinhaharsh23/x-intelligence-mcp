import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import dotenv from 'dotenv';

const AUTHORIZATION_ENDPOINT = 'https://x.com/i/oauth2/authorize';
const REDIRECT_URI = 'http://127.0.0.1:3000/auth/x/callback';
const SCOPE = 'tweet.read users.read offline.access';
const LOCAL_START_URL = 'http://127.0.0.1:3000/auth/x/start';

function base64Url(bytes) {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createVerifier() {
  return base64Url(randomBytes(64));
}

function createChallenge(verifier) {
  return base64Url(createHash('sha256').update(verifier, 'ascii').digest());
}

function createState() {
  return base64Url(randomBytes(32));
}

function safeUrlProperties(url, clientIdLength, verifierLength = null) {
  const parameterNames = [...new Set(url.searchParams.keys())].sort();
  const clientId = url.searchParams.get('client_id') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const challenge = url.searchParams.get('code_challenge') ?? '';
  return {
    authorizationHost: url.host,
    authorizationPath: url.pathname,
    parameterNames,
    clientIdPresent: clientId.length > 0,
    clientIdLength: clientIdLength ?? clientId.length,
    redirectUri,
    responseType: url.searchParams.get('response_type'),
    scope: url.searchParams.get('scope'),
    pkceMethod: url.searchParams.get('code_challenge_method'),
    pkceVerifierLength: verifierLength,
    pkceChallengeLength: challenge.length,
    stateLength: (url.searchParams.get('state') ?? '').length,
    verifierRfc7636Valid: verifier.length >= 43 && verifier.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(verifier),
    challengeBase64UrlValid: challenge.length > 0 && /^[A-Za-z0-9_-]+$/.test(challenge),
    redirectUriHasWhitespace: /\s/.test(redirectUri),
    clientIdHasLeadingOrTrailingWhitespace: clientId !== clientId.trim(),
  };
}

function expectedParameterNames() {
  return ['client_id', 'code_challenge', 'code_challenge_method', 'redirect_uri', 'response_type', 'scope', 'state'].sort();
}

function compareRequests(standalone, nitrostack) {
  const differences = [];
  if (JSON.stringify(standalone.parameterNames) !== JSON.stringify(nitrostack.parameterNames)) differences.push('parameter names');
  if (standalone.authorizationHost !== nitrostack.authorizationHost) differences.push('authorization host');
  if (standalone.authorizationPath !== nitrostack.authorizationPath) differences.push('authorization path');
  if (standalone.clientIdPresent !== nitrostack.clientIdPresent) differences.push('client_id presence');
  if (standalone.clientIdLength !== nitrostack.clientIdLength) differences.push('client_id length');
  if (standalone.redirectUri !== nitrostack.redirectUri) differences.push('redirect_uri');
  if (standalone.responseType !== nitrostack.responseType) differences.push('response_type');
  if (standalone.scope !== nitrostack.scope) differences.push('scope');
  if (standalone.pkceMethod !== nitrostack.pkceMethod) differences.push('code_challenge_method');
  if (standalone.pkceVerifierLength !== null && nitrostack.pkceVerifierLength !== null
    && standalone.pkceVerifierLength !== nitrostack.pkceVerifierLength) differences.push('verifier length');
  if (standalone.pkceChallengeLength !== nitrostack.pkceChallengeLength) differences.push('challenge length');
  if (standalone.stateLength !== nitrostack.stateLength) differences.push('state length');
  return differences;
}

const envPath = resolve(process.cwd(), '.env');
const env = dotenv.parse(readFileSync(envPath));
const clientId = env.X_CLIENT_ID ?? '';
const verifier = createVerifier();
const challenge = createChallenge(verifier);
const state = createState();

const authorizationUrl = new URL(AUTHORIZATION_ENDPOINT);
authorizationUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  scope: SCOPE,
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString();

const tempDirectory = mkdtempSync(join(tmpdir(), 'x-intelligence-mcp-oauth-'));
const urlFile = join(tempDirectory, 'authorization-url.txt');
writeFileSync(urlFile, `${authorizationUrl}\n`, { encoding: 'utf8', mode: 0o600 });
chmodSync(urlFile, 0o600);

const standalone = safeUrlProperties(authorizationUrl, clientId.length, verifier.length);
standalone.pkceChallengeLength = challenge.length;
standalone.stateLength = state.length;
standalone.verifierRfc7636Valid = verifier.length >= 43 && verifier.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(verifier);
standalone.challengeBase64UrlValid = /^[A-Za-z0-9_-]+$/.test(challenge);
const standaloneValid = clientId.length > 0
  && standalone.parameterNames.join(',') === expectedParameterNames().join(',')
  && standalone.authorizationHost === 'x.com'
  && standalone.authorizationPath === '/i/oauth2/authorize'
  && standalone.redirectUri === REDIRECT_URI
  && standalone.responseType === 'code'
  && standalone.scope === SCOPE
  && standalone.pkceMethod === 'S256'
  && standalone.pkceVerifierLength >= 43
  && standalone.pkceVerifierLength <= 128
  && standalone.pkceChallengeLength === 43
  && standalone.stateLength >= 43
  && standalone.verifierRfc7636Valid
  && standalone.challengeBase64UrlValid
  && !standalone.redirectUriHasWhitespace
  && !standalone.clientIdHasLeadingOrTrailingWhitespace;

let nitrostack;
let nitrostackStatus;
try {
  const response = await fetch(LOCAL_START_URL, { redirect: 'manual' });
  nitrostackStatus = response.status;
  const location = response.headers.get('location');
  if (location) nitrostack = safeUrlProperties(new URL(location, LOCAL_START_URL), clientId.length);
} catch {
  nitrostack = undefined;
}

const nitrostackValid = Boolean(nitrostack
  && nitrostackStatus === 302
  && nitrostack.authorizationHost === standalone.authorizationHost
  && nitrostack.authorizationPath === standalone.authorizationPath
  && nitrostack.clientIdPresent
  && nitrostack.redirectUri === REDIRECT_URI
  && nitrostack.responseType === 'code'
  && nitrostack.scope === SCOPE
  && nitrostack.pkceMethod === 'S256'
  && nitrostack.pkceChallengeLength === 43
  && nitrostack.stateLength >= 43);

console.log(JSON.stringify({
  standaloneRequest: {
    valid: standaloneValid,
    authorizationHost: standalone.authorizationHost,
    authorizationPath: standalone.authorizationPath,
    parameterNames: standalone.parameterNames,
    clientIdPresent: standalone.clientIdPresent,
    clientIdLength: standalone.clientIdLength,
    redirectUri: standalone.redirectUri,
    responseType: standalone.responseType,
    scope: standalone.scope,
    pkceMethod: standalone.pkceMethod,
    pkceVerifierLength: standalone.pkceVerifierLength,
    pkceChallengeLength: standalone.pkceChallengeLength,
    stateLength: standalone.stateLength,
    verifierRfc7636Valid: standalone.verifierRfc7636Valid,
    challengeBase64UrlValid: standalone.challengeBase64UrlValid,
    redirectUriHasWhitespace: standalone.redirectUriHasWhitespace,
    clientIdHasLeadingOrTrailingWhitespace: standalone.clientIdHasLeadingOrTrailingWhitespace,
  },
  nitrostackRequest: nitrostack ? {
    valid: nitrostackValid,
    httpStatus: nitrostackStatus,
    authorizationHost: nitrostack.authorizationHost,
    authorizationPath: nitrostack.authorizationPath,
    parameterNames: nitrostack.parameterNames,
    clientIdPresent: nitrostack.clientIdPresent,
    clientIdLength: nitrostack.clientIdLength,
    redirectUri: nitrostack.redirectUri,
    responseType: nitrostack.responseType,
    scope: nitrostack.scope,
    pkceMethod: nitrostack.pkceMethod,
    pkceVerifierLength: nitrostack.pkceVerifierLength,
    pkceChallengeLength: nitrostack.pkceChallengeLength,
    stateLength: nitrostack.stateLength,
  } : { valid: false, reachable: false },
  structuralDifferences: nitrostack ? compareRequests(standalone, nitrostack) : ['NitroStack start route was not reachable'],
  urlFile,
  safeOpenCommand: `open \"$(tr -d '\\n' < '${urlFile}')\"`,
  note: 'The open command tests X authorization independently; the existing NitroStack callback will not consume this standalone state.',
}, null, 2));
