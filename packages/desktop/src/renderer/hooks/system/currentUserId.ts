/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The id the BACKEND attributes to this client's requests.
 *
 * Needed because `AuthContext` cannot supply one in the desktop app: its
 * `refresh()` takes an `isDesktopRuntime` branch that sets `status` to
 * `authenticated` and `user` to `null`, so every consumer reading `user?.id`
 * gets `undefined` there. That is fine for UI that only asks "am I logged in",
 * but not for code that must compare against a `user_id` inside a broadcast
 * payload — it silently matches nothing.
 *
 * `GET /api/system/current-user` answers it for every identity mode: it sits
 * behind the ORDINARY auth middleware and echoes whatever `CurrentUser` that
 * middleware put on the request, so the value is by construction the same id
 * the backend uses when it scopes this client's data. (`GET /api/auth/user`
 * cannot: the auth router runs its own `AuthState` that is never in `Local`
 * mode, so it returns 401 in exactly the case this fallback exists for.)
 *
 * Fetched once per app session and shared: several unrelated consumers may want
 * it, and it cannot change without a restart or a re-login (both of which
 * reload the renderer).
 */

import { ipcBridge } from '@/common';

let cached: string | undefined;
let pending: Promise<string | undefined> | null = null;

export async function resolveCurrentUserId(): Promise<string | undefined> {
  if (cached) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      // Optional-chained: a preload/bridge build without this entry must degrade
      // to "unknown" rather than throwing inside a render effect.
      const response = await ipcBridge.auth?.currentUser?.invoke?.();
      const id = response?.id;
      if (id) cached = id;
      return cached;
    } catch {
      // Leave it unknown. Callers treat that as "cannot attribute events to me"
      // and stay silent, which is the safe direction: showing another user's
      // conversation names would be worse than showing nothing.
      return undefined;
    } finally {
      // Cleared either way so a failure can be retried by the next mount.
      pending = null;
    }
  })();
  return pending;
}

/** Drop the cache. Exported for tests. */
export function resetCurrentUserIdCache(): void {
  cached = undefined;
  pending = null;
}
