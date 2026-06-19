/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE account-auth ORCHESTRATOR (main-process core).
 *
 * Glue between a freshly-obtained (or silently-resumed) account session and the
 * EXISTING entitlement gate. After we hold a valid GoTrue session this:
 *
 *   1. ensures a LOCAL registration exists (`registerTenant`) — consent is
 *      collected on the WEB per founder decision, so we pass `consent: true`;
 *      name/company default from the user's email when the web did not supply
 *      display fields;
 *   2. POSTs `register-profile` (Bearer access_token) so the backend knows this
 *      device/user (idempotent server-side);
 *   3. POSTs `my-license` (Bearer access_token) to read the user's CEVE wire
 *      code. PENDING/empty is retried with backoff; if it never materializes the
 *      caller falls back to the manual paste path;
 *   4. feeds the code into the EXISTING `activateEntitlement` + `storeLicenseWire`
 *      path (same logic as the `entitlement-activate` bridge handler), so the
 *      gate opens exactly as it does for a pasted code.
 *
 * Everything network/fs/keychain is injectable so this is unit-testable in a
 * plain Node (vitest) environment with no Electron and no real network.
 */

import {
  activateEntitlement,
  getEntitlementStatus,
  readRegistration,
  registerTenant,
  type CommandEveEntitlementStatusResult,
} from './entitlementCore';
import { COMMAND_EVE_SUPABASE_URL, resolveSupabaseAnonKey, type CommandEveAccountSession } from './desktopAuthLoopback';

export const REGISTER_PROFILE_URL = `${COMMAND_EVE_SUPABASE_URL}/functions/v1/register-profile`;
export const MY_LICENSE_URL = `${COMMAND_EVE_SUPABASE_URL}/functions/v1/my-license`;

/** Backoff schedule (ms) for re-reading my-license while the code is PENDING. */
const DEFAULT_MY_LICENSE_BACKOFF_MS = [500, 1000, 2000, 4000];

// ---------------------------------------------------------------------------
// Profile derivation from email (web may not collect name/company)
// ---------------------------------------------------------------------------

/**
 * Derive a best-effort display name + company from an email when the web did not
 * supply them. `jane.doe@acme-corp.com` ⇒ name "Jane Doe", company "Acme Corp".
 * Generic free-mail domains (gmail/outlook/…) do NOT become a company; we fall
 * back to the local part so a real value is still stored.
 */
const FREEMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  'proton.me',
  'protonmail.com',
]);

function titleCase(part: string): string {
  return part
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function deriveProfileFromEmail(
  email: string,
  explicit?: { name?: string; company?: string }
): { name: string; company: string } {
  const trimmedEmail = (email || '').trim();
  const [localPartRaw, domainRaw] = trimmedEmail.split('@');
  const localPart = localPartRaw || 'user';
  const domain = (domainRaw || '').toLowerCase();

  const name = (explicit?.name || '').trim() || titleCase(localPart) || 'EVE User';

  let company = (explicit?.company || '').trim();
  if (!company) {
    if (domain && !FREEMAIL_DOMAINS.has(domain)) {
      company = titleCase(domain.replace(/\.[a-z.]+$/, ''));
    }
    if (!company) company = titleCase(localPart);
  }
  return { name: name || 'EVE User', company: company || 'EVE' };
}

// ---------------------------------------------------------------------------
// Backend calls (Bearer access_token)
// ---------------------------------------------------------------------------

export interface BackendCallDeps {
  fetch?: typeof fetch;
  anonKey?: string;
}

function authHeaders(accessToken: string, anonKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
}

/** POST register-profile. Non-fatal: a failure does not block activation. */
export async function postRegisterProfile(
  session: CommandEveAccountSession,
  registration: { tenant_id: string; name: string; company: string; email: string },
  deps: BackendCallDeps = {}
): Promise<{ ok: boolean; reason_code?: string }> {
  const fetchImpl = deps.fetch ?? (globalThis.fetch as typeof fetch);
  const anonKey = deps.anonKey ?? resolveSupabaseAnonKey();
  try {
    const response = await fetchImpl(REGISTER_PROFILE_URL, {
      method: 'POST',
      headers: authHeaders(session.access_token, anonKey),
      body: JSON.stringify({
        tenant_id: registration.tenant_id,
        name: registration.name,
        company: registration.company,
        email: registration.email,
      }),
    });
    if (!response.ok) return { ok: false, reason_code: `REGISTER_PROFILE_HTTP_${response.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason_code: err instanceof Error ? 'REGISTER_PROFILE_NETWORK' : 'REGISTER_PROFILE_NETWORK' };
  }
}

export interface MyLicenseResult {
  /** A usable CEVE wire code, when issued. */
  code?: string;
  /** True when the server says the license is still being provisioned. */
  pending: boolean;
  ok: boolean;
  reason_code?: string;
}

/**
 * POST my-license once. Parses { code } | { license_code } | { wire }. A null /
 * empty code with an explicit pending/status flag is reported `pending:true` so
 * the caller can back off and retry.
 */
export async function postMyLicenseOnce(
  session: CommandEveAccountSession,
  deps: BackendCallDeps = {}
): Promise<MyLicenseResult> {
  const fetchImpl = deps.fetch ?? (globalThis.fetch as typeof fetch);
  const anonKey = deps.anonKey ?? resolveSupabaseAnonKey();
  let response: Response;
  try {
    response = await fetchImpl(MY_LICENSE_URL, {
      method: 'POST',
      headers: authHeaders(session.access_token, anonKey),
      body: JSON.stringify({}),
    });
  } catch (err) {
    return { ok: false, pending: false, reason_code: err instanceof Error ? 'MY_LICENSE_NETWORK' : 'MY_LICENSE_NETWORK' };
  }
  if (!response.ok) {
    return { ok: false, pending: false, reason_code: `MY_LICENSE_HTTP_${response.status}` };
  }
  const raw = (await response.json().catch((): null => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') {
    return { ok: false, pending: false, reason_code: 'MY_LICENSE_BAD_BODY' };
  }
  const code =
    (typeof raw.code === 'string' && raw.code) ||
    (typeof raw.license_code === 'string' && raw.license_code) ||
    (typeof raw.wire === 'string' && raw.wire) ||
    '';
  if (code) {
    return { ok: true, pending: false, code };
  }
  const status = typeof raw.status === 'string' ? raw.status.toUpperCase() : '';
  const pending = raw.pending === true || status === 'PENDING' || status === 'PROVISIONING';
  return { ok: true, pending: pending || true, reason_code: pending ? 'MY_LICENSE_PENDING' : 'MY_LICENSE_NO_CODE' };
}

/** Sleep helper (injectable for tests). */
export type SleepFn = (ms: number) => Promise<void>;
const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read my-license with backoff while PENDING. Returns the first issued code, or
 * `{ ok:false, pending }` if it never materialized within the backoff budget
 * (caller falls back to manual paste).
 */
export async function fetchMyLicenseWithBackoff(
  session: CommandEveAccountSession,
  deps: BackendCallDeps & { backoffMs?: number[]; sleep?: SleepFn } = {}
): Promise<MyLicenseResult> {
  const backoff = deps.backoffMs ?? DEFAULT_MY_LICENSE_BACKOFF_MS;
  const sleep = deps.sleep ?? realSleep;
  let last: MyLicenseResult = { ok: false, pending: true, reason_code: 'MY_LICENSE_PENDING' };
  // attempt 0 immediately, then one retry per backoff entry.
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    last = await postMyLicenseOnce(session, deps);
    if (last.ok && last.code) return last;
    // A hard (non-pending) failure stops early — no point retrying a 401/network.
    if (!last.ok && !last.pending) return last;
    if (attempt < backoff.length) await sleep(backoff[attempt]);
  }
  return last;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface ActivateFromSessionResult {
  /** Final entitlement status (the gate reads this to decide unlock). */
  status: CommandEveEntitlementStatusResult;
  /** True iff a license code was successfully obtained AND activated. */
  activated: boolean;
  /** True iff my-license never yielded a code ⇒ the UI should show paste fallback. */
  needsPaste: boolean;
  reason_code?: string;
}

export interface ActivateFromSessionDeps extends BackendCallDeps {
  /** Persist the verified CEVE wire (keychain). Injected so the bridge wires the real storeLicenseWire. */
  storeLicenseWire: (userDataPath: string, wire: string) => void;
  backoffMs?: number[];
  sleep?: SleepFn;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

/**
 * Drive the full post-session flow and return the resulting gate status.
 *
 * Steps 1–4 above. Robust to backend gaps: register-profile failure is
 * non-fatal; a never-issued license leaves `needsPaste:true` and the gate
 * unchanged (so the renderer shows the paste fallback). Activation reuses the
 * EXACT entitlement core (`activateEntitlement` + injected `storeLicenseWire`).
 */
export async function activateEntitlementFromSession(
  userDataPath: string,
  session: CommandEveAccountSession,
  deps: ActivateFromSessionDeps
): Promise<ActivateFromSessionResult> {
  const options = { userDataPath, env: deps.env, now: deps.now };

  // (1) Ensure LOCAL registration. consent collected on web ⇒ pass true.
  const existing = readRegistration(userDataPath);
  if (!existing) {
    const profile = deriveProfileFromEmail(session.user.email, {
      name: session.user.name,
      company: session.user.company,
    });
    registerTenant(
      { name: profile.name, company: profile.company, email: session.user.email, consent: true },
      options
    );
  }
  const registration = readRegistration(userDataPath);
  if (!registration) {
    return {
      status: getEntitlementStatus(options),
      activated: false,
      needsPaste: true,
      reason_code: 'REGISTRATION_FAILED',
    };
  }

  // (2) register-profile (non-fatal).
  await postRegisterProfile(
    session,
    {
      tenant_id: registration.tenant_id,
      name: registration.name,
      company: registration.company,
      email: registration.email,
    },
    deps
  );

  // (3) my-license with backoff.
  const license = await fetchMyLicenseWithBackoff(session, {
    fetch: deps.fetch,
    anonKey: deps.anonKey,
    backoffMs: deps.backoffMs,
    sleep: deps.sleep,
  });

  if (!license.ok || !license.code) {
    return {
      status: getEntitlementStatus(options),
      activated: false,
      needsPaste: true,
      reason_code: license.reason_code ?? 'MY_LICENSE_PENDING',
    };
  }

  // (4) Activate via the EXISTING core + persist the wire (keychain).
  const activation = activateEntitlement({ code: license.code }, options);
  if (activation.ok) {
    try {
      deps.storeLicenseWire(userDataPath, license.code);
    } catch {
      // Non-fatal: never let wire persistence break the gate.
    }
  }

  return {
    status: getEntitlementStatus(options),
    activated: activation.ok,
    needsPaste: !activation.ok,
    reason_code: activation.ok ? undefined : (activation.reason_code as string) || 'ACTIVATION_FAILED',
  };
}
