/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * On first tarball launch, the aionui-backend's SQLite `users` table holds the
 * seeded `system_default_user` row with an empty password_hash. We probe
 * /api/auth/status; if `needs_setup === true`, ask the backend to generate and
 * persist a random password via POST /api/webui/reset-password and print it to
 * stdout so the user can log in.
 *
 * Mirrors Electron's maybeSeedInitialPassword in
 * packages/desktop/src/process/bridge/webuiBridge.ts:52-77 and the Bun dev
 * helper in scripts/webui.ts — when either changes, keep this in sync.
 *
 * The printed format is load-bearing: scripts/smoke-test-web-cli.sh greps for
 * "Generated initial admin password: <pw>". Do not change it without updating
 * that script.
 */

export type EnsureAdminPasswordDeps = {
  fetch: typeof fetch;
  log: (msg: string) => void;
  warn: (msg: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export type EnsureAdminPasswordOptions = {
  /** 127.0.0.1 port where aionui-backend listens (from WebHostHandle.backendPort). */
  backendPort: number;
  /** Total wait budget for /api/auth/status coming up. Default: 15s. */
  statusTimeoutMs?: number;
  /** Poll interval between /api/auth/status attempts. Default: 500ms. */
  statusPollIntervalMs?: number;
};

type AuthStatus = {
  needs_setup?: boolean;
  data?: { needs_setup?: boolean };
};

type ResetPasswordResponse = {
  data?: { new_password?: string };
  new_password?: string;
};

type SystemUserResponse = {
  data?: { username?: string } | null;
};

async function waitForStatus(
  deps: EnsureAdminPasswordDeps,
  url: string,
  budgetMs: number,
  intervalMs: number
): Promise<AuthStatus> {
  const deadline = deps.now() + budgetMs;
  let lastErr: unknown = undefined;
  while (deps.now() < deadline) {
    try {
      const res = await deps.fetch(url);
      if (res.ok) {
        return (await res.json()) as AuthStatus;
      }
      lastErr = new Error(`/api/auth/status returned ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await deps.sleep(intervalMs);
  }
  throw lastErr instanceof Error ? lastErr : new Error('/api/auth/status did not come up in time');
}

async function fetchAdminUsername(deps: EnsureAdminPasswordDeps, backendPort: number): Promise<string> {
  try {
    const res = await deps.fetch(`http://127.0.0.1:${backendPort}/api/auth/internal/users/system`);
    if (!res.ok) return 'admin';
    const json = (await res.json()) as SystemUserResponse;
    return json.data?.username || 'admin';
  } catch {
    return 'admin';
  }
}

/**
 * Probe backend auth state. On fresh install, POST reset-password and print the
 * generated credentials. Never throws — any failure is warned and the caller
 * continues starting the server (user can still see the login page, they just
 * need to run resetpass manually).
 */
export async function ensureAdminPassword(
  opts: EnsureAdminPasswordOptions,
  deps: EnsureAdminPasswordDeps
): Promise<void> {
  const timeoutMs = opts.statusTimeoutMs ?? 15_000;
  const intervalMs = opts.statusPollIntervalMs ?? 500;
  const base = `http://127.0.0.1:${opts.backendPort}`;

  let status: AuthStatus;
  try {
    status = await waitForStatus(deps, `${base}/api/auth/status`, timeoutMs, intervalMs);
  } catch (err) {
    deps.warn(`[aionui-web] could not verify admin credentials: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const needsSetup = status.needs_setup ?? status.data?.needs_setup ?? false;

  if (!needsSetup) {
    const username = await fetchAdminUsername(deps, opts.backendPort);
    deps.log(`[aionui-web] Log in with username "${username}". Forgot the password? Run \`bun run resetpass\`.`);
    return;
  }

  try {
    const resetRes = await deps.fetch(`${base}/api/webui/reset-password`, { method: 'POST' });
    if (!resetRes.ok) {
      deps.warn(`[aionui-web] /api/webui/reset-password returned ${resetRes.status} — run \`bun run resetpass\``);
      return;
    }
    const payload = (await resetRes.json()) as ResetPasswordResponse;
    const newPassword = payload.data?.new_password ?? payload.new_password;
    if (!newPassword) {
      deps.warn('[aionui-web] /api/webui/reset-password returned no new_password — run `bun run resetpass`');
      return;
    }
    const username = await fetchAdminUsername(deps, opts.backendPort);
    deps.log(`[aionui-web] Generated initial admin password: ${newPassword}`);
    deps.log(`[aionui-web] Log in with username "${username}" and change it from the UI.`);
  } catch (err) {
    deps.warn(
      `[aionui-web] failed to seed initial admin password: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
