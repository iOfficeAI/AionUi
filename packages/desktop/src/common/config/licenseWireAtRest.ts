/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Keychain-at-rest store for the CEVE license WIRE STRING.
 *
 * WHY this exists: `entitlementCore.activateEntitlement` verifies a CEVE code
 * and persists only the parsed payload (serial/edition/trial_ends_at/…) — it
 * deliberately does NOT keep the raw wire string. But the EVE Inference cloud
 * lane needs that raw string as the bearer credential for the backend Edge
 * Function (`Authorization: Bearer <CEVE.v2.…>`). So after a successful
 * activation we persist the raw code HERE, behind the OS keychain, and read it
 * back when building the EVE Inference client.
 *
 * SECURITY:
 *  - The wire string is written ONLY as a `keychain:v1:<ciphertext>` ref via
 *    the {@link encryptSecret} seam (Electron safeStorage). FAIL CLOSED: when
 *    the keychain is unavailable we DROP the value rather than write plaintext.
 *  - Stored LOCAL ONLY, 0600, in the same command-eve-runtime entitlement dir
 *    as the entitlement record. Never egressed, never logged.
 *  - The bearer is sent in the Authorization HEADER, which the egress-boundary
 *    redactor does not inspect (it scans message/prompt CONTENT), so passing
 *    the license as a header is safe from accidental redaction.
 *
 * This module is fs + keychain only (no network), and the keychain seam is
 * injectable, so it is unit-testable in a plain Node (vitest) environment.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decryptSecret, encryptSecret, isKeychainAvailable, isKeychainRef } from './keychain';

/** Same runtime dir family the entitlement record lives in. */
const ENTITLEMENT_STATE_DIR = 'entitlement';
const LICENSE_WIRE_FILE = 'license-wire.json';

interface LicenseWireRecord {
  version: 'command-eve-license-wire/v0';
  /** A `keychain:v1:` ref of the raw CEVE wire string. NEVER plaintext. */
  wire_ref: string;
  stored_at: string;
}

function entitlementStateDir(userDataPath: string): string {
  const root = path.resolve(userDataPath || path.join(os.homedir(), '.command-eve'));
  return path.join(root, 'command-eve-runtime', ENTITLEMENT_STATE_DIR);
}

function licenseWirePath(userDataPath: string): string {
  return path.join(entitlementStateDir(userDataPath), LICENSE_WIRE_FILE);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function writeJsonAtomic600(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, file);
}

function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export interface StoreLicenseWireResult {
  ok: boolean;
  outcome: 'stored' | 'empty' | 'dropped-fail-closed';
  reason_code?: string;
}

/**
 * Persist the raw CEVE wire string, encrypted at rest. FAIL CLOSED: an empty
 * input is a no-op; an unavailable/erroring keychain DROPS the value (never
 * writes plaintext) and reports `dropped-fail-closed`.
 *
 * `now` is injectable for deterministic tests.
 */
export function storeLicenseWire(
  userDataPath: string,
  wire: string,
  now: () => Date = () => new Date()
): StoreLicenseWireResult {
  if (typeof wire !== 'string' || wire.trim().length === 0) {
    return { ok: false, outcome: 'empty' };
  }
  if (!isKeychainAvailable()) {
    return { ok: false, outcome: 'dropped-fail-closed', reason_code: 'KEYCHAIN_UNAVAILABLE' };
  }
  const enc = encryptSecret(wire.trim());
  if (!enc.ok || !enc.ref) {
    return { ok: false, outcome: 'dropped-fail-closed', reason_code: enc.reason_code ?? 'KEYCHAIN_ENCRYPT_FAILED' };
  }
  const record: LicenseWireRecord = {
    version: 'command-eve-license-wire/v0',
    wire_ref: enc.ref,
    stored_at: now().toISOString(),
  };
  writeJsonAtomic600(licenseWirePath(userDataPath), record);
  return { ok: true, outcome: 'stored' };
}

export interface ReadLicenseWireResult {
  ok: boolean;
  /** The plaintext CEVE wire string for IN-MEMORY bearer use. Absent on failure. */
  wire?: string;
  outcome: 'decrypted' | 'absent' | 'malformed' | 'decrypt-failed';
  reason_code?: string;
}

/**
 * Read the raw CEVE wire string back (decrypted in memory) for use as the EVE
 * Inference bearer. FAIL CLOSED: a missing/malformed file or a decrypt error
 * returns `ok: false` with NO `wire`. The returned value must NEVER be
 * re-persisted in plaintext.
 */
export function readLicenseWire(userDataPath: string): ReadLicenseWireResult {
  const record = readJsonFile<LicenseWireRecord>(licenseWirePath(userDataPath));
  if (!record || typeof record !== 'object' || typeof record.wire_ref !== 'string') {
    return { ok: false, outcome: 'absent' };
  }
  if (!isKeychainRef(record.wire_ref)) {
    // A non-ref on disk is a contract violation (we only ever write refs). Treat
    // as malformed rather than trusting a plaintext value.
    return { ok: false, outcome: 'malformed', reason_code: 'LICENSE_WIRE_NOT_A_REF' };
  }
  const dec = decryptSecret(record.wire_ref);
  if (!dec.ok || typeof dec.value !== 'string' || dec.value.length === 0) {
    return { ok: false, outcome: 'decrypt-failed', reason_code: dec.reason_code ?? 'KEYCHAIN_DECRYPT_FAILED' };
  }
  return { ok: true, wire: dec.value, outcome: 'decrypted' };
}

/** True iff a (ref) license-wire record exists on disk. Does NOT decrypt. */
export function hasLicenseWire(userDataPath: string): boolean {
  const record = readJsonFile<LicenseWireRecord>(licenseWirePath(userDataPath));
  return Boolean(record && typeof record.wire_ref === 'string' && isKeychainRef(record.wire_ref));
}
