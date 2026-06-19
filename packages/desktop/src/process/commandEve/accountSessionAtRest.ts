/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Keychain-at-rest store for the Command EVE ACCOUNT SESSION (GoTrue tokens).
 *
 * Mirrors `licenseWireAtRest.ts`: the session JSON (access + refresh token +
 * expiry + minimal user) is written ONLY as a `keychain:v1:<ciphertext>` ref
 * via the {@link encryptSecret} seam (Electron safeStorage). FAIL CLOSED: when
 * the keychain is unavailable we DROP the value rather than write plaintext.
 *
 * SECURITY:
 *  - Stored LOCAL ONLY, 0600, in the same command-eve-runtime entitlement dir
 *    as the entitlement + license-wire records. Never egressed, never logged.
 *  - The access/refresh tokens are bearer credentials; they live decrypted only
 *    in memory for the lifetime of a call and must NEVER be re-persisted in
 *    plaintext or returned to the renderer.
 *
 * REFRESH: `getFreshSession` transparently refreshes a near-expiry (or expired)
 * access token via the GoTrue `token?grant_type=refresh_token` endpoint, writes
 * the rotated session back (keychain), and returns the fresh tokens. A dead /
 * revoked refresh token fails closed (the caller must require re-login).
 *
 * This module is fs + keychain + (optional) network only, all injectable, so it
 * is unit-testable in a plain Node (vitest) environment.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decryptSecret, encryptSecret, isKeychainAvailable, isKeychainRef } from '@/common/config/keychain';
import {
  COMMAND_EVE_SUPABASE_URL,
  parseSession,
  resolveSupabaseAnonKey,
  type CommandEveAccountSession,
} from './desktopAuthLoopback';

/** Same runtime dir family the entitlement + license-wire records live in. */
const ENTITLEMENT_STATE_DIR = 'entitlement';
const SESSION_FILE = 'session.enc';

/** GoTrue token endpoint (refresh + logout share the project base). */
export const GOTRUE_TOKEN_URL = `${COMMAND_EVE_SUPABASE_URL}/auth/v1/token`;
export const GOTRUE_LOGOUT_URL = `${COMMAND_EVE_SUPABASE_URL}/auth/v1/logout`;

/** Refresh when the access token is within this window of expiry (seconds). */
const REFRESH_SKEW_SECONDS = 60;

interface SessionRecord {
  version: 'command-eve-account-session/v0';
  /** A `keychain:v1:` ref of the JSON-stringified session. NEVER plaintext. */
  session_ref: string;
  stored_at: string;
}

function entitlementStateDir(userDataPath: string): string {
  const root = path.resolve(userDataPath || path.join(os.homedir(), '.command-eve'));
  return path.join(root, 'command-eve-runtime', ENTITLEMENT_STATE_DIR);
}

function sessionPath(userDataPath: string): string {
  return path.join(entitlementStateDir(userDataPath), SESSION_FILE);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function writeJsonAtomic600(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, file);
}

function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Store / read
// ---------------------------------------------------------------------------

export interface StoreSessionResult {
  ok: boolean;
  outcome: 'stored' | 'invalid' | 'dropped-fail-closed';
  reason_code?: string;
}

/**
 * Persist the account session, encrypted at rest. FAIL CLOSED: an invalid
 * session is a no-op; an unavailable/erroring keychain DROPS the value (never
 * writes plaintext) and reports `dropped-fail-closed`.
 */
export function storeAccountSession(
  userDataPath: string,
  session: CommandEveAccountSession,
  now: () => Date = () => new Date()
): StoreSessionResult {
  if (!session || !session.access_token || !session.refresh_token || !session.user?.email) {
    return { ok: false, outcome: 'invalid' };
  }
  if (!isKeychainAvailable()) {
    return { ok: false, outcome: 'dropped-fail-closed', reason_code: 'KEYCHAIN_UNAVAILABLE' };
  }
  const enc = encryptSecret(JSON.stringify(session));
  if (!enc.ok || !enc.ref) {
    return { ok: false, outcome: 'dropped-fail-closed', reason_code: enc.reason_code ?? 'KEYCHAIN_ENCRYPT_FAILED' };
  }
  const record: SessionRecord = {
    version: 'command-eve-account-session/v0',
    session_ref: enc.ref,
    stored_at: now().toISOString(),
  };
  writeJsonAtomic600(sessionPath(userDataPath), record);
  return { ok: true, outcome: 'stored' };
}

export interface ReadSessionResult {
  ok: boolean;
  session?: CommandEveAccountSession;
  outcome: 'decrypted' | 'absent' | 'malformed' | 'decrypt-failed';
  reason_code?: string;
}

/**
 * Read the account session back (decrypted in memory). FAIL CLOSED: a
 * missing/malformed file or a decrypt error returns `ok: false` with NO
 * `session`. The returned value must NEVER be re-persisted in plaintext.
 */
export function readAccountSession(userDataPath: string): ReadSessionResult {
  const record = readJsonFile<SessionRecord>(sessionPath(userDataPath));
  if (!record || typeof record !== 'object' || typeof record.session_ref !== 'string') {
    return { ok: false, outcome: 'absent' };
  }
  if (!isKeychainRef(record.session_ref)) {
    return { ok: false, outcome: 'malformed', reason_code: 'SESSION_NOT_A_REF' };
  }
  const dec = decryptSecret(record.session_ref);
  if (!dec.ok || typeof dec.value !== 'string' || dec.value.length === 0) {
    return { ok: false, outcome: 'decrypt-failed', reason_code: dec.reason_code ?? 'KEYCHAIN_DECRYPT_FAILED' };
  }
  let parsedRaw: Record<string, unknown> | null;
  try {
    parsedRaw = JSON.parse(dec.value) as Record<string, unknown>;
  } catch {
    return { ok: false, outcome: 'malformed', reason_code: 'SESSION_JSON_INVALID' };
  }
  const session = parseSession(parsedRaw);
  if (!session) {
    return { ok: false, outcome: 'malformed', reason_code: 'SESSION_SHAPE_INVALID' };
  }
  return { ok: true, session, outcome: 'decrypted' };
}

/** True iff a (ref) session record exists on disk. Does NOT decrypt. */
export function hasAccountSession(userDataPath: string): boolean {
  const record = readJsonFile<SessionRecord>(sessionPath(userDataPath));
  return Boolean(record && typeof record.session_ref === 'string' && isKeychainRef(record.session_ref));
}

/** Delete the session record (logout). Idempotent; never throws. */
export function clearAccountSession(userDataPath: string): void {
  try {
    const file = sessionPath(userDataPath);
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Expiry + refresh
// ---------------------------------------------------------------------------

/**
 * True iff the access token is expired OR within the refresh skew window. A
 * zero/absent `expires_at` is treated as "needs refresh" (unknown ⇒ refresh).
 */
export function isExpired(session: CommandEveAccountSession, now: () => Date = () => new Date()): boolean {
  const nowSec = Math.floor(now().getTime() / 1000);
  if (!session.expires_at || session.expires_at <= 0) return true;
  return nowSec >= session.expires_at - REFRESH_SKEW_SECONDS;
}

export interface FreshSessionResult {
  ok: boolean;
  session?: CommandEveAccountSession;
  /** True when a refresh round-trip actually happened (vs the cached token still valid). */
  refreshed?: boolean;
  reason_code?: string;
  message?: string;
}

export interface GetFreshSessionDeps {
  fetch?: typeof fetch;
  anonKey?: string;
  now?: () => Date;
}

/**
 * Return a non-expired session, refreshing via GoTrue when needed.
 *
 *   - No stored session ⇒ { ok:false, NO_SESSION }.
 *   - Stored + still valid ⇒ return it (refreshed:false), NO network.
 *   - Stored + near/over expiry ⇒ POST refresh_token to GoTrue; on success
 *     persist the rotated session (keychain) and return it (refreshed:true).
 *   - Refresh HTTP/network failure ⇒ fail closed (REFRESH_*). A 400/401 means a
 *     dead refresh token ⇒ the caller must require re-login.
 */
export async function getFreshSession(userDataPath: string, deps: GetFreshSessionDeps = {}): Promise<FreshSessionResult> {
  const fetchImpl = deps.fetch ?? (globalThis.fetch as typeof fetch);
  const anonKey = deps.anonKey ?? resolveSupabaseAnonKey();
  const now = deps.now ?? (() => new Date());

  const read = readAccountSession(userDataPath);
  if (!read.ok || !read.session) {
    return { ok: false, reason_code: read.reason_code ?? 'NO_SESSION' };
  }
  const session = read.session;

  if (!isExpired(session, now)) {
    return { ok: true, session, refreshed: false };
  }

  // Refresh.
  let response: Response;
  try {
    response = await fetchImpl(`${GOTRUE_TOKEN_URL}?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
  } catch (err) {
    return {
      ok: false,
      reason_code: 'REFRESH_NETWORK',
      message: err instanceof Error ? err.message : 'refresh network error',
    };
  }

  if (!response.ok) {
    // 400/401 ⇒ refresh token is dead/revoked. Caller requires re-login.
    return { ok: false, reason_code: `REFRESH_HTTP_${response.status}`, message: `refresh returned ${response.status}` };
  }

  const raw = (await response.json().catch((): null => null)) as Record<string, unknown> | null;
  const refreshed = parseSession(raw);
  if (!refreshed) {
    return { ok: false, reason_code: 'REFRESH_BAD_SESSION', message: 'refresh returned an unusable session.' };
  }
  // GoTrue refresh responses may omit the user block; carry the prior user
  // forward when the refresh omitted it (email is the binding identity).
  const merged: CommandEveAccountSession = {
    ...refreshed,
    user: refreshed.user?.email ? refreshed.user : session.user,
  };
  storeAccountSession(userDataPath, merged, now);
  return { ok: true, session: merged, refreshed: true };
}

/**
 * Best-effort GoTrue sign-out: POST /logout with the access token, then clear the
 * local session file regardless of the network outcome (logout must always
 * succeed locally). Never throws.
 */
export async function revokeAndClearSession(
  userDataPath: string,
  deps: { fetch?: typeof fetch; anonKey?: string } = {}
): Promise<void> {
  const fetchImpl = deps.fetch ?? (globalThis.fetch as typeof fetch);
  const anonKey = deps.anonKey ?? resolveSupabaseAnonKey();
  const read = readAccountSession(userDataPath);
  if (read.ok && read.session) {
    try {
      await fetchImpl(GOTRUE_LOGOUT_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${read.session.access_token}`,
        },
      });
    } catch {
      // Network failure on logout is non-fatal — we still clear locally.
    }
  }
  clearAccountSession(userDataPath);
}
