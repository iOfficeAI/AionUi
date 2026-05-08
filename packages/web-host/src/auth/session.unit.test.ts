import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  verifySession,
  SESSION_COOKIE,
  __internal_clearStore_for_tests__,
} from './session.js';

describe('auth/session', () => {
  beforeEach(() => __internal_clearStore_for_tests__());

  it('createSession returns a token that verifies', () => {
    const s = createSession({ username: 'admin' });
    expect(s.token).toMatch(/^[A-Za-z0-9_-]+\.[a-f0-9]+$/);
    expect(verifySession(s.token)).toBe(true);
  });

  it('verifySession rejects tampered payload', () => {
    const s = createSession({ username: 'admin' });
    const [, sig] = s.token.split('.');
    const bad = Buffer.from(JSON.stringify({ u: 'attacker', e: Date.now() + 1e6 }))
      .toString('base64url');
    expect(verifySession(`${bad}.${sig}`)).toBe(false);
  });

  it('verifySession rejects tampered signature', () => {
    const s = createSession({ username: 'admin' });
    const [payload] = s.token.split('.');
    const bogusSig = 'f'.repeat(64);
    expect(verifySession(`${payload}.${bogusSig}`)).toBe(false);
  });

  it('destroy removes the session from store', () => {
    const s = createSession({ username: 'admin' });
    expect(verifySession(s.token)).toBe(true);
    s.destroy();
    expect(verifySession(s.token)).toBe(false);
  });

  it('expired session is rejected', async () => {
    const s = createSession({ username: 'admin', maxAge: 1 });
    await new Promise((r) => setTimeout(r, 10));
    expect(verifySession(s.token)).toBe(false);
  });

  it('cookie constants match legacy webserver', () => {
    expect(SESSION_COOKIE.NAME).toBe('aionui-session');
    expect(SESSION_COOKIE.HTTP_ONLY).toBe(true);
    expect(SESSION_COOKIE.SAME_SITE_LOCAL).toBe('strict');
    expect(SESSION_COOKIE.SAME_SITE_REMOTE).toBe('lax');
  });

  it('verifySession returns false for malformed tokens', () => {
    expect(verifySession('')).toBe(false);
    expect(verifySession('no-dot')).toBe(false);
    expect(verifySession('a.b')).toBe(false);
  });
});
