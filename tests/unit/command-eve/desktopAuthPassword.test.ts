/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE in-app email/password auth (founder HG-4). Proves:
 *  (1) empty email/password short-circuits to FIELDS_REQUIRED (no network);
 *  (2) login posts token?grant_type=password with the anon apikey + NO Authorization,
 *      and returns a parsed session;
 *  (3) register posts /auth/v1/signup;
 *  (4) register with email-confirmation ON (2xx, no access_token) => EMAIL_CONFIRMATION_REQUIRED;
 *  (5) GoTrue error mapping is coarse + non-leaking (invalid_credentials/email_taken/
 *      weak_password/rate_limited);
 *  (6) network throw => AUTH_NETWORK;
 *  (7) email is trimmed; the password is never echoed in the result.
 *
 * Synthetic tokens only — never real credentials. fetch + anonKey are injected.
 */

import { describe, expect, it } from 'vitest';
import { mapGoTrueError, passwordGrant } from '@process/commandEve/desktopAuthPassword';

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function recordingFetch(impl: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return impl(url, init);
  }) as unknown as typeof fetch & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

const SESSION_BODY = {
  access_token: 'synthetic-access',
  refresh_token: 'synthetic-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'u1', email: 'founder@firma.de', user_metadata: { name: 'Founder', company: 'Firma' } },
};

describe('passwordGrant', () => {
  it('short-circuits to FIELDS_REQUIRED without any network call', async () => {
    const fetchImpl = recordingFetch(() => jsonRes(200, SESSION_BODY));
    const r1 = await passwordGrant('login', '', 'pw', { fetch: fetchImpl, anonKey: 'anon' });
    const r2 = await passwordGrant('login', 'a@b.de', '', { fetch: fetchImpl, anonKey: 'anon' });
    expect(r1).toEqual({ ok: false, reason_code: 'FIELDS_REQUIRED' });
    expect(r2).toEqual({ ok: false, reason_code: 'FIELDS_REQUIRED' });
    expect(fetchImpl.calls.length).toBe(0);
  });

  it('login posts the password grant with apikey + NO Authorization and returns a session', async () => {
    const fetchImpl = recordingFetch(() => jsonRes(200, SESSION_BODY));
    const r = await passwordGrant('login', '  founder@firma.de  ', 'secret-pw', { fetch: fetchImpl, anonKey: 'anon-key' });
    expect(r.ok).toBe(true);
    expect(r.session?.user.email).toBe('founder@firma.de');
    expect(r.session?.access_token).toBe('synthetic-access');

    const { url, init } = fetchImpl.calls[0];
    expect(url).toContain('/auth/v1/token?grant_type=password');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-key');
    expect(headers.Authorization).toBeUndefined();
    // email is trimmed in the request body; password passes through unchanged.
    expect(JSON.parse(String(init.body))).toEqual({ email: 'founder@firma.de', password: 'secret-pw' });
  });

  it('register posts to /auth/v1/signup', async () => {
    const fetchImpl = recordingFetch(() => jsonRes(200, SESSION_BODY));
    const r = await passwordGrant('register', 'new@firma.de', 'pw12345678', { fetch: fetchImpl, anonKey: 'anon' });
    expect(r.ok).toBe(true);
    expect(fetchImpl.calls[0].url).toContain('/auth/v1/signup');
  });

  it('register with email-confirmation ON (2xx, no access_token) => EMAIL_CONFIRMATION_REQUIRED', async () => {
    // GoTrue signup with confirmation ON returns the created user, NOT a session.
    const fetchImpl = recordingFetch(() => jsonRes(200, { id: 'u2', email: 'new@firma.de' }));
    const r = await passwordGrant('register', 'new@firma.de', 'pw12345678', { fetch: fetchImpl, anonKey: 'anon' });
    expect(r).toEqual({ ok: false, reason_code: 'EMAIL_CONFIRMATION_REQUIRED' });
  });

  it('maps invalid credentials, taken email, weak password, and rate limit to safe codes', async () => {
    const bad = recordingFetch(() => jsonRes(400, { error_description: 'Invalid login credentials' }));
    expect((await passwordGrant('login', 'a@b.de', 'x', { fetch: bad, anonKey: 'k' })).reason_code).toBe('invalid_credentials');

    const taken = recordingFetch(() => jsonRes(400, { msg: 'User already registered' }));
    expect((await passwordGrant('register', 'a@b.de', 'x', { fetch: taken, anonKey: 'k' })).reason_code).toBe('email_taken');

    const weak = recordingFetch(() => jsonRes(422, { msg: 'Password should be at least 6 characters' }));
    expect((await passwordGrant('register', 'a@b.de', 'x', { fetch: weak, anonKey: 'k' })).reason_code).toBe('weak_password');

    const limited = recordingFetch(() => jsonRes(429, { msg: 'rate limit exceeded' }));
    expect((await passwordGrant('login', 'a@b.de', 'x', { fetch: limited, anonKey: 'k' })).reason_code).toBe('rate_limited');
  });

  it('returns AUTH_NETWORK when the fetch throws', async () => {
    const throwing = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    const r = await passwordGrant('login', 'a@b.de', 'pw', { fetch: throwing, anonKey: 'k' });
    expect(r).toEqual({ ok: false, reason_code: 'AUTH_NETWORK' });
  });

  it('never echoes the password anywhere in the result', async () => {
    const fetchImpl = recordingFetch(() => jsonRes(400, { msg: 'Invalid login credentials' }));
    const r = await passwordGrant('login', 'a@b.de', 'super-secret-123', { fetch: fetchImpl, anonKey: 'k' });
    expect(JSON.stringify(r)).not.toContain('super-secret-123');
  });
});

describe('mapGoTrueError', () => {
  it('classifies the common GoTrue failures and defaults to AUTH_FAILED', () => {
    expect(mapGoTrueError(429, {})).toBe('rate_limited');
    expect(mapGoTrueError(400, { msg: 'User already registered' })).toBe('email_taken');
    expect(mapGoTrueError(400, { error_description: 'Invalid login credentials' })).toBe('invalid_credentials');
    expect(mapGoTrueError(400, { msg: 'Email not confirmed' })).toBe('email_not_confirmed');
    expect(mapGoTrueError(422, { msg: 'Password should be at least 6 characters' })).toBe('weak_password');
    expect(mapGoTrueError(400, {})).toBe('invalid_credentials');
    expect(mapGoTrueError(500, { msg: 'server exploded' })).toBe('AUTH_FAILED');
  });
});
