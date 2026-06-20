/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * In-app email/password account auth (MAIN process).
 *
 * Founder decision (HG-4, 2026-06-20): allow login/register directly in the app —
 * a deliberate reversal of the earlier "credentials never touch the Electron app"
 * rule, taken because the browser-loopback's server half (the /auth/desktop page +
 * the desktop-auth-broker function) is not deployed. The browser-loopback
 * (`desktopAuthLoopback.ts`) is KEPT for a future OAuth/2FA lane.
 *
 * Security posture:
 *  - This runs ONLY in MAIN. The renderer passes `{intent,email,password}` over the
 *    contextBridge; the anon key, the GoTrue round-trip, the session, and the
 *    keychain-at-rest all stay here. Tokens/passwords NEVER cross back to the
 *    renderer (the bridge result carries only a gate status + non-secret identity).
 *  - The password is held only transiently for the single fetch; it is NEVER
 *    persisted and NEVER logged.
 *  - The verified session is fed into the EXACT same post-session orchestrator the
 *    loopback uses (`activateEntitlementFromSession`) — entitlement-core, keychain,
 *    my-license and the fail-closed route guard are unchanged. Auth only mints a
 *    session; the structural entitlement gate stays the real gate.
 *
 * GoTrue REST mirror of the web reference client (apps/eve-landing-agentur/src/lib/auth.ts):
 *  - login    → POST /auth/v1/token?grant_type=password
 *  - register → POST /auth/v1/signup
 * Response is normalized by the EXISTING `parseSession()` (no new parser).
 */

import {
  COMMAND_EVE_SUPABASE_URL,
  parseSession,
  resolveSupabaseAnonKey,
  type CommandEveAccountSession,
  type DesktopAuthIntent,
} from './desktopAuthLoopback';

const LOGIN_URL = `${COMMAND_EVE_SUPABASE_URL}/auth/v1/token?grant_type=password`;
const SIGNUP_URL = `${COMMAND_EVE_SUPABASE_URL}/auth/v1/signup`;

export interface PasswordGrantResult {
  ok: boolean;
  session?: CommandEveAccountSession;
  /** A short, user-safe code the renderer localizes. NEVER contains credentials. */
  reason_code?: string;
}

/** Injectable seams so the whole flow runs in vitest with no real network / no env. */
export interface PasswordGrantDeps {
  fetch?: typeof fetch;
  anonKey?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Map a GoTrue error payload to a short, user-safe code (mirrors the web client's
 * `authErrorCode`). Deliberately coarse so a message never discloses which emails
 * exist beyond what GoTrue itself returns (invalid_credentials / email_not_confirmed
 * stay generic to the UI). Reads only error text — never echoes credentials.
 */
export function mapGoTrueError(status: number, json: unknown): string {
  const j = (json && typeof json === 'object' ? (json as Record<string, unknown>) : {}) as Record<string, unknown>;
  const raw =
    (typeof j.error_description === 'string' && j.error_description) ||
    (typeof j.msg === 'string' && j.msg) ||
    (typeof j.message === 'string' && j.message) ||
    (typeof j.error === 'string' && j.error) ||
    '';
  const msg = raw.toLowerCase();
  if (status === 429) return 'rate_limited';
  if (msg.includes('already registered')) return 'email_taken';
  if (msg.includes('invalid login')) return 'invalid_credentials';
  if (msg.includes('email not confirmed')) return 'email_not_confirmed';
  if (msg.includes('password should be at least') || msg.includes('weak password') || msg.includes('password is too')) {
    return 'weak_password';
  }
  if (status === 400 || status === 401 || status === 422) return 'invalid_credentials';
  return 'AUTH_FAILED';
}

/**
 * Run an email/password GoTrue grant in MAIN and return a normalized session.
 *
 * Returns `{ok:false, reason_code}` on any failure (bad creds, taken email, weak
 * password, rate limit, network, or — for register with email-confirmation ON —
 * `EMAIL_CONFIRMATION_REQUIRED`, since signup then yields no session). Never throws
 * the credential, never logs it.
 */
export async function passwordGrant(
  intent: DesktopAuthIntent,
  email: string,
  password: string,
  deps: PasswordGrantDeps = {}
): Promise<PasswordGrantResult> {
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  if (!cleanEmail || !password) return { ok: false, reason_code: 'FIELDS_REQUIRED' };

  const fetchImpl = deps.fetch ?? fetch;
  const anonKey = deps.anonKey ?? resolveSupabaseAnonKey(deps.env);
  const url = intent === 'register' ? SIGNUP_URL : LOGIN_URL;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password }),
    });
  } catch {
    return { ok: false, reason_code: 'AUTH_NETWORK' };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    return { ok: false, reason_code: mapGoTrueError(res.status, json) };
  }

  const session = parseSession(json as Record<string, unknown> | null);
  if (!session) {
    // Login should always return a session on 2xx. For register, a 2xx with no
    // access_token means email-confirmation is ON ⇒ the user must confirm first.
    return { ok: false, reason_code: intent === 'register' ? 'EMAIL_CONFIRMATION_REQUIRED' : 'AUTH_SESSION_INVALID' };
  }
  return { ok: true, session };
}
