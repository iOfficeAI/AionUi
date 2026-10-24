/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebUI browser-mode session refresh.
 *
 * The desktop app runs the backend in local mode (no tokens), but the remote
 * WebUI (phone browser) authenticates with a short-lived access cookie plus a
 * long-lived refresh cookie (HttpOnly, `Path=/api/auth/refresh`). When the access
 * cookie expires the backend answers API calls with `401` and closes realtime
 * sockets with code `1008` (`REALTIME_AUTH_EXPIRED`). Before the #4124 fix the
 * client had no refresh step, so it either surfaced the 401 or blindly
 * reconnected the socket with the same dead cookie — an unthrottled loop that
 * ended in a hard kick to `/login`.
 *
 * `refreshSession()` performs the missing step: `POST /api/auth/refresh`, which
 * the browser answers by attaching the HttpOnly refresh cookie. On success the
 * backend `Set-Cookie`s a fresh access + refresh pair, so the caller can replay
 * the failed request / reconnect the socket transparently.
 *
 * ## Why a failed refresh needs more than `false`
 *
 * A refresh fails for two very different reasons, and #4155 is what happens when
 * they are conflated:
 *
 * - The refresh credential itself is dead (`401`/`403`), or was never issued —
 *   a paired browser holds only an access cookie. Re-asking can never succeed,
 *   so every subsequent `401` firing another POST is a storm against a
 *   rate-limited endpoint. This latches: `expired` is returned without a request
 *   until an explicit re-auth calls `resetSessionRefresh()`.
 * - The refresh could not be reached or concluded (network error, `429`, `5xx`).
 *   The session may well still be good, so kicking the user to `/login` would
 *   destroy a live session over a transient blip. This backs off instead:
 *   `unavailable` is returned without a request until the cooldown elapses.
 *
 * Callers that only need "can I replay now?" keep using the boolean
 * `refreshSession()`; callers that must choose between *reconnect*, *re-auth*
 * and *retry later* use `refreshSessionOutcome()`.
 *
 * Concurrency: one expired access cookie fails many in-flight API calls and both
 * realtime sockets at the same instant. A module-level single-flight collapses
 * them into ONE POST, mirroring the backend `RefreshCoalescer`. Callers that lose
 * the race await the same in-flight result.
 *
 * This module has no import-time side effects, so both `httpBridge.ts` and
 * `browser.ts` can share it without bootstrapping each other's WebSocket.
 */

import { resolveCoreCsrfToken } from './httpBridge';

/** WebSocket close code the backend uses for auth policy violations (RFC 6455 §7.4.1). */
export const WS_CLOSE_POLICY_VIOLATION = 1008;

/**
 * Why a refresh attempt ended, so callers can pick the right recovery.
 *
 * - `refreshed`   — fresh cookies are set; replay the request / reconnect now.
 * - `expired`     — the refresh credential is dead or absent; only re-auth helps.
 *                   Latched: further calls return this without issuing a request.
 * - `unavailable` — inconclusive (offline, rate-limited, backend error, or no
 *                   cookie session in this runtime at all). The session may still
 *                   be valid — retry later, do not sign the user out.
 */
export type SessionRefreshOutcome = 'refreshed' | 'expired' | 'unavailable';

const REFRESH_ENDPOINT = '/api/auth/refresh';

/** First cooldown after an inconclusive refresh; doubles up to the cap. */
const BASE_COOLDOWN_MS = 1_000;
const MAX_COOLDOWN_MS = 30_000;

/**
 * WebUI browser mode = a real DOM with no Electron preload port. Only here do
 * cookie-based sessions (and thus refresh) exist; the desktop renderer talks to
 * a local-mode backend that needs no tokens. Kept in sync with the identical
 * check in `httpBridge.ts` (duplicated rather than imported to avoid coupling the
 * refresh primitive to the HTTP bridge).
 */
function isWebUiBrowserMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    !(window as { __backendPort?: number }).__backendPort
  );
}

let inFlight: Promise<SessionRefreshOutcome> | null = null;
/** Set once the backend rejects the refresh credential itself. Cleared on re-auth. */
let sessionExpired = false;
/** Epoch ms before which an inconclusive refresh must not be retried. */
let cooldownUntil = 0;
let cooldownMs = BASE_COOLDOWN_MS;

/**
 * True once a refresh has come back `401`/`403` — the session cannot be revived
 * without a fresh login. Reconnect loops consult this so they stop dialling a
 * backend that will only close them again.
 */
export function isSessionExpired(): boolean {
  return sessionExpired;
}

/**
 * Clear the expiry latch and the cooldown. Call after a successful re-auth so
 * refresh, reconnects and replays resume for the new session.
 */
export function resetSessionRefresh(): void {
  sessionExpired = false;
  cooldownUntil = 0;
  cooldownMs = BASE_COOLDOWN_MS;
}

/**
 * Attempt a single silent session refresh, reporting *why* it ended.
 * Concurrent callers share one POST; latched and cooling-down callers get an
 * answer without any request at all.
 */
export function refreshSessionOutcome(): Promise<SessionRefreshOutcome> {
  if (!isWebUiBrowserMode()) {
    // Desktop/local mode has no refreshable cookie session — nothing failed, so
    // this is not an `expired` verdict callers should sign the user out over.
    return Promise.resolve('unavailable');
  }
  if (sessionExpired) {
    return Promise.resolve('expired');
  }
  if (inFlight) {
    return inFlight;
  }
  if (Date.now() < cooldownUntil) {
    return Promise.resolve('unavailable');
  }
  inFlight = performRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Attempt a single silent session refresh. Concurrent callers share one POST.
 *
 * Resolves `true` when the session was renewed (fresh cookies now set), `false`
 * for every other outcome. Never throws — callers branch on the boolean and fall
 * back to their existing failure handling. Use `refreshSessionOutcome()` when
 * "expired" and "could not tell" need different handling.
 */
export async function refreshSession(): Promise<boolean> {
  return (await refreshSessionOutcome()) === 'refreshed';
}

async function performRefresh(): Promise<SessionRefreshOutcome> {
  let response: { ok: boolean; status?: number };
  try {
    // Attach the CSRF double-submit header when a token is available. The
    // open-source WebUI has no CSRF layer yet (M6 removed it, M7 restores it), so
    // resolveCoreCsrfToken() returns '' and no header is sent; the aionpro superset
    // resolves a real token here and its backend enforces the check. The matching
    // cookie, when one exists, rides `credentials: 'include'`.
    const headers: Record<string, string> = {};
    const csrfToken = resolveCoreCsrfToken();
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
    response = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      // Same-origin request: the browser attaches the HttpOnly refresh cookie
      // (scoped to Path=/api/auth/refresh). No body is needed — the backend reads
      // the cookie and only falls back to a body token for legacy native clients.
      credentials: 'include',
      headers,
    });
  } catch {
    // Offline / DNS / connection reset — says nothing about the session.
    return enterCooldown();
  }

  if (response.ok) {
    resetSessionRefresh();
    return 'refreshed';
  }

  // The backend actively rejected the refresh credential: it is dead or was
  // never issued. Latch so the next 401 does not spend another POST on it.
  if (response.status === 401 || response.status === 403) {
    sessionExpired = true;
    return 'expired';
  }

  // 429 / 5xx / anything else — inconclusive, so back off and try again later
  // rather than concluding the session is over.
  return enterCooldown();
}

function enterCooldown(): SessionRefreshOutcome {
  cooldownUntil = Date.now() + cooldownMs;
  cooldownMs = Math.min(cooldownMs * 2, MAX_COOLDOWN_MS);
  return 'unavailable';
}
