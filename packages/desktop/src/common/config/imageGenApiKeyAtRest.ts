/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Keychain-at-rest wrapper for the LOCAL-FILE image-generation api_key.
 *
 * SCOPE (Company.OS keychain P0 — image-gen lane):
 * This module guards the ONE TS-fixable, local-file plaintext leak: a legacy
 * `tools.imageGenerationModel.api_key` that an OLDER desktop build wrote into
 * the plaintext config file (`command-eve-config.txt`). On startup that value
 * is read back and re-materialized — both into `tools.imageGenerationModel`
 * (re-persisted, see initStorage.ts:521) and into the built-in image-gen MCP
 * server's `transport.env.AIONUI_IMG_API_KEY` + `original_json` (persisted via
 * `configFile.set('mcp.config', …)`, see initStorage.ts:514) — leaving the key
 * in plaintext on disk.
 *
 * WHAT THIS DOES:
 *  - {@link encryptImageGenApiKeyAtRest}: before re-persisting the config,
 *    replace a plaintext api_key with a `keychain:v1:` ref (one-time legacy
 *    upgrade). FAIL CLOSED: if the keychain is unavailable we DROP the key
 *    rather than re-write plaintext to disk.
 *  - {@link decryptImageGenApiKeyForEnv}: at the point the api_key is needed in
 *    memory to build the MCP env, decrypt a ref back to plaintext. Plaintext
 *    in-memory is fine; plaintext on disk is the thing we removed.
 *
 * EXPLICITLY OUT OF SCOPE (do NOT touch here):
 *  - The provider `IProvider.api_key` is owned/persisted by the Rust AionCore
 *    backend; encrypting it on the TS side would brick every provider. The
 *    modern image-gen env path (imageGenerationMcpEnv.ts:buildEnv) sources the
 *    key from `provider.api_key` and is backend-DB-persisted — that surface is
 *    tracked in docs/security/aioncore-provider-apikey-keychain-followup.md.
 *
 * The image-gen MCP *child* is spawned by the Rust backend (it reads
 * `process.env.AIONUI_IMG_API_KEY`, imageGenServer.ts:24); this TS process has
 * no spawn boundary for it. Therefore the env handed to the backend must stay
 * functional plaintext — we never persist a ref into a value the backend would
 * pass verbatim to the child. We only encrypt the value at rest in the LOCAL
 * file and decrypt it in memory immediately before composing that env.
 */

import { decryptSecret, encryptSecret, isKeychainAvailable, isKeychainRef } from './keychain';

/** Structural slice we operate on — any object that may carry an api_key. */
export interface WithApiKey {
  api_key?: string;
}

export interface EncryptImageGenApiKeyResult<T extends WithApiKey> {
  /** The config with its api_key replaced by a ref, or stripped when failing closed. */
  config: T;
  /** True iff the api_key value changed (plaintext → ref, or plaintext → dropped). */
  changed: boolean;
  /** What happened, for non-secret logging / surfacing. Never contains the value. */
  outcome: 'no-key' | 'already-ref' | 'wrapped' | 'dropped-fail-closed';
  /** Set only when failing closed, so callers can surface why the key was dropped. */
  reason_code?: string;
}

/**
 * Re-encrypt a plaintext `api_key` on a `tools.imageGenerationModel`-shaped
 * object into a `keychain:v1:` ref BEFORE it is persisted to the local config
 * file. Idempotent: a value that is already a ref (or empty/absent) is left
 * untouched.
 *
 * FAIL CLOSED: when the keychain is unavailable (or encryption errors), the
 * plaintext key is DROPPED (set to '') — it is NEVER written back to disk in
 * the clear. The caller learns this via `outcome: 'dropped-fail-closed'` and a
 * `reason_code`, and can keep the live value in memory separately if it still
 * needs it for this session's env.
 */
export function encryptImageGenApiKeyAtRest<T extends WithApiKey>(config: T): EncryptImageGenApiKeyResult<T> {
  const current = config?.api_key;

  // Nothing to protect: no key, or empty string.
  if (typeof current !== 'string' || current.length === 0) {
    return { config, changed: false, outcome: 'no-key' };
  }

  // Already a keychain ref — nothing to do (idempotent).
  if (isKeychainRef(current)) {
    return { config, changed: false, outcome: 'already-ref' };
  }

  // Plaintext key present. Try to wrap it.
  if (!isKeychainAvailable()) {
    // FAIL CLOSED: do not re-persist plaintext. Drop the key from the on-disk copy.
    return {
      config: { ...config, api_key: '' },
      changed: true,
      outcome: 'dropped-fail-closed',
      reason_code: 'KEYCHAIN_UNAVAILABLE',
    };
  }

  const enc = encryptSecret(current);
  if (!enc.ok || !enc.ref) {
    // FAIL CLOSED: encryption attempt failed — still never persist plaintext.
    return {
      config: { ...config, api_key: '' },
      changed: true,
      outcome: 'dropped-fail-closed',
      reason_code: enc.reason_code ?? 'KEYCHAIN_ENCRYPT_FAILED',
    };
  }

  return { config: { ...config, api_key: enc.ref }, changed: true, outcome: 'wrapped' };
}

export interface DecryptImageGenApiKeyResult {
  /** Plaintext value for in-memory use (MCP env). '' when none/unrecoverable. */
  value: string;
  outcome: 'empty' | 'plaintext-passthrough' | 'decrypted' | 'decrypt-failed';
  reason_code?: string;
}

/**
 * Resolve an api_key to its plaintext value FOR IN-MEMORY ENV USE ONLY.
 *
 *  - empty / absent              → '' (outcome 'empty')
 *  - a `keychain:v1:` ref        → decrypted in memory (outcome 'decrypted'),
 *                                  or '' + reason_code if decryption fails
 *  - a non-ref (legacy plaintext, e.g. mid-migration) → passed through as-is
 *    (outcome 'plaintext-passthrough') so a not-yet-migrated install still works
 *
 * The returned value is intended to be placed into a child-process env that the
 * backend materializes; it must NEVER be re-persisted to the local file.
 */
export function decryptImageGenApiKeyForEnv(apiKeyOrRef: string | undefined): DecryptImageGenApiKeyResult {
  if (typeof apiKeyOrRef !== 'string' || apiKeyOrRef.length === 0) {
    return { value: '', outcome: 'empty' };
  }

  if (!isKeychainRef(apiKeyOrRef)) {
    // Legacy plaintext that has not been migrated yet (e.g. keychain was
    // unavailable when it was read). Pass through so the feature still works in
    // memory; the at-rest migration is handled separately by the caller.
    return { value: apiKeyOrRef, outcome: 'plaintext-passthrough' };
  }

  const dec = decryptSecret(apiKeyOrRef);
  if (!dec.ok || typeof dec.value !== 'string') {
    return { value: '', outcome: 'decrypt-failed', reason_code: dec.reason_code ?? 'KEYCHAIN_DECRYPT_FAILED' };
  }
  return { value: dec.value, outcome: 'decrypted' };
}
