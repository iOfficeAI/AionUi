/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Keychain seam — a thin, dependency-light wrapper over Electron `safeStorage`.
 *
 * WHY this exists (Company.OS WO 2026-06-10-wo-agnostic-runtime-assignment §0,
 * §5 guardrail 1): the AionUi codebase has ZERO keychain usage today and
 * `IProvider.api_key` is plaintext. Before the agnostic-read feature amplifies
 * that leak, secrets must be moved behind the OS keychain. This module is the
 * SEAM ONLY — it does NOT migrate any existing plaintext value (that is the
 * next, riskier slice). Callers opt in by storing a `keychain:v1:<base64>` ref
 * instead of a raw string.
 *
 * FAIL-CLOSED contract: when `safeStorage` is unavailable (no Electron, or the
 * OS has no encryption backend), every write/read returns `{ ok: false }` with
 * a `reason_code`. It NEVER silently falls back to plaintext — a caller that
 * cannot get a keychain ref must treat that as an error, not as "store it raw".
 *
 * Electron is imported lazily and behind an injectable adapter so this module
 * is unit-testable in a plain Node (vitest) environment — mirroring the
 * `electronSafe.ts` lazy-require idiom and the `__resetForTests` hook used by
 * `persistOnQuit.ts`.
 */

/** Opaque prefix for a keychain reference. The base64 payload is ciphertext. */
const KEYCHAIN_REF_PREFIX = 'keychain:v1:';

/**
 * Minimal structural slice of Electron's `safeStorage` we depend on. Declared
 * locally so tests can inject a mock without pulling in the electron types.
 */
export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** Result of an encrypt attempt. `ref` is only present on success. */
export interface EncryptSecretResult {
  ok: boolean;
  ref?: string;
  reason_code?: string;
}

/** Result of a decrypt attempt. `value` is only present on success. */
export interface DecryptSecretResult {
  ok: boolean;
  value?: string;
  reason_code?: string;
}

/**
 * Lazily-loaded real adapter, or `null` outside Electron. Resolved on first
 * use so importing this module never crashes a Node/test process.
 */
let cachedAdapter: SafeStorageAdapter | null | undefined;

/** Test-injected adapter override. When set, it wins over the real lookup. */
let injectedAdapter: SafeStorageAdapter | null | undefined;

function loadRealSafeStorage(): SafeStorageAdapter | null {
  if (cachedAdapter !== undefined) {
    return cachedAdapter;
  }
  if (!process.versions?.electron) {
    cachedAdapter = null;
    return cachedAdapter;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { safeStorage } = require('electron') as { safeStorage?: SafeStorageAdapter };
    cachedAdapter = safeStorage ?? null;
  } catch {
    cachedAdapter = null;
  }
  return cachedAdapter;
}

function resolveAdapter(): SafeStorageAdapter | null {
  if (injectedAdapter !== undefined) {
    return injectedAdapter;
  }
  return loadRealSafeStorage();
}

/**
 * Test hook: inject a mock `safeStorage` adapter (or `null` to simulate the
 * unavailable case). Pass `undefined` to clear the override and fall back to
 * the real lazy lookup. Mirrors the `__reset*ForTests` idiom in this codebase.
 */
export function setSafeStorageForTesting(adapter: SafeStorageAdapter | null | undefined): void {
  injectedAdapter = adapter;
  // Drop the cached real adapter so a later clear re-probes cleanly.
  cachedAdapter = undefined;
}

/**
 * True iff a usable encryption backend is available. When this is false every
 * `encryptSecret` / `decryptSecret` call fails closed — callers must NOT store
 * plaintext as a fallback.
 */
export function isKeychainAvailable(): boolean {
  const adapter = resolveAdapter();
  if (!adapter) {
    return false;
  }
  try {
    return adapter.isEncryptionAvailable() === true;
  } catch {
    return false;
  }
}

/** True iff `value` is a keychain reference produced by `encryptSecret`. */
export function isKeychainRef(value: string): boolean {
  return typeof value === 'string' && value.startsWith(KEYCHAIN_REF_PREFIX);
}

/**
 * Encrypt a plaintext secret into an opaque `keychain:v1:<base64>` ref.
 *
 * Fail-closed: returns `{ ok: false, reason_code: 'KEYCHAIN_UNAVAILABLE' }`
 * when no encryption backend exists — never a plaintext ref.
 */
export function encryptSecret(plain: string): EncryptSecretResult {
  if (typeof plain !== 'string') {
    return { ok: false, reason_code: 'KEYCHAIN_INVALID_INPUT' };
  }
  const adapter = resolveAdapter();
  if (!adapter || !isKeychainAvailable()) {
    return { ok: false, reason_code: 'KEYCHAIN_UNAVAILABLE' };
  }
  try {
    const encrypted = adapter.encryptString(plain);
    const ref = `${KEYCHAIN_REF_PREFIX}${Buffer.from(encrypted).toString('base64')}`;
    return { ok: true, ref };
  } catch {
    return { ok: false, reason_code: 'KEYCHAIN_ENCRYPT_FAILED' };
  }
}

/**
 * Decrypt a `keychain:v1:<base64>` ref back to its plaintext value.
 *
 * Fail-closed: a non-ref input, an unavailable backend, or a decrypt error all
 * return `{ ok: false }` with a `reason_code` and NO `value`.
 */
export function decryptSecret(ref: string): DecryptSecretResult {
  if (!isKeychainRef(ref)) {
    return { ok: false, reason_code: 'KEYCHAIN_NOT_A_REF' };
  }
  const adapter = resolveAdapter();
  if (!adapter || !isKeychainAvailable()) {
    return { ok: false, reason_code: 'KEYCHAIN_UNAVAILABLE' };
  }
  const base64 = ref.slice(KEYCHAIN_REF_PREFIX.length);
  let encrypted: Buffer;
  try {
    encrypted = Buffer.from(base64, 'base64');
  } catch {
    return { ok: false, reason_code: 'KEYCHAIN_REF_MALFORMED' };
  }
  try {
    const value = adapter.decryptString(encrypted);
    return { ok: true, value };
  } catch {
    return { ok: false, reason_code: 'KEYCHAIN_DECRYPT_FAILED' };
  }
}
