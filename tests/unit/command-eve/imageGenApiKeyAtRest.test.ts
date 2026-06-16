/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Keychain P0 — image-gen api_key at rest.
 *
 * Proves the four required properties for the LOCAL-FILE plaintext leak:
 *  (a) keychain available  → api_key persisted ONLY as a keychain:v1: ref,
 *      with NO plaintext anywhere in the serialized config;
 *  (b) decrypt-at-env-build round-trips the real value into the child env;
 *  (c) keychain unavailable → FAIL CLOSED, no plaintext persisted;
 *  (d) legacy plaintext migrates to a ref (one-time upgrade).
 *
 * Tests use SYNTHETIC fake tokens only — never a real secret.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  decryptImageGenApiKeyForEnv,
  encryptImageGenApiKeyAtRest,
} from '@/common/config/imageGenApiKeyAtRest';
import { isKeychainRef, setSafeStorageForTesting, type SafeStorageAdapter } from '@/common/config/keychain';

/** Synthetic fake token — NOT a real secret. */
const FAKE_API_KEY = 'sk-fake-imggen-TESTONLY-0000000000';

/**
 * Reversible (non-cryptographic) mock — mirrors keychain.test.ts. The
 * ciphertext only needs to differ from the plaintext and decrypt back to it.
 */
function makeAvailableAdapter(): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plainText: string) => Buffer.from(`enc::${plainText}`, 'utf8'),
    decryptString: (encrypted: Buffer) => {
      const raw = encrypted.toString('utf8');
      if (!raw.startsWith('enc::')) throw new Error('bad ciphertext');
      return raw.slice('enc::'.length);
    },
  };
}

function makeUnavailableAdapter(): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('should never be called when unavailable');
    },
    decryptString: () => {
      throw new Error('should never be called when unavailable');
    },
  };
}

/**
 * Simulate exactly what initStorage.ensureBuiltinMcpServers persists: the
 * base64(encodeURIComponent(JSON)) on-disk encoding (initStorage.ts:132). We
 * assert the *decoded* serialized form contains no plaintext key.
 */
function serializeOnDisk(value: unknown): { encoded: string; decoded: string } {
  const json = JSON.stringify(value);
  const encoded = btoa(encodeURIComponent(json));
  const decoded = decodeURIComponent(atob(encoded));
  return { encoded, decoded };
}

describe('imageGenApiKeyAtRest', () => {
  afterEach(() => {
    setSafeStorageForTesting(undefined);
  });

  // (a) keychain available → persisted ONLY as ref, no plaintext in written config
  it('(a) wraps a plaintext api_key as a keychain ref and leaves NO plaintext in the persisted config', () => {
    setSafeStorageForTesting(makeAvailableAdapter());

    const legacyConfig = {
      id: 'prov-1',
      name: 'Fake Provider',
      platform: 'openai',
      base_url: 'https://example.test',
      api_key: FAKE_API_KEY,
      use_model: 'gpt-image-1',
    };

    const result = encryptImageGenApiKeyAtRest(legacyConfig);

    expect(result.outcome).toBe('wrapped');
    expect(result.changed).toBe(true);
    expect(result.config.api_key).toBeDefined();
    expect(isKeychainRef(result.config.api_key!)).toBe(true);
    expect(result.config.api_key).not.toContain(FAKE_API_KEY);

    // The exact on-disk encoding must NOT contain the plaintext anywhere.
    const { encoded, decoded } = serializeOnDisk(result.config);
    expect(decoded).not.toContain(FAKE_API_KEY);
    expect(encoded).not.toContain(FAKE_API_KEY);
    // base64 of the raw key must also be absent (defends against naive base64).
    expect(encoded).not.toContain(btoa(FAKE_API_KEY));
    // The ref IS present (so the value is recoverable later, just not in clear).
    expect(decoded).toContain('keychain:v1:');

    // Non-secret fields are preserved untouched.
    expect(result.config.platform).toBe('openai');
    expect(result.config.use_model).toBe('gpt-image-1');
  });

  // (b) decrypt-at-env-build round-trips the real value into the child env
  it('(b) decryptImageGenApiKeyForEnv round-trips the wrapped ref back to the real value for the MCP env', () => {
    setSafeStorageForTesting(makeAvailableAdapter());

    const wrapped = encryptImageGenApiKeyAtRest({ api_key: FAKE_API_KEY });
    expect(wrapped.outcome).toBe('wrapped');

    const resolved = decryptImageGenApiKeyForEnv(wrapped.config.api_key);
    expect(resolved.outcome).toBe('decrypted');
    expect(resolved.value).toBe(FAKE_API_KEY);

    // The value used to build the child env is the real plaintext (in memory).
    const env: Record<string, string> = {};
    if (resolved.value) env.AIONUI_IMG_API_KEY = resolved.value;
    expect(env.AIONUI_IMG_API_KEY).toBe(FAKE_API_KEY);
  });

  // (c) keychain unavailable → fail closed, no plaintext persisted
  it('(c) fails closed when keychain is unavailable — drops the key, never persists plaintext', () => {
    setSafeStorageForTesting(makeUnavailableAdapter());

    const result = encryptImageGenApiKeyAtRest({
      platform: 'openai',
      api_key: FAKE_API_KEY,
      use_model: 'gpt-image-1',
    });

    expect(result.outcome).toBe('dropped-fail-closed');
    expect(result.changed).toBe(true);
    expect(result.reason_code).toBe('KEYCHAIN_UNAVAILABLE');
    // Key is dropped — empty string, NOT the plaintext and NOT a ref.
    expect(result.config.api_key).toBe('');
    expect(isKeychainRef(result.config.api_key!)).toBe(false);

    const { encoded, decoded } = serializeOnDisk(result.config);
    expect(decoded).not.toContain(FAKE_API_KEY);
    expect(encoded).not.toContain(btoa(FAKE_API_KEY));
    // Non-secret fields still preserved even on the fail-closed path.
    expect(result.config.platform).toBe('openai');
    expect(result.config.use_model).toBe('gpt-image-1');
  });

  it('(c2) fail-closed with no adapter at all (null injection) still drops the key', () => {
    setSafeStorageForTesting(null);

    const result = encryptImageGenApiKeyAtRest({ api_key: FAKE_API_KEY });
    expect(result.outcome).toBe('dropped-fail-closed');
    expect(result.config.api_key).toBe('');
    expect(serializeOnDisk(result.config).decoded).not.toContain(FAKE_API_KEY);
  });

  // (d) legacy plaintext migrates to a ref (one-time upgrade)
  it('(d) migrates a legacy plaintext api_key to a ref on read, and is idempotent on the next pass', () => {
    setSafeStorageForTesting(makeAvailableAdapter());

    // First pass: legacy plaintext on disk → wrapped to a ref.
    const firstPass = encryptImageGenApiKeyAtRest({ api_key: FAKE_API_KEY });
    expect(firstPass.outcome).toBe('wrapped');
    const ref = firstPass.config.api_key!;
    expect(isKeychainRef(ref)).toBe(true);

    // Second pass over the already-migrated config: no-op (idempotent).
    const secondPass = encryptImageGenApiKeyAtRest(firstPass.config);
    expect(secondPass.outcome).toBe('already-ref');
    expect(secondPass.changed).toBe(false);
    expect(secondPass.config.api_key).toBe(ref);

    // And the migrated ref still decrypts to the original synthetic value.
    expect(decryptImageGenApiKeyForEnv(ref).value).toBe(FAKE_API_KEY);
  });

  describe('edge cases', () => {
    it('treats an absent / empty api_key as nothing to do', () => {
      setSafeStorageForTesting(makeAvailableAdapter());

      const none = encryptImageGenApiKeyAtRest({ platform: 'openai' });
      expect(none.outcome).toBe('no-key');
      expect(none.changed).toBe(false);

      const empty = encryptImageGenApiKeyAtRest({ api_key: '' });
      expect(empty.outcome).toBe('no-key');
      expect(empty.changed).toBe(false);
    });

    it('decryptImageGenApiKeyForEnv passes through legacy plaintext (not-yet-migrated install)', () => {
      // No keychain needed for a passthrough of an unmigrated plaintext value.
      setSafeStorageForTesting(makeUnavailableAdapter());

      const resolved = decryptImageGenApiKeyForEnv(FAKE_API_KEY);
      expect(resolved.outcome).toBe('plaintext-passthrough');
      expect(resolved.value).toBe(FAKE_API_KEY);
    });

    it('decryptImageGenApiKeyForEnv returns empty for absent input', () => {
      setSafeStorageForTesting(makeAvailableAdapter());
      expect(decryptImageGenApiKeyForEnv(undefined).outcome).toBe('empty');
      expect(decryptImageGenApiKeyForEnv('').outcome).toBe('empty');
      expect(decryptImageGenApiKeyForEnv(undefined).value).toBe('');
    });

    it('decryptImageGenApiKeyForEnv fails closed (empty value) when a ref cannot be decrypted', () => {
      // A ref produced under one backend, then the backend becomes unavailable.
      setSafeStorageForTesting(makeAvailableAdapter());
      const ref = encryptImageGenApiKeyAtRest({ api_key: FAKE_API_KEY }).config.api_key!;
      setSafeStorageForTesting(makeUnavailableAdapter());

      const resolved = decryptImageGenApiKeyForEnv(ref);
      expect(resolved.outcome).toBe('decrypt-failed');
      expect(resolved.value).toBe('');
      expect(resolved.reason_code).toBeDefined();
    });
  });
});
