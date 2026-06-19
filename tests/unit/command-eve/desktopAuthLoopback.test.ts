/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE desktop account auth (browser-loopback, P1). Proves:
 *  (1) PKCE S256 challenge correctness (challenge === base64url(sha256(verifier)));
 *  (2) state-mismatch on the callback ABORTS (no token exchange);
 *  (3) the loopback server binds 127.0.0.1 ONLY and is single-use (closes after
 *      one request);
 *  (4) keychain fail-closed for the session-at-rest store;
 *  (5) login -> code -> activate happy path opens the gate (entitled);
 *  (6) silent resume (valid refresh, no browser) activates;
 *  (7) my-license PENDING -> paste fallback (needsPaste).
 *
 * Synthetic tokens + a throwaway Ed25519 key only — never real credentials.
 * All I/O (http, fetch, openExternal, randomBytes, keychain) is injected.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createPkcePair,
  createState,
  exchangeCodeForSession,
  parseSession,
  runDesktopAuthLoopback,
  stateEquals,
  type CommandEveAccountSession,
} from '@process/commandEve/desktopAuthLoopback';
import {
  clearAccountSession,
  hasAccountSession,
  isExpired,
  readAccountSession,
  storeAccountSession,
} from '@process/commandEve/accountSessionAtRest';
import {
  activateEntitlementFromSession,
  deriveProfileFromEmail,
  silentResumeAccountAuth,
} from '@process/commandEve/accountAuthOrchestratorCore';
import { setSafeStorageForTesting, type SafeStorageAdapter } from '@/common/config/keychain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];
const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-desktop-auth-test-'));
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  setSafeStorageForTesting(undefined);
  vi.restoreAllMocks();
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeAvailableAdapter(): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plainText: string) => Buffer.from(`enc::${plainText}`, 'utf8'),
    decryptString: (encrypted: Buffer) => {
      const raw = encrypted.toString('utf8');
      if (!raw.startsWith('enc::')) throw new Error('bad ciphertext');
      return raw.slice('enc::'.length);
    },
  };
}

function makeUnavailableAdapter(): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('should never be called when unavailable');
    },
    decryptString: () => {
      throw new Error('should never be called when unavailable');
    },
  };
}

const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const futureSession = (overrides: Partial<CommandEveAccountSession> = {}): CommandEveAccountSession => ({
  access_token: 'ACCESS-TESTONLY',
  refresh_token: 'REFRESH-TESTONLY',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: 'u1', email: 'jane.doe@acme-corp.com', name: 'Jane Doe' },
  ...overrides,
});

// CEVE.v1 minting (mirror of entitlementCore.test.ts).
const makeKeypair = (): { publicKeyPem: string; privateKey: crypto.KeyObject } => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey };
};
const canonicalPayloadJson = (p: Record<string, unknown>): string =>
  JSON.stringify({
    license_version: p.license_version ?? null,
    edition: p.edition ?? null,
    serial: p.serial ?? null,
    tenant_serial: p.tenant_serial ?? null,
    issued_at: p.issued_at ?? null,
    expires_at: p.expires_at ?? null,
  });
const signCode = (privateKey: crypto.KeyObject, payload: Record<string, unknown>): string => {
  const bytes = Buffer.from(canonicalPayloadJson(payload), 'utf8');
  const sig = crypto.sign(null, bytes, privateKey);
  return ['CEVE', 'v1', base64url(bytes), base64url(sig)].join('.');
};
const validPayload = (overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  license_version: 'command-eve-license/v1',
  edition: 'pilot',
  serial: 'CEVE-PILOT-0001',
  tenant_serial: 'TENANT-0001',
  issued_at: '2026-01-01T00:00:00.000Z',
  expires_at: '2999-01-01T00:00:00.000Z',
  ...overrides,
});

/** Env that points at a non-existent bundled key + supplies the test key via env. */
const orchestratorEnv = (root: string, publicKeyPem: string): NodeJS.ProcessEnv => ({
  COMMAND_EVE_REGISTRATION_REQUIRED: 'true',
  COMMAND_EVE_LICENSE_PUBLIC_KEY: publicKeyPem,
});

// ---------------------------------------------------------------------------
// (1) PKCE S256 correctness
// ---------------------------------------------------------------------------

describe('desktopAuthLoopback — (1) PKCE S256', () => {
  it('challenge equals base64url(sha256(verifier)) and S256 method', () => {
    const pair = createPkcePair();
    expect(pair.method).toBe('S256');
    const expected = base64url(crypto.createHash('sha256').update(pair.verifier).digest());
    expect(pair.challenge).toBe(expected);
    // verifier entropy window: 43..86 base64url chars (32..64 bytes).
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.verifier.length).toBeLessThanOrEqual(86);
  });

  it('clamps verifier bytes into the RFC window and produces distinct states', () => {
    const tiny = createPkcePair(1);
    expect(tiny.verifier.length).toBeGreaterThanOrEqual(43); // clamped up to 32 bytes
    const s1 = createState();
    const s2 = createState();
    expect(s1).not.toBe(s2);
    expect(stateEquals(s1, s1)).toBe(true);
    expect(stateEquals(s1, s2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (2) state-mismatch abort  +  (3) loopback 127.0.0.1 single-use
// ---------------------------------------------------------------------------

describe('desktopAuthLoopback — (2) state mismatch + (3) loopback binding', () => {
  it('binds 127.0.0.1, drives the callback once, and aborts on a bad state', async () => {
    let openedUrl = '';
    const fetchSpy = vi.fn();

    const result = await runDesktopAuthLoopback('login', {
      openExternal: (url) => {
        openedUrl = url;
        // Simulate the browser hitting the callback with a WRONG state.
        const parsed = new URL(url);
        const redirect = parsed.searchParams.get('redirect_uri')!;
        const u = new URL(redirect);
        // The host MUST be the loopback address.
        expect(u.hostname).toBe('127.0.0.1');
        u.searchParams.set('state', 'WRONG-STATE');
        u.searchParams.set('code', 'should-be-ignored');
        return new Promise<void>((resolve) => {
          http.get(u.toString(), (res) => {
            res.resume();
            res.on('end', () => resolve());
          });
        });
      },
      fetch: fetchSpy as unknown as typeof fetch,
      timeoutMs: 4000,
    });

    expect(openedUrl).toContain('intent=login');
    expect(openedUrl).toContain('code_challenge_method=S256');
    expect(result.ok).toBe(false);
    expect(result.reason_code).toBe('STATE_MISMATCH');
    // No token exchange on a state mismatch.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('happy callback: matches state, captures code, exchanges, and the server is single-use', async () => {
    const session = futureSession();
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ session }), { status: 200, headers: { 'content-type': 'application/json' } })
    );

    let redirectUri = '';
    const result = await runDesktopAuthLoopback('login', {
      openExternal: (url) => {
        const parsed = new URL(url);
        redirectUri = parsed.searchParams.get('redirect_uri')!;
        const state = parsed.searchParams.get('state')!;
        const u = new URL(redirectUri);
        u.searchParams.set('state', state);
        u.searchParams.set('code', 'one-time-code-123');
        return new Promise<void>((resolve) => {
          http.get(u.toString(), (res) => {
            res.resume();
            res.on('end', () => resolve());
          });
        });
      },
      fetch: fetchSpy as unknown as typeof fetch,
      anonKey: 'anon-test',
      timeoutMs: 4000,
    });

    expect(result.ok).toBe(true);
    expect(result.session?.user.email).toBe('jane.doe@acme-corp.com');
    // Broker called with the one-time code + the apikey header (no Authorization).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-test');
    expect(headers.Authorization).toBeUndefined();
    expect(String(init.body)).toContain('one-time-code-123');
    expect(String(init.body)).toContain('code_verifier');

    // Single-use: a SECOND request to the same port must fail (server closed).
    const u = new URL(redirectUri);
    await expect(
      new Promise<void>((resolve, reject) => {
        const req = http.get(u.toString(), (res) => {
          res.resume();
          res.on('end', () => resolve());
        });
        req.on('error', reject);
      })
    ).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// (4) keychain fail-closed for session-at-rest
// ---------------------------------------------------------------------------

describe('accountSessionAtRest — (4) keychain fail-closed', () => {
  it('stores ONLY a keychain ref (no plaintext token on disk) and round-trips', () => {
    setSafeStorageForTesting(makeAvailableAdapter());
    const root = makeRoot();
    const session = futureSession();

    const stored = storeAccountSession(root, session);
    expect(stored.ok).toBe(true);
    expect(stored.outcome).toBe('stored');

    const file = path.join(root, 'command-eve-runtime', 'entitlement', 'session.enc');
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).toContain('keychain:v1:');
    expect(raw).not.toContain('ACCESS-TESTONLY');
    expect(raw).not.toContain('REFRESH-TESTONLY');

    const back = readAccountSession(root);
    expect(back.ok).toBe(true);
    expect(back.session?.access_token).toBe('ACCESS-TESTONLY');
    expect(hasAccountSession(root)).toBe(true);

    clearAccountSession(root);
    expect(hasAccountSession(root)).toBe(false);
  });

  it('FAILS CLOSED when the keychain is unavailable — nothing written, no plaintext', () => {
    setSafeStorageForTesting(makeUnavailableAdapter());
    const root = makeRoot();
    const stored = storeAccountSession(root, futureSession());
    expect(stored.ok).toBe(false);
    expect(stored.outcome).toBe('dropped-fail-closed');
    const file = path.join(root, 'command-eve-runtime', 'entitlement', 'session.enc');
    expect(fs.existsSync(file)).toBe(false);
    expect(hasAccountSession(root)).toBe(false);
  });

  it('isExpired: future token is fresh, past/zero token needs refresh', () => {
    expect(isExpired(futureSession())).toBe(false);
    expect(isExpired(futureSession({ expires_at: Math.floor(Date.now() / 1000) - 10 }))).toBe(true);
    expect(isExpired(futureSession({ expires_at: 0 }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (5) login -> code -> activate happy path
// ---------------------------------------------------------------------------

describe('accountAuthOrchestratorCore — (5) login->code->activate happy path', () => {
  it('registers, reads my-license, activates, and the gate is entitled', async () => {
    setSafeStorageForTesting(makeAvailableAdapter());
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    const code = signCode(privateKey, validPayload());

    // register-profile ok; my-license returns the minted code.
    const fetchSpy = vi.fn(async (url: string) => {
      if (String(url).includes('register-profile')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (String(url).includes('my-license')) {
        return new Response(JSON.stringify({ code }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const storeWire = vi.fn();
    const result = await activateEntitlementFromSession(root, futureSession(), {
      storeLicenseWire: storeWire,
      fetch: fetchSpy as unknown as typeof fetch,
      anonKey: 'anon-test',
      env: orchestratorEnv(root, publicKeyPem),
      sleep: async () => {},
    });

    expect(result.activated).toBe(true);
    expect(result.needsPaste).toBe(false);
    expect(result.status.state).toBe('entitled');
    // The verified wire is persisted (keychain) for the EVE Inference bearer.
    expect(storeWire).toHaveBeenCalledWith(root, code);
  });

  it('derives a name + company from the email when the web omitted them', () => {
    expect(deriveProfileFromEmail('jane.doe@acme-corp.com')).toEqual({ name: 'Jane Doe', company: 'Acme Corp' });
    // freemail domain does NOT become a company.
    const gmail = deriveProfileFromEmail('founder@gmail.com');
    expect(gmail.company).not.toBe('Gmail');
  });
});

// ---------------------------------------------------------------------------
// (6) silent resume (no browser)
// ---------------------------------------------------------------------------

describe('accountAuthOrchestratorCore — (6) silent resume', () => {
  it('refreshes a valid session and activates WITHOUT any browser', async () => {
    setSafeStorageForTesting(makeAvailableAdapter());
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    const code = signCode(privateKey, validPayload());

    // Store a NEAR-EXPIRY session so getFreshSession triggers a refresh.
    storeAccountSession(root, futureSession({ expires_at: Math.floor(Date.now() / 1000) + 5 }));

    const fetchSpy = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/v1/token')) {
        // GoTrue refresh response.
        return new Response(
          JSON.stringify({
            access_token: 'ACCESS-REFRESHED',
            refresh_token: 'REFRESH-ROTATED',
            expires_in: 3600,
            token_type: 'bearer',
            user: { id: 'u1', email: 'jane.doe@acme-corp.com' },
          }),
          { status: 200 }
        );
      }
      if (String(url).includes('register-profile')) return new Response('{}', { status: 200 });
      if (String(url).includes('my-license')) return new Response(JSON.stringify({ code }), { status: 200 });
      throw new Error(`unexpected url ${url}`);
    });

    const result = await silentResumeAccountAuth(root, {
      storeLicenseWire: vi.fn(),
      fetch: fetchSpy as unknown as typeof fetch,
      anonKey: 'anon-test',
      env: orchestratorEnv(root, publicKeyPem),
      sleep: async () => {},
    });

    expect(result.outcome).toBe('resumed');
    expect(result.activated).toBe(true);
    expect(result.status?.state).toBe('entitled');
    // The rotated session was persisted.
    expect(readAccountSession(root).session?.access_token).toBe('ACCESS-REFRESHED');
    // No openExternal seam was used at all (silent).
  });

  it('returns refresh-dead when the refresh token is rejected (require Login)', async () => {
    setSafeStorageForTesting(makeAvailableAdapter());
    const root = makeRoot();
    storeAccountSession(root, futureSession({ expires_at: Math.floor(Date.now() / 1000) - 10 }));

    const fetchSpy = vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    const result = await silentResumeAccountAuth(root, {
      storeLicenseWire: vi.fn(),
      fetch: fetchSpy as unknown as typeof fetch,
      anonKey: 'anon-test',
    });
    expect(result.outcome).toBe('refresh-dead');
  });

  it('skips silently when no session is stored', async () => {
    setSafeStorageForTesting(makeAvailableAdapter());
    const root = makeRoot();
    const result = await silentResumeAccountAuth(root, { storeLicenseWire: vi.fn() });
    expect(result.outcome).toBe('skipped');
  });
});

// ---------------------------------------------------------------------------
// (7) my-license PENDING -> paste fallback
// ---------------------------------------------------------------------------

describe('accountAuthOrchestratorCore — (7) my-license PENDING -> paste fallback', () => {
  it('falls back to paste when my-license never issues a code', async () => {
    setSafeStorageForTesting(makeAvailableAdapter());
    const root = makeRoot();
    const { publicKeyPem } = makeKeypair();

    const fetchSpy = vi.fn(async (url: string) => {
      if (String(url).includes('register-profile')) return new Response('{}', { status: 200 });
      if (String(url).includes('my-license')) {
        return new Response(JSON.stringify({ status: 'PENDING' }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await activateEntitlementFromSession(root, futureSession(), {
      storeLicenseWire: vi.fn(),
      fetch: fetchSpy as unknown as typeof fetch,
      anonKey: 'anon-test',
      env: orchestratorEnv(root, publicKeyPem),
      backoffMs: [1, 1], // fast retries
      sleep: async () => {},
    });

    expect(result.activated).toBe(false);
    expect(result.needsPaste).toBe(true);
    expect(result.reason_code).toBe('MY_LICENSE_PENDING');
    // my-license was retried (1 immediate + 2 backoff entries = 3 calls), plus
    // the single register-profile.
    const myLicenseCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes('my-license'));
    expect(myLicenseCalls.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// exchangeCodeForSession + parseSession unit coverage
// ---------------------------------------------------------------------------

describe('exchangeCodeForSession + parseSession', () => {
  it('maps a non-2xx broker response to BROKER_HTTP_*', async () => {
    const fetchSpy = vi.fn(async () => new Response('nope', { status: 503 }));
    const result = await exchangeCodeForSession({
      code: 'c',
      codeVerifier: 'v',
      fetchImpl: fetchSpy as unknown as typeof fetch,
      anonKey: 'k',
    });
    expect(result.ok).toBe(false);
    expect(result.reason_code).toBe('BROKER_HTTP_503');
  });

  it('parseSession rejects a session missing required fields (fail closed)', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession({ access_token: 'a' })).toBeNull(); // no refresh
    expect(parseSession({ access_token: 'a', refresh_token: 'r', user: {} })).toBeNull(); // no email
    const ok = parseSession({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
      user: { id: 'u', email: 'x@y.z', user_metadata: { name: 'X Y', company: 'Z' } },
    });
    expect(ok?.user.email).toBe('x@y.z');
    expect(ok?.user.name).toBe('X Y');
    expect(ok?.user.company).toBe('Z');
    expect(ok?.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
