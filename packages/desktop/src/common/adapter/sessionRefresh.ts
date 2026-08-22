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
 * the failed request / reconnect the socket transparently. On failure the refresh
 * cookie is also dead and the session is genuinely over.
 *
 * Concurrency: one expired access cookie fails many in-flight API calls and both
 * realtime sockets at the same instant. A module-level single-flight collapses
 * them into ONE POST, mirroring the backend `RefreshCoalescer` and staying under
 * the refresh endpoint's rate limiter. Callers that lose the race await the same
 * in-flight result.
 *
 * This module has no import-time side effects, so both `httpBridge.ts` and
 * `browser.ts` can share it without bootstrapping each other's WebSocket.
 */

import { resolveCoreCsrfToken } from './httpBridge';

/** WebSocket close code the backend uses for auth policy violations (RFC 6455 §7.4.1). */
export const WS_CLOSE_POLICY_VIOLATION = 1008;

const REFRESH_ENDPOINT = '/api/auth/refresh';

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

let inFlight: Promise<boolean> | null = null;

/**
 * Attempt a single silent session refresh. Concurrent callers share one POST.
 *
 * Resolves `true` when the session was renewed (fresh cookies now set), `false`
 * when the refresh token is missing/expired or the request failed. Never throws —
 * callers branch on the boolean and fall back to their existing failure handling.
 */
export function refreshSession(): Promise<boolean> {
  if (!isWebUiBrowserMode()) {
    // Desktop/local mode has no refreshable cookie session.
    return Promise.resolve(false);
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = performRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function performRefresh(): Promise<boolean> {
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
    const response = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      // Same-origin request: the browser attaches the HttpOnly refresh cookie
      // (scoped to Path=/api/auth/refresh). No body is needed — the backend reads
      // the cookie and only falls back to a body token for legacy native clients.
      credentials: 'include',
      headers,
    });
    return response.ok;
  } catch {
    // Network failure — treat as "not refreshed" so callers keep their existing
    // failure handling rather than assuming a live session.
    return false;
  }
}
