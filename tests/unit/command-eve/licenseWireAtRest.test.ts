/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CEVE license-wire at rest (the EVE Inference bearer store). Proves:
 *  (a) keychain available  → wire persisted ONLY as a keychain:v1: ref, with NO
 *      plaintext anywhere on disk; readLicenseWire round-trips the real value;
 *  (b) keychain unavailable → FAIL CLOSED, nothing written, no plaintext;
 *  (c) readLicenseWire fails closed on an absent/malformed/undecryptable file;
 *  (d) hasLicenseWire reflects presence without decrypting.
 *
 * Synthetic tokens only — never a real license.
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hasLicenseWire, readLicenseWire, storeLicenseWire } from '@/common/config/licenseWireAtRest';
import { setSafeStorageForTesting, type SafeStorageAdapter } from '@/common/config/keychain';

/** Synthetic CEVE wire string — NOT a real license. */
const FAKE_WIRE = 'CEVE.v2.FAKE-payload-TESTONLY.FAKE-sig-TESTONLY';

const tempRoots: string[] = [];
const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-license-wire-test-'));
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  setSafeStorageForTesting(undefined);
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

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

/** Read the serialized on-disk record (raw file contents). */
function readWireFileRaw(root: string): string | null {
  const file = path.join(root, 'command-eve-runtime', 'entitlement', 'license-wire.json');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

describe('licenseWireAtRest — (a) keychain available', () => {
  it('persists the wire ONLY as a keychain ref (no plaintext on disk) and round-trips it', () => {
    setSafeStorageForTesting(makeAvailableAdapter());
    const root = makeRoot();

    const stored = storeLicenseWire(root, FAKE_WIRE);
    expect(stored.ok).toBe(true);
    expect(stored.outcome).toBe('stored');

    const raw = readWireFileRaw(root);
    expect(raw).not.toBeNull();
    // The plaintext wire must NOT appear anywhere in the file.
    expect(raw).not.toContain(FAKE_WIRE);
    // The stored value must be a keychain ref.
    expect(raw).toContain('keychain:v1:');

    const back = readLicenseWire(root);
    expect(back.ok).toBe(true);
    expect(back.outcome).toBe('decrypted');
    expect(back.wire).toBe(FAKE_WIRE);

    expect(hasLicenseWire(root)).toBe(true);
  });

  it('is a no-op for an empty wire', () => {
    setSafeStorageForTesting(makeAvailableAdapter());
    const root = makeRoot();
    expect(storeLicenseWire(root, '').outcome).toBe('empty');
    expect(storeLicenseWire(root, '   ').outcome).toBe('empty');
    expect(hasLicenseWire(root)).toBe(false);
  });
});

describe('licenseWireAtRest — (b) keychain unavailable: FAIL CLOSED', () => {
  it('does not write anything and reports dropped-fail-closed', () => {
    setSafeStorageForTesting(makeUnavailableAdapter());
    const root = makeRoot();

    const stored = storeLicenseWire(root, FAKE_WIRE);
    expect(stored.ok).toBe(false);
    expect(stored.outcome).toBe('dropped-fail-closed');
    expect(stored.reason_code).toBe('KEYCHAIN_UNAVAILABLE');

    // Nothing written to disk — never plaintext.
    expect(readWireFileRaw(root)).toBeNull();
    expect(hasLicenseWire(root)).toBe(false);
  });
});

describe('licenseWireAtRest — (c) read fails closed', () => {
  it('returns absent when no file exists', () => {
    const root = makeRoot();
    const back = readLicenseWire(root);
    expect(back.ok).toBe(false);
    expect(back.outcome).toBe('absent');
    expect(back.wire).toBeUndefined();
  });

  it('returns malformed when the on-disk value is not a keychain ref', () => {
    const root = makeRoot();
    const dir = path.join(root, 'command-eve-runtime', 'entitlement');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'license-wire.json'),
      JSON.stringify({ version: 'command-eve-license-wire/v0', wire_ref: FAKE_WIRE, stored_at: 'x' })
    );
    const back = readLicenseWire(root);
    expect(back.ok).toBe(false);
    expect(back.outcome).toBe('malformed');
    expect(back.wire).toBeUndefined();
  });

  it('returns decrypt-failed when the keychain cannot decrypt the ref', () => {
    // Store with an available adapter, then read with an unavailable one.
    setSafeStorageForTesting(makeAvailableAdapter());
    const root = makeRoot();
    expect(storeLicenseWire(root, FAKE_WIRE).ok).toBe(true);

    setSafeStorageForTesting(makeUnavailableAdapter());
    const back = readLicenseWire(root);
    expect(back.ok).toBe(false);
    expect(back.wire).toBeUndefined();
  });
});
