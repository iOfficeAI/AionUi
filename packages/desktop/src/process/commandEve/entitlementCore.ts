/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE registration + license-gate core (main-process half).
 *
 * Implements the app-side first-run gate specified in
 * `Company.OS/docs/superpowers/specs/2026-06-13-registration-license-gate.md`.
 *
 * Three concerns live here, all pure-ish (filesystem + node:crypto only, clock
 * and userData root injectable for tests):
 *
 *   1. verifyLicenseCodeTs — a faithful TypeScript port of the W10 offline
 *      `scripts/licensing/license-code-core.mjs` core. Same CEVE.v1 wire format,
 *      same reason codes, signature verified BEFORE time checks, injectable
 *      clock. Plus a sign-time payload-shape validation the .mjs core does NOT
 *      do (it trusts a signed-but-missing-field payload): we reject payloads
 *      missing required fields with LICENSE_MALFORMED even when the signature is
 *      valid, so a founder mis-mint cannot half-activate the gate.
 *
 *   2. registration — S2 PII (name/company/email + GDPR consent), stored LOCAL
 *      ONLY in the app's userData commandEve state dir with 0600 care. Never
 *      egressed. consent !== true is rejected (CONSENT_REQUIRED).
 *
 *   3. entitlement — activation binds a verified code to the registration's
 *      tenant_id, persists the entitlement record, and appends ONE agent-event/v1
 *      audit event carrying NO PII (tenant_id + code_serial + edition only).
 *
 * Public-key resolution (1.1.0 multi-key): a verification accepts a code signed
 * by ANY trusted key. Resolution returns an ORDERED LIST of PEMs and the first
 * key whose signature verifies wins:
 *   - env COMMAND_EVE_LICENSE_PUBLIC_KEY (PEM string OR a file path — detected;
 *     may now hold MULTIPLE concatenated PEM blocks, each split into one entry)
 *     takes priority and REPLACES the bundled list when set (W12/pilot override);
 *   - otherwise the bundled list = `public/command-eve-license-public-key.pem`
 *     (founder, offline key) + `public/command-eve-license-public-key-server.pem`
 *     (server key the SaaS backend mints with — OPTIONAL: an absent file is just
 *     skipped, never an error).
 * No key resolvable anywhere + flag ON ⇒ gate state 'unconfigured' (fail-closed,
 * but distinguishable from an invalid code).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Wire format + reason codes — MIRROR of scripts/licensing/license-code-core.mjs
// ---------------------------------------------------------------------------

export const COMMAND_EVE_LICENSE_CODE_VERSION = 'command-eve-license/v1';
export const COMMAND_EVE_LICENSE_CODE_PREFIX = 'CEVE';
export const COMMAND_EVE_LICENSE_CODE_WIRE_VERSION = 'v1';

export const COMMAND_EVE_LICENSE_EDITIONS = ['pilot', 'standard'] as const;
export type CommandEveLicenseEdition = (typeof COMMAND_EVE_LICENSE_EDITIONS)[number];

export const COMMAND_EVE_LICENSE_REASON_CODES = {
  MALFORMED: 'LICENSE_MALFORMED',
  VERSION_UNSUPPORTED: 'LICENSE_VERSION_UNSUPPORTED',
  SIGNATURE_INVALID: 'LICENSE_SIGNATURE_INVALID',
  EXPIRED: 'LICENSE_EXPIRED',
  NOT_YET_VALID: 'LICENSE_NOT_YET_VALID',
} as const;

export type CommandEveLicenseReasonCode =
  (typeof COMMAND_EVE_LICENSE_REASON_CODES)[keyof typeof COMMAND_EVE_LICENSE_REASON_CODES];

// Bridge / record schema versions.
export const COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION = 'command-eve-entitlement/v0';
export const COMMAND_EVE_REGISTRATION_RECORD_VERSION = 'command-eve-registration/v0';
export const COMMAND_EVE_ENTITLEMENT_RECORD_VERSION = 'command-eve-entitlement-record/v0';

const REGISTRATION_FILE = 'registration.json';
const ENTITLEMENT_FILE = 'entitlement.json';
const AGENT_EVENTS_FILE = 'agent-events.jsonl';
const ENTITLEMENT_STATE_DIR = 'entitlement';
const BUNDLED_PUBLIC_KEY_FILE = 'command-eve-license-public-key.pem';
// Server (SaaS-minted) key. OPTIONAL: the file may not exist yet — absent is skipped, never an error.
const BUNDLED_SERVER_PUBLIC_KEY_FILE = 'command-eve-license-public-key-server.pem';

const REGISTRATION_REQUIRED_FLAG = 'COMMAND_EVE_REGISTRATION_REQUIRED';
const PUBLIC_KEY_ENV = 'COMMAND_EVE_LICENSE_PUBLIC_KEY';

// Spec §4: default ON in pilot builds.
const REGISTRATION_REQUIRED_DEFAULT = true;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Payload + verify types
// ---------------------------------------------------------------------------

export interface CommandEveLicensePayload {
  license_version: string;
  edition: CommandEveLicenseEdition;
  serial: string;
  tenant_serial: string;
  issued_at: string;
  expires_at: string | null;
}

/**
 * Which trusted key verified a code, recorded on the entitlement + audit event
 * for traceability (1.1.0 multi-key):
 *   - 'founder' = bundled `command-eve-license-public-key.pem` (offline key);
 *   - 'server'  = bundled `command-eve-license-public-key-server.pem` (SaaS key);
 *   - 'env'     = a key supplied via COMMAND_EVE_LICENSE_PUBLIC_KEY (override).
 * Not PII — no email/name/raw-code, only a provenance tag.
 */
export const COMMAND_EVE_LICENSE_ISSUERS = ['founder', 'server', 'env'] as const;
export type CommandEveLicenseIssuer = (typeof COMMAND_EVE_LICENSE_ISSUERS)[number];

/** One trusted public key PEM plus the issuer tag it represents (resolution order). */
export interface CommandEveLicenseKeyEntry {
  issuer: CommandEveLicenseIssuer;
  pem: string;
}

export type VerifyLicenseCodeResult =
  | { ok: true; payload: CommandEveLicensePayload }
  | { ok: false; reason_code: CommandEveLicenseReasonCode };

/** Multi-key verify result: on success, also records WHICH key verified. */
export type VerifyLicenseCodeMultiResult =
  | { ok: true; payload: CommandEveLicensePayload; issuer: CommandEveLicenseIssuer }
  | { ok: false; reason_code: CommandEveLicenseReasonCode };

// ---------------------------------------------------------------------------
// base64url helpers (no padding) — byte-for-byte parity with the .mjs core.
// ---------------------------------------------------------------------------

function fromBase64Url(value: string): Buffer | null {
  if (typeof value !== 'string' || value.length === 0 || /[^A-Za-z0-9_-]/.test(value)) {
    return null;
  }
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + pad;
  try {
    return Buffer.from(normalized, 'base64');
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function coercePublicKey(publicKeyPem: string | crypto.KeyObject): crypto.KeyObject {
  if (publicKeyPem && typeof publicKeyPem === 'object' && (publicKeyPem as crypto.KeyObject).asymmetricKeyType) {
    return publicKeyPem as crypto.KeyObject;
  }
  return crypto.createPublicKey(publicKeyPem as string);
}

/**
 * Sign-time shape validation the .mjs verify core does NOT do.
 *
 * The .mjs core only checks `issued_at`/`expires_at` parse and `license_version`;
 * a signature over a payload missing `edition`/`serial`/`tenant_serial` would
 * pass its verify. The spec requires the app to never half-activate, so we
 * reject any signed-but-structurally-incomplete payload as MALFORMED.
 */
function payloadShapeValid(payload: Record<string, unknown>): boolean {
  if (!isNonEmptyString(payload.serial)) return false;
  if (!isNonEmptyString(payload.tenant_serial)) return false;
  if (!isNonEmptyString(payload.issued_at)) return false;
  if (!COMMAND_EVE_LICENSE_EDITIONS.includes(payload.edition as CommandEveLicenseEdition)) return false;
  // expires_at is optional: null/undefined = perpetual; a string must be present
  // if the key carries a value. Reject other types (number/object/etc).
  if (payload.expires_at !== null && payload.expires_at !== undefined && typeof payload.expires_at !== 'string') {
    return false;
  }
  return true;
}

/**
 * Verify a CEVE.v1 code offline against an embedded Ed25519 public key.
 *
 * Faithful TS port of `verifyLicenseCode` in
 * `scripts/licensing/license-code-core.mjs`. Check order (each → a distinct
 * reason code):
 *   1. structural shape + base64url decode + JSON object  -> LICENSE_MALFORMED
 *   2. wire prefix/version + payload license_version       -> LICENSE_VERSION_UNSUPPORTED
 *   3. payload required-field shape (TS addition)          -> LICENSE_MALFORMED
 *   4. ed25519 signature over the exact carried bytes      -> LICENSE_SIGNATURE_INVALID
 *   5. not-yet-valid (issued_at in the future)             -> LICENSE_NOT_YET_VALID
 *   6. expired (expires_at <= now, inclusive)              -> LICENSE_EXPIRED
 *
 * Signature is verified BEFORE the time checks so a forged payload can never get
 * far enough to leak whether its (forged) dates were the problem. A broken /
 * non-ed25519 public key throws (operator/config error), distinct from a code
 * being invalid.
 */
export function verifyLicenseCodeTs(args: {
  code: string;
  publicKeyPem: string | crypto.KeyObject;
  now?: Date | number | string;
}): VerifyLicenseCodeResult {
  const { code, publicKeyPem, now } = args;

  if (!isNonEmptyString(code)) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED };
  }

  const parts = code.trim().split('.');
  if (parts.length !== 4) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED };
  }

  const [prefix, wireVersion, payloadB64, sigB64] = parts;

  if (prefix !== COMMAND_EVE_LICENSE_CODE_PREFIX) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED };
  }
  if (wireVersion !== COMMAND_EVE_LICENSE_CODE_WIRE_VERSION) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.VERSION_UNSUPPORTED };
  }

  const payloadBytes = fromBase64Url(payloadB64);
  const signature = fromBase64Url(sigB64);
  if (!payloadBytes || !signature) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED };
  }
  const payload = parsed as Record<string, unknown>;

  if (payload.license_version !== COMMAND_EVE_LICENSE_CODE_VERSION) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.VERSION_UNSUPPORTED };
  }

  // TS addition: reject signed-but-incomplete payloads as MALFORMED.
  if (!payloadShapeValid(payload)) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED };
  }

  // Verify the signature over the EXACT bytes carried in the code, not a
  // re-serialization. A broken/missing key is an operator error -> throw.
  const key = coercePublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`verifyLicenseCodeTs: expected ed25519 public key, got ${key.asymmetricKeyType}`);
  }

  let signatureOk = false;
  try {
    signatureOk = crypto.verify(null, payloadBytes, key, signature);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.SIGNATURE_INVALID };
  }

  // Time checks only after the signature is trusted.
  const nowMs = now === undefined ? Date.now() : new Date(now).getTime();
  if (Number.isNaN(nowMs)) {
    throw new Error("verifyLicenseCodeTs: 'now' is not a valid date");
  }

  const issuedMs = Date.parse(payload.issued_at as string);
  if (Number.isNaN(issuedMs)) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED };
  }
  if (nowMs < issuedMs) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.NOT_YET_VALID };
  }

  if (payload.expires_at !== null && payload.expires_at !== undefined) {
    const expiresMs = Date.parse(payload.expires_at as string);
    if (Number.isNaN(expiresMs)) {
      return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED };
    }
    // Inclusive expiry: at-or-after the instant is expired.
    if (nowMs >= expiresMs) {
      return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.EXPIRED };
    }
  }

  const verified: CommandEveLicensePayload = {
    license_version: COMMAND_EVE_LICENSE_CODE_VERSION,
    edition: payload.edition as CommandEveLicenseEdition,
    serial: payload.serial as string,
    tenant_serial: payload.tenant_serial as string,
    issued_at: payload.issued_at as string,
    expires_at: (payload.expires_at as string | null | undefined) ?? null,
  };
  return { ok: true, payload: verified };
}

/**
 * Verify a CEVE.v1 code against an ORDERED LIST of trusted keys (1.1.0 multi-key).
 *
 * Tries each key in order; the FIRST key whose signature verifies wins and its
 * `issuer` is recorded. Honest reason-code distinction:
 *   - structural / version problems are key-INDEPENDENT (the payload bytes are the
 *     same for every key), so the first MALFORMED / VERSION_UNSUPPORTED short-
 *     circuits immediately — trying more keys cannot change that verdict;
 *   - SIGNATURE_INVALID against one key means "not this key" → keep trying. Only
 *     when EVERY key rejects the signature do we return LICENSE_SIGNATURE_INVALID;
 *   - a signature MATCH commits to that key: the per-key time checks (NOT_YET_VALID
 *     / EXPIRED) run AFTER the signature as today and short-circuit — a code valid
 *     under key B but expired is EXPIRED, never silently retried against other keys
 *     (signature-before-time order is preserved per key).
 *
 * A broken/non-ed25519 key in the list throws (operator/config error), exactly as
 * the single-key path does — the caller maps that to LICENSE_KEY_UNCONFIGURED.
 */
export function verifyLicenseCodeMultiTs(args: {
  code: string;
  keys: CommandEveLicenseKeyEntry[];
  now?: Date | number | string;
}): VerifyLicenseCodeMultiResult {
  const { code, keys, now } = args;

  // No keys at all is the caller's "unconfigured" concern, but guard defensively:
  // with nothing to verify against, nothing can be a valid signature.
  if (!Array.isArray(keys) || keys.length === 0) {
    return { ok: false, reason_code: COMMAND_EVE_LICENSE_REASON_CODES.SIGNATURE_INVALID };
  }

  let lastNonMatch: VerifyLicenseCodeResult & { ok: false } = {
    ok: false,
    reason_code: COMMAND_EVE_LICENSE_REASON_CODES.SIGNATURE_INVALID,
  };

  for (const entry of keys) {
    const result = verifyLicenseCodeTs({ code, publicKeyPem: entry.pem, now });
    if (result.ok === true) {
      return { ok: true, payload: result.payload, issuer: entry.issuer };
    }
    // From here `result` is the failure branch.
    const reason: CommandEveLicenseReasonCode = result.reason_code;
    // Key-independent verdicts (same payload bytes for every key) short-circuit:
    // trying another key can never turn MALFORMED / VERSION_UNSUPPORTED into a pass.
    if (
      reason === COMMAND_EVE_LICENSE_REASON_CODES.MALFORMED ||
      reason === COMMAND_EVE_LICENSE_REASON_CODES.VERSION_UNSUPPORTED
    ) {
      return { ok: false, reason_code: reason };
    }
    // EXPIRED / NOT_YET_VALID mean THIS key's signature matched (signature is checked
    // before time): the code belongs to this key but is time-invalid. Commit to it —
    // do not retry other keys (preserve per-key signature-before-time ordering).
    if (
      reason === COMMAND_EVE_LICENSE_REASON_CODES.EXPIRED ||
      reason === COMMAND_EVE_LICENSE_REASON_CODES.NOT_YET_VALID
    ) {
      return { ok: false, reason_code: reason };
    }
    // SIGNATURE_INVALID against this key only ⇒ try the next key.
    lastNonMatch = { ok: false, reason_code: reason };
  }

  // No key in the list produced a matching signature.
  return lastNonMatch;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface CommandEveRegistrationRecord {
  version: typeof COMMAND_EVE_REGISTRATION_RECORD_VERSION;
  tenant_id: string;
  name: string;
  company: string;
  email: string;
  gdpr_consent: true;
  gdpr_consent_at: string;
  registered_at: string;
}

export interface CommandEveEntitlementRecord {
  version: typeof COMMAND_EVE_ENTITLEMENT_RECORD_VERSION;
  tenant_id: string;
  code_serial: string;
  edition: CommandEveLicenseEdition;
  expires_at: string | null;
  activated_at: string;
  /**
   * Which trusted key verified this code (1.1.0 multi-key) — audit traceability
   * only, not PII. Optional for backward compatibility with v0 records written
   * by the single-key build (absent = legacy/unknown issuer).
   */
  issuer?: CommandEveLicenseIssuer;
}

export type CommandEveEntitlementGateState =
  | 'unconfigured'
  | 'unregistered'
  | 'registered_unlicensed'
  | 'entitled'
  | 'expired';

export interface CommandEveEntitlementStatusResult {
  version: typeof COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION;
  ok: boolean;
  required: boolean;
  state: CommandEveEntitlementGateState;
  reason_code?: CommandEveLicenseReasonCode;
  message?: string;
  tenant_id?: string;
  edition?: CommandEveLicenseEdition;
  expires_at?: string | null;
}

export interface CommandEveRegisterResult {
  version: typeof COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION;
  ok: boolean;
  reason_code?: string;
  message?: string;
  record?: Omit<CommandEveRegistrationRecord, never>;
}

export interface CommandEveActivateResult {
  version: typeof COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION;
  ok: boolean;
  reason_code?: CommandEveLicenseReasonCode | string;
  message?: string;
  record?: CommandEveEntitlementRecord;
  audit_event_id?: string;
  idempotent?: boolean;
}

export interface CommandEveEntitlementOptions {
  /** App userData root (Electron `app.getPath('userData')`). */
  userDataPath: string;
  /** Injectable env for the feature flag + public-key override. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Injectable clock. Defaults to `() => new Date()`. */
  now?: () => Date;
  /**
   * Bundled public-key resource path override (tests + non-Electron). Defaults to
   * the resolved `public/command-eve-license-public-key.pem` candidate list.
   */
  bundledPublicKeyPath?: string;
}

export interface RegisterTenantInput {
  name: string;
  company: string;
  email: string;
  consent: boolean;
}

// ---------------------------------------------------------------------------
// Storage helpers (LOCAL ONLY, 0600 care — mirrors writeJsonAtomic in
// runtimeBootstrapCore.ts).
// ---------------------------------------------------------------------------

function entitlementStateDir(userDataPath: string): string {
  const root = path.resolve(userDataPath || path.join(os.homedir(), '.command-eve'));
  return path.join(root, 'command-eve-runtime', ENTITLEMENT_STATE_DIR);
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

function readRegistration(userDataPath: string): CommandEveRegistrationRecord | null {
  const record = readJsonFile<CommandEveRegistrationRecord>(
    path.join(entitlementStateDir(userDataPath), REGISTRATION_FILE)
  );
  if (!record || typeof record !== 'object') return null;
  if (record.gdpr_consent !== true) return null;
  if (!isNonEmptyString(record.tenant_id)) return null;
  return record;
}

function readEntitlement(userDataPath: string): CommandEveEntitlementRecord | null {
  const record = readJsonFile<CommandEveEntitlementRecord>(
    path.join(entitlementStateDir(userDataPath), ENTITLEMENT_FILE)
  );
  if (!record || typeof record !== 'object') return null;
  if (!isNonEmptyString(record.tenant_id) || !isNonEmptyString(record.code_serial)) return null;
  return record;
}

// ---------------------------------------------------------------------------
// Feature flag + public-key resolution
// ---------------------------------------------------------------------------

export function isRegistrationRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[REGISTRATION_REQUIRED_FLAG];
  if (raw === undefined || raw === '') return REGISTRATION_REQUIRED_DEFAULT;
  const normalized = String(raw).trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
  return REGISTRATION_REQUIRED_DEFAULT;
}

function looksLikePem(value: string): boolean {
  return value.includes('-----BEGIN') && value.includes('KEY-----');
}

/**
 * Split a blob that may hold one OR several concatenated PEM blocks into the
 * individual `-----BEGIN…-----END…-----` blocks. Whitespace/comments between
 * blocks are ignored. Returns [] when the blob holds no recognizable PEM.
 */
function splitPemBlocks(blob: string): string[] {
  if (typeof blob !== 'string' || !looksLikePem(blob)) return [];
  const matches = blob.match(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g);
  return matches ? matches.map((block) => block.trim()).filter(Boolean) : [];
}

/**
 * Resolve a bundled candidate file path for a given filename.
 *
 * The `bundledPublicKeyPath` override (test/non-Electron seam) anchors the
 * founder key file:
 *   - if it points at an EXISTING file, that file is the founder key verbatim
 *     (legacy single-key contract; the server file is then looked up as a
 *     sibling of it);
 *   - if it points at a MISSING/sentinel path (the existing "no bundled key"
 *     test seam), its DIRECTORY still anchors sibling lookups, so a founder
 *     and/or server key dropped next to the sentinel is found by its real
 *     filename — and an absent file simply yields ''.
 *
 * Returns '' when no candidate exists.
 */
function resolveBundledKeyPath(options: CommandEveEntitlementOptions, fileName: string): string {
  if (isNonEmptyString(options.bundledPublicKeyPath)) {
    // Founder file + the override points at an existing file ⇒ use it verbatim.
    if (
      fileName === BUNDLED_PUBLIC_KEY_FILE &&
      fs.existsSync(options.bundledPublicKeyPath)
    ) {
      return options.bundledPublicKeyPath;
    }
    // Otherwise the override's directory anchors the real bundled filenames.
    const sibling = path.join(path.dirname(options.bundledPublicKeyPath), fileName);
    return fs.existsSync(sibling) ? sibling : '';
  }
  const env = options.env ?? process.env;
  const candidates = [
    // Electron packaged: extraResources copies `public/` to the resources root.
    env.COMMAND_EVE_RESOURCES_PATH ? path.join(env.COMMAND_EVE_RESOURCES_PATH, fileName) : '',
    // Dev / unit run from repo root.
    path.join(process.cwd(), 'public', fileName),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

/** Read a PEM file and return its (split) blocks; [] on any read/parse failure. */
function readPemFileBlocks(filePath: string): string[] {
  if (!filePath) return [];
  try {
    if (!fs.existsSync(filePath)) return [];
    return splitPemBlocks(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Resolve the ORDERED LIST of trusted public keys (1.1.0 multi-key).
 *
 *   - COMMAND_EVE_LICENSE_PUBLIC_KEY set (PEM string OR file path; one or many
 *     concatenated PEM blocks) ⇒ REPLACES the bundled list entirely, each block
 *     tagged issuer 'env';
 *   - otherwise the bundled list, in order:
 *       1. founder `command-eve-license-public-key.pem`,
 *       2. server  `command-eve-license-public-key-server.pem` (OPTIONAL — an
 *          absent file is skipped, never an error).
 *
 * Returns [] when no key is resolvable anywhere ⇒ gate is 'unconfigured'.
 */
export function resolveLicensePublicKeyEntries(
  options: CommandEveEntitlementOptions
): CommandEveLicenseKeyEntry[] {
  const env = options.env ?? process.env;
  const fromEnv = env[PUBLIC_KEY_ENV];

  // Env override REPLACES the bundled list when set (and parseable).
  if (isNonEmptyString(fromEnv)) {
    const blocks = looksLikePem(fromEnv) ? splitPemBlocks(fromEnv) : readPemFileBlocks(fromEnv);
    if (blocks.length > 0) {
      return blocks.map((pem) => ({ issuer: 'env' as const, pem }));
    }
    // Env was set but unparseable: fall through to the bundled list (the env value
    // simply contributes nothing rather than blocking the bundled keys).
  }

  const entries: CommandEveLicenseKeyEntry[] = [];
  for (const founderPem of readPemFileBlocks(resolveBundledKeyPath(options, BUNDLED_PUBLIC_KEY_FILE))) {
    entries.push({ issuer: 'founder', pem: founderPem });
  }
  for (const serverPem of readPemFileBlocks(resolveBundledKeyPath(options, BUNDLED_SERVER_PUBLIC_KEY_FILE))) {
    entries.push({ issuer: 'server', pem: serverPem });
  }
  return entries;
}

/**
 * Back-compatible single-PEM accessor: the FIRST resolved trusted key, or null
 * when none is available. Kept so existing single-key call sites and the
 * 'unconfigured' (null) signal stay valid; multi-key verification uses
 * `resolveLicensePublicKeyEntries`.
 */
export function resolveLicensePublicKeyPem(options: CommandEveEntitlementOptions): string | null {
  const entries = resolveLicensePublicKeyEntries(options);
  return entries.length > 0 ? entries[0].pem : null;
}

// ---------------------------------------------------------------------------
// Audit event — agent-event/v1, NO PII.
// ---------------------------------------------------------------------------

function agentEventsPath(userDataPath: string): string {
  return path.join(entitlementStateDir(userDataPath), AGENT_EVENTS_FILE);
}

function sanitizeEventIdPart(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function activationAuditEventId(tenantId: string, codeSerial: string): string {
  // Stable per (tenant, code_serial) so idempotent re-activation never double-writes.
  return ['command-eve-entitlement-activated', sanitizeEventIdPart(tenantId), sanitizeEventIdPart(codeSerial)].join('-');
}

function appendActivationAuditEvent(args: {
  userDataPath: string;
  eventId: string;
  occurredAt: string;
  tenantId: string;
  codeSerial: string;
  edition: CommandEveLicenseEdition;
  issuer?: CommandEveLicenseIssuer;
}): void {
  const ledgerPath = agentEventsPath(args.userDataPath);
  // Idempotency guard at the ledger layer: never append the same event_id twice.
  if (fs.existsSync(ledgerPath)) {
    const existing = fs.readFileSync(ledgerPath, 'utf8');
    if (existing.includes(`"event_id":"${args.eventId}"`)) return;
  }
  const event = {
    schema_version: 'agent-event/v1',
    event_id: args.eventId,
    event_type: 'command-eve.entitlement.activated',
    occurred_at: args.occurredAt,
    producer: 'human',
    workspace: 'command-eve-local',
    workspace_path: ledgerPath,
    issue_id: args.tenantId,
    parent_issue_id: '',
    run_id: `entitlement-${sanitizeEventIdPart(args.tenantId)}`,
    session_id: '',
    agent: 'eve',
    mode: 'entitlement-activate',
    role_owner: 'Founder',
    department: 'Operations',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      // NO PII — tenant_id + code_serial + edition (+ key issuer) only (spec §5.1).
      // `issuer` is a provenance tag ('founder' | 'server' | 'env'), not PII.
      tenant_id: args.tenantId,
      code_serial: args.codeSerial,
      edition: args.edition,
      ...(args.issuer ? { issuer: args.issuer } : {}),
    },
    artifact_paths: [] as string[],
    linear_comment_ids: [] as string[],
    human_gate_required: false,
    redaction_level: 'internal',
  };
  ensureDir(path.dirname(ledgerPath));
  fs.appendFileSync(ledgerPath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function normalizeField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Persist the local-only S2 PII registration record. Generates the tenant_id
 * (multi-tenant seam, spec §7). Idempotent: re-registering keeps the existing
 * tenant_id so an already-activated entitlement does not orphan.
 */
export function registerTenant(
  input: RegisterTenantInput,
  options: CommandEveEntitlementOptions
): CommandEveRegisterResult {
  const now = options.now ?? (() => new Date());

  if (input?.consent !== true) {
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      reason_code: 'CONSENT_REQUIRED',
      message: 'GDPR consent is required to register and is stored locally only.',
    };
  }

  const name = normalizeField(input.name);
  const company = normalizeField(input.company);
  const email = normalizeField(input.email);

  if (!name || !company || !email) {
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      reason_code: 'REGISTRATION_FIELDS_REQUIRED',
      message: 'name, company and email are all required.',
    };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      reason_code: 'REGISTRATION_EMAIL_INVALID',
      message: 'email must be a valid address.',
    };
  }

  const existing = readRegistration(options.userDataPath);
  const tenantId = existing?.tenant_id ?? crypto.randomUUID();
  const occurredAt = now().toISOString();

  const record: CommandEveRegistrationRecord = {
    version: COMMAND_EVE_REGISTRATION_RECORD_VERSION,
    tenant_id: tenantId,
    name,
    company,
    email,
    gdpr_consent: true,
    gdpr_consent_at: occurredAt,
    registered_at: existing?.registered_at ?? occurredAt,
  };

  writeJsonAtomic600(path.join(entitlementStateDir(options.userDataPath), REGISTRATION_FILE), record);

  return {
    version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
    ok: true,
    record,
  };
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/**
 * Activate an entitlement: requires an existing registration, verifies the code
 * against the resolved ORDERED key list (founder/server/env — first match wins),
 * records WHICH key verified as the entitlement `issuer`, persists the record,
 * and appends ONE PII-free activation audit event. Idempotent on the same
 * code_serial.
 */
export function activateEntitlement(
  args: { code: string },
  options: CommandEveEntitlementOptions
): CommandEveActivateResult {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());

  const registration = readRegistration(options.userDataPath);
  if (!registration) {
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      reason_code: 'REGISTRATION_REQUIRED',
      message: 'A completed registration is required before activating a license.',
    };
  }

  const keyEntries = resolveLicensePublicKeyEntries(options);
  if (keyEntries.length === 0) {
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      reason_code: 'LICENSE_KEY_UNCONFIGURED',
      message:
        'No license public key is configured. Set COMMAND_EVE_LICENSE_PUBLIC_KEY or ship the bundled key before activation.',
    };
  }

  const verify = ((): VerifyLicenseCodeMultiResult | 'KEY_ERROR' => {
    try {
      return verifyLicenseCodeMultiTs({ code: args?.code ?? '', keys: keyEntries, now: now() });
    } catch {
      // A broken configured key is an operator error, not an invalid code.
      return 'KEY_ERROR';
    }
  })();

  if (verify === 'KEY_ERROR') {
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      reason_code: 'LICENSE_KEY_UNCONFIGURED',
      message: 'The configured license public key is invalid.',
    };
  }

  if (verify.ok !== true) {
    const reasonCode = verify.reason_code;
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      reason_code: reasonCode,
      message: `License code rejected: ${reasonCode}.`,
    };
  }

  const occurredAt = now().toISOString();
  const codeSerial = verify.payload.serial;
  const issuer = verify.issuer;

  // Idempotent on the same code_serial: if an entitlement for this serial already
  // exists under this tenant, return it without re-writing or re-auditing.
  const existing = readEntitlement(options.userDataPath);
  if (existing && existing.tenant_id === registration.tenant_id && existing.code_serial === codeSerial) {
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: true,
      record: existing,
      audit_event_id: activationAuditEventId(registration.tenant_id, codeSerial),
      idempotent: true,
    };
  }

  const record: CommandEveEntitlementRecord = {
    version: COMMAND_EVE_ENTITLEMENT_RECORD_VERSION,
    tenant_id: registration.tenant_id,
    code_serial: codeSerial,
    edition: verify.payload.edition,
    expires_at: verify.payload.expires_at,
    activated_at: occurredAt,
    issuer,
  };

  writeJsonAtomic600(path.join(entitlementStateDir(options.userDataPath), ENTITLEMENT_FILE), record);

  const eventId = activationAuditEventId(registration.tenant_id, codeSerial);
  appendActivationAuditEvent({
    userDataPath: options.userDataPath,
    eventId,
    occurredAt,
    tenantId: registration.tenant_id,
    codeSerial,
    edition: verify.payload.edition,
    issuer,
  });

  return {
    version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
    ok: true,
    record,
    audit_event_id: eventId,
    idempotent: false,
  };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Compute the current gate state. Re-evaluates expiry against the real clock on
 * every call (spec §6: never cache "valid forever"). Fail-closed: when the flag
 * is ON but no public key is configured, the state is 'unconfigured'.
 */
export function getEntitlementStatus(options: CommandEveEntitlementOptions): CommandEveEntitlementStatusResult {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const required = isRegistrationRequired(env);

  // Flag OFF ⇒ gate not enforced; surface state honestly but never block.
  if (!required) {
    const registration = readRegistration(options.userDataPath);
    const entitlement = readEntitlement(options.userDataPath);
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: true,
      required: false,
      state: entitlement ? 'entitled' : registration ? 'registered_unlicensed' : 'unregistered',
      ...(registration ? { tenant_id: registration.tenant_id } : {}),
      ...(entitlement ? { edition: entitlement.edition, expires_at: entitlement.expires_at } : {}),
    };
  }

  // Fail-closed: no key configured ⇒ unconfigured (distinct from invalid code).
  const publicKeyPem = resolveLicensePublicKeyPem(options);
  if (!publicKeyPem) {
    const registration = readRegistration(options.userDataPath);
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      required: true,
      state: 'unconfigured',
      message:
        'License verification is unconfigured: no public key is available. Contact the operator / use the pilot fallback flag.',
      ...(registration ? { tenant_id: registration.tenant_id } : {}),
    };
  }

  const registration = readRegistration(options.userDataPath);
  if (!registration) {
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      required: true,
      state: 'unregistered',
    };
  }

  const entitlement = readEntitlement(options.userDataPath);
  if (!entitlement || entitlement.tenant_id !== registration.tenant_id) {
    return {
      version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
      ok: false,
      required: true,
      state: 'registered_unlicensed',
      tenant_id: registration.tenant_id,
    };
  }

  // Re-evaluate expiry against the real clock (spec §6).
  if (entitlement.expires_at !== null && entitlement.expires_at !== undefined) {
    const expiresMs = Date.parse(entitlement.expires_at);
    if (Number.isNaN(expiresMs) || now().getTime() >= expiresMs) {
      return {
        version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
        ok: false,
        required: true,
        state: 'expired',
        reason_code: COMMAND_EVE_LICENSE_REASON_CODES.EXPIRED,
        tenant_id: registration.tenant_id,
        edition: entitlement.edition,
        expires_at: entitlement.expires_at,
      };
    }
  }

  return {
    version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
    ok: true,
    required: true,
    state: 'entitled',
    tenant_id: registration.tenant_id,
    edition: entitlement.edition,
    expires_at: entitlement.expires_at,
  };
}
