/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AuthAccountStatus, AuthRole, AuthUser } from '@/common/types/platform/auth';

const REMEMBER_ME_KEY = 'rememberMe';
const REMEMBERED_USERNAME_KEY = 'rememberedUsername';
const LEGACY_REMEMBERED_PASSWORD_KEY = 'rememberedPassword';
const LAST_AUTHENTICATED_USER_KEY = 'aionui.auth.lastUserId';

const GLOBAL_LOCAL_STORAGE_KEYS = new Set([
  REMEMBER_ME_KEY,
  REMEMBERED_USERNAME_KEY,
  LAST_AUTHENTICATED_USER_KEY,
  'i18nextLng',
  '__aionui_theme',
  'update.includePrerelease',
  'aionui.gpuAutoDisableNoticeAckAt',
  'aionui.migration-invite-shown',
  'aionui_agent_browser_first_use_notified',
]);

export type RememberedLogin = {
  remember: boolean;
  username: string;
};

type StorageReadResult = {
  ok: boolean;
  value: string | null;
};

function resolveLocalStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

function resolveSessionStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
}

function readStorageItem(storage: Storage | undefined, key: string): StorageReadResult {
  if (!storage) return { ok: false, value: null };
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false, value: null };
  }
}

function mutateStorage(storage: Storage | undefined, action: (target: Storage) => void): void {
  if (!storage) return;
  try {
    action(storage);
  } catch {
    // Browser storage is optional and can be denied by privacy/security policy.
  }
}

/**
 * Normalize current and legacy AionCore identity payloads. Core v0.1.63 only
 * returns `{ id, username }`; its seeded system user is the site administrator.
 */
export function normalizeAuthUserPayload(value: unknown): AuthUser | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || typeof candidate.username !== 'string') return null;

  const rawRole = candidate.role ?? candidate.site_role;
  if (rawRole !== undefined && rawRole !== 'admin' && rawRole !== 'member') return null;
  const role: AuthRole =
    rawRole === 'admin' || rawRole === 'member' ? rawRole : candidate.id === 'system_default_user' ? 'admin' : 'member';
  if (candidate.status !== undefined && candidate.status !== 'active' && candidate.status !== 'disabled') return null;
  const status: AuthAccountStatus = candidate.status === 'disabled' ? 'disabled' : 'active';
  const mustChange = candidate.must_change_password ?? candidate.mustChangePassword;
  if (mustChange !== undefined && typeof mustChange !== 'boolean') return null;

  return {
    id: candidate.id,
    username: candidate.username,
    role,
    status,
    must_change_password: mustChange === true,
  };
}

/**
 * Read the non-secret login hint. Old releases stored an obfuscated password;
 * remove that value unconditionally because reversible encoding is not secure.
 */
export function readRememberedLogin(storage?: Storage): RememberedLogin {
  const target = resolveLocalStorage(storage);
  mutateStorage(target, (value) => value.removeItem(LEGACY_REMEMBERED_PASSWORD_KEY));
  const remember = readStorageItem(target, REMEMBER_ME_KEY).value === 'true';
  return {
    remember,
    username: remember ? (readStorageItem(target, REMEMBERED_USERNAME_KEY).value ?? '') : '',
  };
}

/** Persist only the username hint and the server-session preference. */
export function writeRememberedLogin(username: string, remember: boolean, storage?: Storage): void {
  const target = resolveLocalStorage(storage);
  mutateStorage(target, (value) => value.removeItem(LEGACY_REMEMBERED_PASSWORD_KEY));
  if (!remember) {
    mutateStorage(target, (value) => value.removeItem(REMEMBER_ME_KEY));
    mutateStorage(target, (value) => value.removeItem(REMEMBERED_USERNAME_KEY));
    return;
  }
  mutateStorage(target, (value) => value.setItem(REMEMBER_ME_KEY, 'true'));
  mutateStorage(target, (value) => value.setItem(REMEMBERED_USERNAME_KEY, username));
}

/**
 * Remove state that can contain conversation ids, workspace paths, drafts, or
 * cached file content. Language/theme and the non-secret login hint are global
 * device preferences and intentionally survive account transitions.
 */
export function clearAccountScopedBrowserState(local?: Storage, session?: Storage): void {
  const localTarget = resolveLocalStorage(local);
  const sessionTarget = resolveSessionStorage(session);
  const keysToRemove: string[] = [];
  mutateStorage(localTarget, (target) => {
    for (let index = 0; index < target.length; index += 1) {
      const key = target.key(index);
      if (key && !GLOBAL_LOCAL_STORAGE_KEYS.has(key)) keysToRemove.push(key);
    }
  });
  keysToRemove.forEach((key) => mutateStorage(localTarget, (target) => target.removeItem(key)));
  mutateStorage(localTarget, (target) => target.removeItem(LEGACY_REMEMBERED_PASSWORD_KEY));
  mutateStorage(sessionTarget, (target) => target.clear());
}

/** Clear scoped state when a different authenticated account replaces the previous one. */
export function prepareAuthenticatedAccount(nextUserId: string, local?: Storage, session?: Storage): boolean {
  const localTarget = resolveLocalStorage(local);
  const previous = readStorageItem(localTarget, LAST_AUTHENTICATED_USER_KEY);
  const previousUserId = previous.value;
  if (!previous.ok) {
    clearAccountScopedBrowserState(localTarget, session);
    mutateStorage(localTarget, (target) => target.setItem(LAST_AUTHENTICATED_USER_KEY, nextUserId));
    return true;
  }
  const changed = previousUserId !== nextUserId;
  if (changed) clearAccountScopedBrowserState(localTarget, session);
  mutateStorage(localTarget, (target) => target.setItem(LAST_AUTHENTICATED_USER_KEY, nextUserId));
  mutateStorage(localTarget, (target) => target.removeItem(LEGACY_REMEMBERED_PASSWORD_KEY));
  return changed;
}

/** Clear user-scoped state while retaining the id needed to detect the next account. */
export function prepareAccountLogout(currentUserId: string | undefined, local?: Storage, session?: Storage): void {
  const localTarget = resolveLocalStorage(local);
  clearAccountScopedBrowserState(localTarget, session);
  if (currentUserId) {
    mutateStorage(localTarget, (target) => target.setItem(LAST_AUTHENTICATED_USER_KEY, currentUserId));
  }
}
