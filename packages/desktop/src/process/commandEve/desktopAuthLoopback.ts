/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE desktop account auth — browser-loopback (PKCE S256) MAIN-process core.
 *
 * The desktop never holds a password or a card. To "log in" / "register" it
 * opens the user's real browser at the web `/auth/desktop` page with a PKCE
 * challenge + a one-time `state`, and listens on a throwaway loopback HTTP
 * server bound to 127.0.0.1 for the redirect. The web page (once shipped) signs
 * the user in via the normal web flow, then redirects back to
 * `http://127.0.0.1:<port>/callback?code=<one_time_code>&state=<state>`. We
 * verify `state` is byte-equal BEFORE touching anything, then exchange the
 * one-time code for a Supabase session by POSTing it (with the PKCE
 * `code_verifier`) to the `desktop-auth-broker` Edge Function.
 *
 * SECURITY POSTURE (all enforced here):
 *   - PKCE S256: verifier = base64url(32–64 random bytes); challenge =
 *     base64url(sha256(verifier)); state = base64url(32 random bytes). The
 *     verifier and state live ONLY in memory for the lifetime of one attempt —
 *     never written to disk, never logged, never returned to the renderer.
 *   - The loopback server binds to 127.0.0.1 ONLY (never 0.0.0.0) on an
 *     ephemeral port (`listen(0)`), serves exactly ONE request and then closes,
 *     and has a hard 5-minute timeout that tears everything down.
 *   - `state` is compared with a constant-time byte-equal check BEFORE the code
 *     is read or the success page is served; a mismatch aborts immediately.
 *   - An `error`/`error_description` param from the web page is surfaced as a
 *     typed failure (no token exchange attempted).
 *
 * Everything I/O is injectable (http server factory, fetch, openExternal,
 * randomBytes, clock) so this module is fully unit-testable in a plain Node
 * (vitest) environment with NO Electron and NO real network.
 */

import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ---------------------------------------------------------------------------
// Supabase project + endpoints (same project as eve-inference / credits-status)
// ---------------------------------------------------------------------------

/** Supabase project base URL. Same project the EVE Inference function lives in. */
export const COMMAND_EVE_SUPABASE_URL = 'https://unvbeothoimlzlolxucl.supabase.co';

/**
 * The desktop-auth-broker Edge Function — exchanges a one-time browser code (+
 * the PKCE verifier) for a GoTrue session. Called with the project ANON key as
 * `apikey` and NO Authorization header (the broker mints the session).
 */
export const DESKTOP_AUTH_BROKER_URL = `${COMMAND_EVE_SUPABASE_URL}/functions/v1/desktop-auth-broker`;

/** Web page that drives the human login/register. NOTE: not shipped yet (paste-fallback covers this). */
export const DESKTOP_AUTH_WEB_URL = 'https://command-eve.com/auth/desktop';

/**
 * Project ANON (publishable) key, used as the `apikey` header for the broker
 * and GoTrue. NOT a secret (it is the public anon key shipped in every web
 * client) — but it is environment-overridable so a different project / a future
 * rotation can be wired without a rebuild. Empty by default: the broker is not
 * deployed yet, so the loopback exchange returns BROKER_HTTP_* until both the
 * web page and the broker are live. Tests inject the key + fetch directly.
 */
export function resolveSupabaseAnonKey(env: NodeJS.ProcessEnv = process.env): string {
  return env.COMMAND_EVE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

export interface PkcePair {
  /** The high-entropy secret kept in memory and sent to the broker on exchange. */
  verifier: string;
  /** base64url(sha256(verifier)) — sent to the web page in the URL. */
  challenge: string;
  /** Always 'S256'. */
  method: 'S256';
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a PKCE S256 pair. `verifierBytes` is clamped to the RFC-7636 entropy
 * window (32–64 bytes ⇒ a 43–86 char base64url verifier). `randomBytes` is
 * injectable for deterministic tests.
 */
export function createPkcePair(
  verifierBytes = 48,
  randomBytes: (n: number) => Buffer = crypto.randomBytes
): PkcePair {
  const n = Math.max(32, Math.min(64, Math.floor(verifierBytes)));
  const verifier = base64url(randomBytes(n));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge, method: 'S256' };
}

/** Generate the one-time `state` token: base64url(32 random bytes). */
export function createState(randomBytes: (n: number) => Buffer = crypto.randomBytes): string {
  return base64url(randomBytes(32));
}

/**
 * Constant-time byte-equal comparison for the `state` echo. Returns false on any
 * length mismatch or non-string input WITHOUT leaking length via early timing.
 */
export function stateEquals(expected: string, received: unknown): boolean {
  if (typeof received !== 'string' || expected.length === 0) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session shape (GoTrue) — what the broker returns and we persist at rest
// ---------------------------------------------------------------------------

export interface CommandEveAccountUser {
  id: string;
  email: string;
  /** Optional display name from user_metadata (web collects it). */
  name?: string;
  company?: string;
}

export interface CommandEveAccountSession {
  access_token: string;
  refresh_token: string;
  /** Absolute UNIX seconds the access_token expires at (GoTrue `expires_at`). */
  expires_at: number;
  token_type: string;
  user: CommandEveAccountUser;
}

// ---------------------------------------------------------------------------
// Loopback flow
// ---------------------------------------------------------------------------

export type DesktopAuthIntent = 'login' | 'register';

export interface DesktopAuthLoopbackResult {
  ok: boolean;
  session?: CommandEveAccountSession;
  reason_code?: string;
  message?: string;
}

/** Injectable seams so the whole flow runs with no Electron / no real network. */
export interface DesktopAuthLoopbackDeps {
  /** Opens the system browser (Electron `shell.openExternal`). */
  openExternal: (url: string) => void | Promise<void>;
  /** Network fetch (defaults to global fetch). */
  fetch?: typeof fetch;
  /** http.createServer factory (defaults to node:http). */
  createServer?: typeof http.createServer;
  /** Injectable randomness for PKCE + state. */
  randomBytes?: (n: number) => Buffer;
  /** Project anon key override (else resolved from env). */
  anonKey?: string;
  /** Hard timeout in ms (default 5 min). */
  timeoutMs?: number;
  /** Bind host — ALWAYS 127.0.0.1 in production; exposed only so tests can assert it. */
  host?: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const LOOPBACK_HOST = '127.0.0.1';

/** Minimal self-contained success page shown in the browser tab after callback. */
function successHtml(): string {
  return [
    '<!doctype html><html lang="de"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Command EVE</title>',
    '<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b0b0f;color:#f4f4f5}',
    '.card{text-align:center;max-width:420px;padding:40px}',
    '.glyph{font-size:42px;margin-bottom:16px}h1{font-size:20px;font-weight:600;margin:0 0 8px}',
    'p{color:#a1a1aa;font-size:14px;line-height:1.5;margin:0}</style></head><body>',
    '<div class="card"><div class="glyph">⌘</div>',
    '<h1>Du bist angemeldet.</h1>',
    '<p>Du kannst dieses Fenster schließen und zu Command EVE zurückkehren.</p>',
    '</div></body></html>',
  ].join('');
}

/** Error page (still 200 so the tab renders) when the web page returned an error. */
function errorHtml(message: string): string {
  const safe = String(message).replace(/[<>&]/g, '');
  return [
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Command EVE</title>',
    '<style>body{font-family:-apple-system,sans-serif;background:#0b0b0f;color:#f4f4f5;',
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0}',
    '.card{text-align:center;max-width:420px;padding:40px}p{color:#a1a1aa}</style></head><body>',
    '<div class="card"><h1>Anmeldung fehlgeschlagen</h1>',
    `<p>${safe}</p><p>Bitte kehre zur App zurück und versuche es erneut.</p></div></body></html>`,
  ].join('');
}

/**
 * Run ONE browser-loopback PKCE attempt and return the exchanged session.
 *
 * Lifecycle:
 *   1. mint verifier/challenge/state (in memory only);
 *   2. start a single-request loopback server on 127.0.0.1:<ephemeral>;
 *   3. openExternal the web `/auth/desktop` URL with intent + redirect_uri +
 *      state + code_challenge (+ method);
 *   4. on the FIRST request to `/callback`: byte-equal the state FIRST, then
 *      read the code (or surface an error param), serve the success/error HTML,
 *      and close the server;
 *   5. POST { action:'redeem', one_time_code, code_verifier } to the broker with
 *      the anon `apikey` header (no Authorization), parse the returned session.
 *
 * A 5-minute timeout, a server `error`, or any abort rejects with a typed
 * failure and always closes the server.
 */
export async function runDesktopAuthLoopback(
  intent: DesktopAuthIntent,
  deps: DesktopAuthLoopbackDeps
): Promise<DesktopAuthLoopbackResult> {
  const createServer = deps.createServer ?? http.createServer;
  const fetchImpl = deps.fetch ?? (globalThis.fetch as typeof fetch);
  const randomBytes = deps.randomBytes ?? crypto.randomBytes;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const host = deps.host ?? LOOPBACK_HOST;
  const anonKey = deps.anonKey ?? resolveSupabaseAnonKey();

  // (1) In-memory-only secrets.
  const pkce = createPkcePair(48, randomBytes);
  const state = createState(randomBytes);

  // The captured code is resolved from the loopback callback; the exchange runs
  // AFTER the server has closed so the browser tab never waits on the network.
  const captured = await new Promise<{ ok: true; code: string } | { ok: false; reason_code: string; message?: string }>(
    (resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const server = createServer((req, res) => {
        try {
          // Only the callback path is handled; any other path 404s but does NOT
          // settle the attempt (lets stray probes pass without aborting).
          const url = new URL(req.url || '/', `http://${host}`);
          if (url.pathname !== '/callback') {
            res.statusCode = 404;
            res.end('not found');
            return;
          }

          const receivedState = url.searchParams.get('state');
          // (4) STATE FIRST — before reading code or serving any success page.
          if (!stateEquals(state, receivedState)) {
            res.statusCode = 400;
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(errorHtml('Sicherheitsprüfung fehlgeschlagen.'));
            finish({ ok: false, reason_code: 'STATE_MISMATCH', message: 'Loopback state did not match.' });
            return;
          }

          const errorParam = url.searchParams.get('error');
          if (errorParam) {
            const desc = url.searchParams.get('error_description') || errorParam;
            res.statusCode = 200;
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(errorHtml(desc));
            finish({ ok: false, reason_code: 'WEB_AUTH_ERROR', message: desc });
            return;
          }

          const code = url.searchParams.get('code');
          if (!code) {
            res.statusCode = 400;
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(errorHtml('Kein Anmelde-Code empfangen.'));
            finish({ ok: false, reason_code: 'NO_CODE', message: 'Callback carried no code.' });
            return;
          }

          res.statusCode = 200;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(successHtml());
          finish({ ok: true, code });
        } catch (err) {
          finish({
            ok: false,
            reason_code: 'CALLBACK_HANDLER_ERROR',
            message: err instanceof Error ? err.message : 'callback handler error',
          });
        }
      });

      function cleanup(): void {
        if (timer) clearTimeout(timer);
        try {
          server.close();
        } catch {
          // ignore
        }
      }

      function finish(value: { ok: true; code: string } | { ok: false; reason_code: string; message?: string }): void {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      }

      server.on('error', (err: Error) => {
        finish({ ok: false, reason_code: 'LOOPBACK_SERVER_ERROR', message: err.message });
      });

      // (2) Bind to loopback ONLY, ephemeral port.
      server.listen(0, host, () => {
        const address = server.address() as AddressInfo | null;
        if (!address || typeof address.port !== 'number') {
          finish({ ok: false, reason_code: 'LOOPBACK_NO_PORT', message: 'Could not bind a loopback port.' });
          return;
        }
        const port = address.port;
        const redirectUri = `http://${host}:${port}/callback`;

        // (3) Hand off to the browser.
        const authUrl =
          `${DESKTOP_AUTH_WEB_URL}?intent=${encodeURIComponent(intent)}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&state=${encodeURIComponent(state)}` +
          `&code_challenge=${encodeURIComponent(pkce.challenge)}` +
          `&code_challenge_method=S256`;
        Promise.resolve(deps.openExternal(authUrl)).catch((err: unknown) => {
          finish({
            ok: false,
            reason_code: 'OPEN_BROWSER_FAILED',
            message: err instanceof Error ? err.message : 'failed to open browser',
          });
        });

        // Hard timeout: tear everything down.
        timer = setTimeout(() => {
          finish({ ok: false, reason_code: 'AUTH_TIMEOUT', message: 'Login timed out after 5 minutes.' });
        }, timeoutMs);
        // Don't keep the event loop alive solely for the timeout.
        if (typeof timer.unref === 'function') timer.unref();
      });
    }
  );

  if (captured.ok !== true) {
    return { ok: false, reason_code: captured.reason_code, message: captured.message };
  }

  // (5) Exchange the one-time code for a session via the broker.
  return exchangeCodeForSession({
    code: captured.code,
    codeVerifier: pkce.verifier,
    fetchImpl,
    anonKey,
  });
}

/**
 * POST { action:'redeem', one_time_code, code_verifier } to the broker with the
 * project anon `apikey` (NO Authorization header). Parses + validates the GoTrue
 * session shape. Network/HTTP/parse failures map to typed reason codes.
 */
export async function exchangeCodeForSession(args: {
  code: string;
  codeVerifier: string;
  fetchImpl: typeof fetch;
  anonKey: string;
  url?: string;
}): Promise<DesktopAuthLoopbackResult> {
  const { code, codeVerifier, fetchImpl, anonKey } = args;
  const url = args.url ?? DESKTOP_AUTH_BROKER_URL;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: anonKey,
        Accept: 'application/json',
      },
      body: JSON.stringify({ action: 'redeem', one_time_code: code, code_verifier: codeVerifier }),
    });
  } catch (err) {
    return {
      ok: false,
      reason_code: 'BROKER_NETWORK',
      message: err instanceof Error ? err.message : 'broker network error',
    };
  }

  if (!response.ok) {
    return { ok: false, reason_code: `BROKER_HTTP_${response.status}`, message: `broker returned ${response.status}` };
  }

  const raw = (await response.json().catch((): null => null)) as Record<string, unknown> | null;
  const session = parseSession(raw);
  if (!session) {
    return { ok: false, reason_code: 'BROKER_BAD_SESSION', message: 'broker returned an unusable session.' };
  }
  return { ok: true, session };
}

/**
 * Validate + normalize a GoTrue-shaped session object. The broker may return the
 * session at the top level or nested under `session`. Returns null on any
 * missing required field so callers FAIL CLOSED rather than persist a partial.
 */
export function parseSession(raw: Record<string, unknown> | null | undefined): CommandEveAccountSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = (raw.session && typeof raw.session === 'object' ? (raw.session as Record<string, unknown>) : raw) as Record<
    string,
    unknown
  >;

  const access_token = typeof root.access_token === 'string' ? root.access_token : '';
  const refresh_token = typeof root.refresh_token === 'string' ? root.refresh_token : '';
  if (!access_token || !refresh_token) return null;

  // expires_at preferred (absolute UNIX seconds); else derive from expires_in.
  let expires_at = 0;
  if (typeof root.expires_at === 'number' && Number.isFinite(root.expires_at)) {
    expires_at = Math.floor(root.expires_at);
  } else if (typeof root.expires_in === 'number' && Number.isFinite(root.expires_in)) {
    expires_at = Math.floor(Date.now() / 1000) + Math.floor(root.expires_in);
  }

  const userRaw = (root.user && typeof root.user === 'object' ? (root.user as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const metaRaw = (userRaw.user_metadata && typeof userRaw.user_metadata === 'object'
    ? (userRaw.user_metadata as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const id = typeof userRaw.id === 'string' ? userRaw.id : '';
  const email = typeof userRaw.email === 'string' ? userRaw.email : '';
  if (!email) return null;

  const name =
    typeof metaRaw.name === 'string'
      ? metaRaw.name
      : typeof metaRaw.full_name === 'string'
        ? (metaRaw.full_name as string)
        : undefined;
  const company = typeof metaRaw.company === 'string' ? metaRaw.company : undefined;

  return {
    access_token,
    refresh_token,
    expires_at,
    token_type: typeof root.token_type === 'string' ? root.token_type : 'bearer',
    user: { id, email, ...(name ? { name } : {}), ...(company ? { company } : {}) },
  };
}
