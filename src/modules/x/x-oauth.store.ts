import { createHash } from 'node:crypto';

export interface PendingXOAuthRequest {
  codeVerifier: string;
  redirectUri: string;
  scopes: string[];
  expiresAt: number;
}

export interface StoredXOAuthToken {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scopes: string[];
  expiresAt?: number;
  connectedAt: string;
}

function stateKey(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

/**
 * Process-local OAuth state and token storage for personal/local mode.
 *
 * Nothing is written to disk. This boundary is intentionally small so a
 * NitroCloud-backed, encrypted multi-user store can replace it later.
 */
export class XOAuthTokenStore {
  private readonly pending = new Map<string, PendingXOAuthRequest>();
  private token?: StoredXOAuthToken;

  savePending(state: string, request: PendingXOAuthRequest): void {
    this.removeExpiredPending();
    this.pending.set(stateKey(state), { ...request, scopes: [...request.scopes] });
  }

  consumePending(state: string): PendingXOAuthRequest | undefined {
    this.removeExpiredPending();
    const key = stateKey(state);
    const request = this.pending.get(key);
    if (!request) return undefined;
    this.pending.delete(key);
    return { ...request, scopes: [...request.scopes] };
  }

  saveToken(token: StoredXOAuthToken): void {
    this.token = { ...token, scopes: [...token.scopes] };
  }

  getToken(): StoredXOAuthToken | undefined {
    return this.token ? { ...this.token, scopes: [...this.token.scopes] } : undefined;
  }

  clearToken(): void {
    this.token = undefined;
  }

  clearPending(): void {
    this.pending.clear();
  }

  private removeExpiredPending(now = Date.now()): void {
    for (const [key, request] of this.pending) {
      if (request.expiresAt <= now) this.pending.delete(key);
    }
  }
}
