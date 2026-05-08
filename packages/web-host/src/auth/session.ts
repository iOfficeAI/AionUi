/**
 * In-memory session management for WebUI login.
 *
 * Design notes:
 *  - HMAC-SHA256 signed opaque tokens (no JWT lib dependency).
 *  - Cookie name / options match legacy webserver: name='aionui-session',
 *    HttpOnly=true, SameSite='strict' (local) or 'lax' (remote).
 *  - Session store is in-memory only (consistent with legacy webserver).
 */

import crypto from 'node:crypto';

const SESSION_COOKIE_NAME = 'aionui-session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h, match legacy SESSION_EXPIRY

export type SessionOptions = {
  maxAge?: number;
};

export type SessionHandle = {
  token: string;
  destroy: () => void;
};

type SessionEntry = {
  username: string;
  expiresAt: number;
};

const store = new Map<string, SessionEntry>();
const secret = crypto.randomBytes(32);

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function createSession(opts?: SessionOptions & { username?: string }): SessionHandle {
  const username = opts?.username ?? 'admin';
  const ttl = opts?.maxAge ?? SESSION_TTL_MS;
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + ttl;
  const payload = Buffer.from(JSON.stringify({ u: username, e: expiresAt, n: nonce })).toString('base64url');
  const signature = sign(payload);
  const token = `${payload}.${signature}`;
  store.set(token, { username, expiresAt });
  return {
    token,
    destroy: () => store.delete(token),
  };
}

/**
 * Return the username associated with a valid session token, or null if the
 * token is invalid, unknown, or expired. Thin wrapper so `/api/auth/user`
 * handlers can answer from cookie alone without going through the backend.
 */
export function getSessionUsername(token: string): string | null {
  if (!verifySession(token)) return null;
  return store.get(token)?.username ?? null;
}

export function verifySession(token: string): boolean {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  // constant-time compare
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  ) {
    return false;
  }
  const entry = store.get(token);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    store.delete(token);
    return false;
  }
  return true;
}

export const SESSION_COOKIE = {
  NAME: SESSION_COOKIE_NAME,
  HTTP_ONLY: true as const,
  SAME_SITE_LOCAL: 'strict' as const,
  SAME_SITE_REMOTE: 'lax' as const,
  PATH: '/' as const,
  MAX_AGE_MS: SESSION_TTL_MS,
};

// Exposed for tests only. DO NOT use in production code paths.
export const __internal_clearStore_for_tests__ = (): void => {
  store.clear();
};
