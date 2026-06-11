/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  decryptSecret,
  encryptSecret,
  isKeychainAvailable,
  isKeychainRef,
  setSafeStorageForTesting,
  type SafeStorageAdapter,
} from '@/common/config/keychain';

/**
 * Mock `safeStorage` that round-trips through a reversible (non-cryptographic)
 * transform. The point is to exercise the seam, not the OS crypto — the
 * ciphertext only needs to differ from the plaintext and decrypt back to it.
 */
function makeAvailableAdapter(): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plainText: string) => Buffer.from(`enc::${plainText}`, 'utf8'),
    decryptString: (encrypted: Buffer) => {
      const raw = encrypted.toString('utf8');
      if (!raw.startsWith('enc::')) {
        throw new Error('bad ciphertext');
      }
      return raw.slice('enc::'.length);
    },
  };
}

/** Mock that reports no encryption backend (the fail-closed case). */
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

describe('keychain seam', () => {
  afterEach(() => {
    setSafeStorageForTesting(undefined);
  });

  it('round-trips a secret through an opaque keychain ref', () => {
    setSafeStorageForTesting(makeAvailableAdapter());

    expect(isKeychainAvailable()).toBe(true);

    const secret = 'sk-supersecret-value-123456';
    const enc = encryptSecret(secret);

    expect(enc.ok).toBe(true);
    expect(enc.ref).toBeDefined();
    expect(enc.reason_code).toBeUndefined();
    // The ref is opaque (prefix + base64) and never the plaintext.
    expect(enc.ref).toMatch(/^keychain:v1:[A-Za-z0-9+/=]+$/);
    expect(enc.ref).not.toContain(secret);

    const dec = decryptSecret(enc.ref!);
    expect(dec.ok).toBe(true);
    expect(dec.value).toBe(secret);
    expect(dec.reason_code).toBeUndefined();
  });

  it('fails closed when safeStorage is unavailable — never returns plaintext', () => {
    setSafeStorageForTesting(makeUnavailableAdapter());

    expect(isKeychainAvailable()).toBe(false);

    const enc = encryptSecret('sk-another-secret');
    expect(enc.ok).toBe(false);
    expect(enc.ref).toBeUndefined();
    expect(enc.reason_code).toBe('KEYCHAIN_UNAVAILABLE');
  });

  it('fails closed when there is no adapter at all (null injection)', () => {
    setSafeStorageForTesting(null);

    expect(isKeychainAvailable()).toBe(false);

    const enc = encryptSecret('plain');
    expect(enc.ok).toBe(false);
    expect(enc.reason_code).toBe('KEYCHAIN_UNAVAILABLE');

    const dec = decryptSecret('keychain:v1:aGVsbG8=');
    expect(dec.ok).toBe(false);
    expect(dec.value).toBeUndefined();
    expect(dec.reason_code).toBe('KEYCHAIN_UNAVAILABLE');
  });

  it('rejects decryptSecret on a non-ref input with a reason code', () => {
    setSafeStorageForTesting(makeAvailableAdapter());

    const dec = decryptSecret('not-a-keychain-ref');
    expect(dec.ok).toBe(false);
    expect(dec.value).toBeUndefined();
    expect(dec.reason_code).toBe('KEYCHAIN_NOT_A_REF');
  });

  it('rejects a malformed base64 ref shape (still fails closed)', () => {
    setSafeStorageForTesting(makeAvailableAdapter());

    // Valid prefix, but the payload does not decrypt under the mock.
    const dec = decryptSecret('keychain:v1:not-our-ciphertext');
    expect(dec.ok).toBe(false);
    expect(dec.reason_code).toBe('KEYCHAIN_DECRYPT_FAILED');
  });

  it('reports KEYCHAIN_INVALID_INPUT for a non-string secret', () => {
    setSafeStorageForTesting(makeAvailableAdapter());

    // @ts-expect-error — deliberately exercising the runtime guard.
    const enc = encryptSecret(undefined);
    expect(enc.ok).toBe(false);
    expect(enc.reason_code).toBe('KEYCHAIN_INVALID_INPUT');
  });

  describe('isKeychainRef', () => {
    it('recognises a keychain ref', () => {
      expect(isKeychainRef('keychain:v1:aGVsbG8=')).toBe(true);
    });

    it('rejects plain strings and other prefixes', () => {
      expect(isKeychainRef('sk-plain-token')).toBe(false);
      expect(isKeychainRef('keychain:v0:legacy')).toBe(false);
      expect(isKeychainRef('')).toBe(false);
      // @ts-expect-error — runtime guard on non-string input.
      expect(isKeychainRef(undefined)).toBe(false);
    });
  });
});
