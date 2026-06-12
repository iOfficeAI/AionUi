/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  activateEntitlement,
  getEntitlementStatus,
  registerTenant,
  resolveLicensePublicKeyEntries,
  verifyLicenseCodeMultiTs,
  verifyLicenseCodeTs,
  type CommandEveEntitlementOptions,
  type CommandEveLicenseEdition,
} from '@/process/commandEve/entitlementCore';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-entitlement-test-'));
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

/** Generate a throwaway Ed25519 keypair (no key material ever leaves the test). */
const makeKeypair = (): { publicKeyPem: string; privateKey: crypto.KeyObject } => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey,
  };
};

// base64url (no padding) — mirror of the .mjs wire encoder.
const toBase64Url = (buffer: Buffer): string =>
  Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

// Canonical key order from scripts/licensing/license-code-core.mjs.
const canonicalPayloadJson = (payload: Record<string, unknown>): string =>
  JSON.stringify({
    license_version: payload.license_version ?? null,
    edition: payload.edition ?? null,
    serial: payload.serial ?? null,
    tenant_serial: payload.tenant_serial ?? null,
    issued_at: payload.issued_at ?? null,
    expires_at: payload.expires_at ?? null,
  });

/** Tiny in-test signer mirroring the CEVE.v1 wire format. */
const signCode = (
  privateKey: crypto.KeyObject,
  payload: Record<string, unknown>,
  opts: { canonical?: boolean } = {}
): string => {
  const json = opts.canonical === false ? JSON.stringify(payload) : canonicalPayloadJson(payload);
  const payloadBytes = Buffer.from(json, 'utf8');
  const signature = crypto.sign(null, payloadBytes, privateKey);
  return ['CEVE', 'v1', toBase64Url(payloadBytes), toBase64Url(signature)].join('.');
};

const validPayload = (
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  license_version: 'command-eve-license/v1',
  edition: 'pilot' as CommandEveLicenseEdition,
  serial: 'CEVE-PILOT-0001',
  tenant_serial: 'TENANT-0001',
  issued_at: '2026-01-01T00:00:00.000Z',
  expires_at: '2027-01-01T00:00:00.000Z',
  ...overrides,
});

const NOW = new Date('2026-06-12T00:00:00.000Z');

const optionsFor = (
  root: string,
  publicKeyPem: string | undefined,
  env: NodeJS.ProcessEnv = {}
): CommandEveEntitlementOptions => ({
  userDataPath: root,
  now: () => NOW,
  // Point the bundled-key resolver at a path that does not exist so only the
  // env override (when set) provides a key.
  bundledPublicKeyPath: path.join(root, '__no_bundled_key__.pem'),
  env: {
    COMMAND_EVE_REGISTRATION_REQUIRED: 'true',
    ...(publicKeyPem ? { COMMAND_EVE_LICENSE_PUBLIC_KEY: publicKeyPem } : {}),
    ...env,
  },
});

const register = (options: CommandEveEntitlementOptions) =>
  registerTenant({ name: 'Alois', company: 'Alois GmbH', email: 'alois@example.com', consent: true }, options);

// ---------------------------------------------------------------------------
// verifyLicenseCodeTs — port parity with the .mjs core
// ---------------------------------------------------------------------------

describe('verifyLicenseCodeTs', () => {
  it('accepts a valid signed CEVE.v1 code', () => {
    const { publicKeyPem, privateKey } = makeKeypair();
    const code = signCode(privateKey, validPayload());
    const result = verifyLicenseCodeTs({ code, publicKeyPem, now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.serial).toBe('CEVE-PILOT-0001');
      expect(result.payload.edition).toBe('pilot');
      expect(result.payload.expires_at).toBe('2027-01-01T00:00:00.000Z');
    }
  });

  it('rejects a tampered payload with SIGNATURE_INVALID', () => {
    const { publicKeyPem, privateKey } = makeKeypair();
    const code = signCode(privateKey, validPayload());
    // Flip the payload segment to a different (re-signed-with-wrong-key) body.
    const tampered = code.split('.');
    const otherPayload = Buffer.from(canonicalPayloadJson(validPayload({ edition: 'standard' })), 'utf8');
    tampered[2] = toBase64Url(otherPayload);
    const result = verifyLicenseCodeTs({ code: tampered.join('.'), publicKeyPem, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_SIGNATURE_INVALID');
  });

  it('rejects a code signed by the wrong key with SIGNATURE_INVALID', () => {
    const trusted = makeKeypair();
    const attacker = makeKeypair();
    const code = signCode(attacker.privateKey, validPayload());
    const result = verifyLicenseCodeTs({ code, publicKeyPem: trusted.publicKeyPem, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_SIGNATURE_INVALID');
  });

  it('rejects an expired code with EXPIRED (signature checked first)', () => {
    const { publicKeyPem, privateKey } = makeKeypair();
    const code = signCode(privateKey, validPayload({ expires_at: '2026-03-01T00:00:00.000Z' }));
    const result = verifyLicenseCodeTs({ code, publicKeyPem, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_EXPIRED');
  });

  it('rejects a not-yet-valid code with NOT_YET_VALID', () => {
    const { publicKeyPem, privateKey } = makeKeypair();
    const code = signCode(privateKey, validPayload({ issued_at: '2026-12-01T00:00:00.000Z' }));
    const result = verifyLicenseCodeTs({ code, publicKeyPem, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_NOT_YET_VALID');
  });

  it('rejects an unsupported wire version with VERSION_UNSUPPORTED', () => {
    const { publicKeyPem, privateKey } = makeKeypair();
    const code = signCode(privateKey, validPayload()).replace(/^CEVE\.v1\./, 'CEVE.v2.');
    const result = verifyLicenseCodeTs({ code, publicKeyPem, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_VERSION_UNSUPPORTED');
  });

  it('rejects an unsupported payload license_version with VERSION_UNSUPPORTED', () => {
    const { publicKeyPem, privateKey } = makeKeypair();
    const code = signCode(privateKey, validPayload({ license_version: 'command-eve-license/v2' }));
    const result = verifyLicenseCodeTs({ code, publicKeyPem, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_VERSION_UNSUPPORTED');
  });

  it('rejects a structurally broken code with MALFORMED', () => {
    const { publicKeyPem } = makeKeypair();
    const result = verifyLicenseCodeTs({ code: 'not-a-real-code', publicKeyPem, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_MALFORMED');
  });

  it('rejects a signed-but-shape-incomplete payload with MALFORMED (the .mjs foot-gun)', () => {
    const { publicKeyPem, privateKey } = makeKeypair();
    // Validly signed, but missing serial + tenant_serial: the .mjs verify would
    // pass this; our TS port must reject it as MALFORMED.
    const incomplete = {
      license_version: 'command-eve-license/v1',
      edition: 'pilot',
      issued_at: '2026-01-01T00:00:00.000Z',
      expires_at: null,
    };
    const code = signCode(privateKey, incomplete);
    const result = verifyLicenseCodeTs({ code, publicKeyPem, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_MALFORMED');
  });
});

// ---------------------------------------------------------------------------
// verifyLicenseCodeMultiTs — 1.1.0 multi-key: first key that verifies wins
// ---------------------------------------------------------------------------

describe('verifyLicenseCodeMultiTs', () => {
  it('verifies a code signed by key A against the ordered list [A, B] (issuer = founder)', () => {
    const a = makeKeypair();
    const b = makeKeypair();
    const code = signCode(a.privateKey, validPayload());
    const result = verifyLicenseCodeMultiTs({
      code,
      keys: [
        { issuer: 'founder', pem: a.publicKeyPem },
        { issuer: 'server', pem: b.publicKeyPem },
      ],
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.issuer).toBe('founder');
      expect(result.payload.serial).toBe('CEVE-PILOT-0001');
    }
  });

  it('verifies a code signed by key B against the ordered list [A, B] (issuer = server)', () => {
    const a = makeKeypair();
    const b = makeKeypair();
    const code = signCode(b.privateKey, validPayload());
    const result = verifyLicenseCodeMultiTs({
      code,
      keys: [
        { issuer: 'founder', pem: a.publicKeyPem },
        { issuer: 'server', pem: b.publicKeyPem },
      ],
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issuer).toBe('server');
  });

  it('rejects a code signed by an untrusted key C against [A, B] with SIGNATURE_INVALID', () => {
    const a = makeKeypair();
    const b = makeKeypair();
    const c = makeKeypair();
    const code = signCode(c.privateKey, validPayload());
    const result = verifyLicenseCodeMultiTs({
      code,
      keys: [
        { issuer: 'founder', pem: a.publicKeyPem },
        { issuer: 'server', pem: b.publicKeyPem },
      ],
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_SIGNATURE_INVALID');
  });

  it('reports EXPIRED (not SIGNATURE_INVALID) when the matching key signed an expired code', () => {
    const a = makeKeypair();
    const b = makeKeypair();
    // Signed by B, expired: B matches → time check runs → EXPIRED, no retry of A.
    const code = signCode(b.privateKey, validPayload({ expires_at: '2026-03-01T00:00:00.000Z' }));
    const result = verifyLicenseCodeMultiTs({
      code,
      keys: [
        { issuer: 'founder', pem: a.publicKeyPem },
        { issuer: 'server', pem: b.publicKeyPem },
      ],
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_code).toBe('LICENSE_EXPIRED');
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('registerTenant', () => {
  it('persists a registration record and generates a tenant_id', () => {
    const root = makeRoot();
    const { publicKeyPem } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    const result = register(options);
    expect(result.ok).toBe(true);
    expect(result.record?.tenant_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.record?.gdpr_consent).toBe(true);
    expect(result.record?.gdpr_consent_at).toBe(NOW.toISOString());
  });

  it('rejects registration without consent (CONSENT_REQUIRED)', () => {
    const root = makeRoot();
    const { publicKeyPem } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    const result = registerTenant(
      { name: 'Alois', company: 'Alois GmbH', email: 'alois@example.com', consent: false },
      options
    );
    expect(result.ok).toBe(false);
    expect(result.reason_code).toBe('CONSENT_REQUIRED');
  });

  it('rejects missing required fields', () => {
    const root = makeRoot();
    const { publicKeyPem } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    const result = registerTenant({ name: '', company: 'X', email: 'a@b.co', consent: true }, options);
    expect(result.ok).toBe(false);
    expect(result.reason_code).toBe('REGISTRATION_FIELDS_REQUIRED');
  });

  it('rejects an invalid email', () => {
    const root = makeRoot();
    const { publicKeyPem } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    const result = registerTenant({ name: 'A', company: 'X', email: 'not-an-email', consent: true }, options);
    expect(result.ok).toBe(false);
    expect(result.reason_code).toBe('REGISTRATION_EMAIL_INVALID');
  });
});

// ---------------------------------------------------------------------------
// Activation + audit + idempotency
// ---------------------------------------------------------------------------

describe('activateEntitlement', () => {
  it('activates with a valid code, persists the entitlement + one PII-free audit event', () => {
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    register(options);

    const code = signCode(privateKey, validPayload());
    const result = activateEntitlement({ code }, options);
    expect(result.ok).toBe(true);
    expect(result.idempotent).toBe(false);
    expect(result.record?.code_serial).toBe('CEVE-PILOT-0001');
    expect(result.record?.edition).toBe('pilot');
    // 1.1.0: the env-injected key tags the entitlement issuer as 'env'.
    expect(result.record?.issuer).toBe('env');

    // Audit event written, agent-event/v1, carries NO PII (issuer is a provenance
    // tag, not PII).
    const ledgerPath = path.join(root, 'command-eve-runtime', 'entitlement', 'agent-events.jsonl');
    const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]);
    expect(event.schema_version).toBe('agent-event/v1');
    expect(event.event_type).toBe('command-eve.entitlement.activated');
    expect(event.payload).toEqual({
      tenant_id: result.record?.tenant_id,
      code_serial: 'CEVE-PILOT-0001',
      edition: 'pilot',
      issuer: 'env',
    });
    // No PII anywhere in the serialized event.
    const raw = lines[0];
    expect(raw).not.toContain('alois@example.com');
    expect(raw).not.toContain('Alois');
    // The raw code never lands in the ledger.
    expect(raw).not.toContain(code);
  });

  it('is idempotent on re-activation of the same code_serial (no second audit event)', () => {
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    register(options);

    const code = signCode(privateKey, validPayload());
    const first = activateEntitlement({ code }, options);
    const second = activateEntitlement({ code }, options);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.idempotent).toBe(true);
    expect(second.audit_event_id).toBe(first.audit_event_id);

    const ledgerPath = path.join(root, 'command-eve-runtime', 'entitlement', 'agent-events.jsonl');
    const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it('blocks activation without a prior registration (REGISTRATION_REQUIRED)', () => {
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    const code = signCode(privateKey, validPayload());
    const result = activateEntitlement({ code }, options);
    expect(result.ok).toBe(false);
    expect(result.reason_code).toBe('REGISTRATION_REQUIRED');
  });

  it('rejects an expired code at activation with EXPIRED', () => {
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    register(options);
    const code = signCode(privateKey, validPayload({ expires_at: '2026-03-01T00:00:00.000Z' }));
    const result = activateEntitlement({ code }, options);
    expect(result.ok).toBe(false);
    expect(result.reason_code).toBe('LICENSE_EXPIRED');
  });

  it('rejects a wrong-key code at activation with SIGNATURE_INVALID', () => {
    const root = makeRoot();
    const trusted = makeKeypair();
    const attacker = makeKeypair();
    const options = optionsFor(root, trusted.publicKeyPem);
    register(options);
    const code = signCode(attacker.privateKey, validPayload());
    const result = activateEntitlement({ code }, options);
    expect(result.ok).toBe(false);
    expect(result.reason_code).toBe('LICENSE_SIGNATURE_INVALID');
  });
});

// ---------------------------------------------------------------------------
// Status + persistence + flag
// ---------------------------------------------------------------------------

describe('getEntitlementStatus', () => {
  it('is unconfigured when the flag is ON but no public key is available', () => {
    const root = makeRoot();
    const options = optionsFor(root, undefined); // no env key, bundled path missing
    const status = getEntitlementStatus(options);
    expect(status.required).toBe(true);
    expect(status.state).toBe('unconfigured');
    expect(status.ok).toBe(false);
  });

  it('is unregistered with a key present but no registration', () => {
    const root = makeRoot();
    const { publicKeyPem } = makeKeypair();
    const status = getEntitlementStatus(optionsFor(root, publicKeyPem));
    expect(status.state).toBe('unregistered');
  });

  it('is registered_unlicensed after registration but before activation', () => {
    const root = makeRoot();
    const { publicKeyPem } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    register(options);
    const status = getEntitlementStatus(options);
    expect(status.state).toBe('registered_unlicensed');
    expect(status.tenant_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is entitled after register + activate', () => {
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    register(options);
    activateEntitlement({ code: signCode(privateKey, validPayload()) }, options);
    const status = getEntitlementStatus(options);
    expect(status.state).toBe('entitled');
    expect(status.ok).toBe(true);
    expect(status.edition).toBe('pilot');
  });

  it('re-locks to expired when the clock passes expires_at on a later launch', () => {
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    // Activate while valid.
    const activateOptions = optionsFor(root, publicKeyPem);
    register(activateOptions);
    activateEntitlement(
      { code: signCode(privateKey, validPayload({ expires_at: '2026-06-15T00:00:00.000Z' })) },
      activateOptions
    );
    // Later launch: clock now past expiry, same temp dir.
    const laterOptions: CommandEveEntitlementOptions = {
      ...optionsFor(root, publicKeyPem),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    };
    const status = getEntitlementStatus(laterOptions);
    expect(status.state).toBe('expired');
    expect(status.reason_code).toBe('LICENSE_EXPIRED');
  });

  it('stays entitled across a fresh core instance over the same temp dir (restart persistence)', () => {
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    const options = optionsFor(root, publicKeyPem);
    register(options);
    activateEntitlement({ code: signCode(privateKey, validPayload()) }, options);

    // Simulate a process restart: a brand-new options object, same userData root,
    // no re-entry of name/company/email/code.
    const restarted = optionsFor(root, publicKeyPem);
    const status = getEntitlementStatus(restarted);
    expect(status.state).toBe('entitled');
    expect(status.tenant_id).toBe(getEntitlementStatus(options).tenant_id);
  });

  it('reports not-required when the flag is OFF (gate bypass fallback)', () => {
    const root = makeRoot();
    const { publicKeyPem } = makeKeypair();
    const options = optionsFor(root, publicKeyPem, { COMMAND_EVE_REGISTRATION_REQUIRED: 'false' });
    const status = getEntitlementStatus(options);
    expect(status.required).toBe(false);
    expect(status.ok).toBe(true);
    // With the flag off and no registration, state is honest but never blocking.
    expect(status.state).toBe('unregistered');
  });

  it('accepts a public key supplied as a file path via env (W12 injection seam)', () => {
    const root = makeRoot();
    const { publicKeyPem } = makeKeypair();
    const keyFile = path.join(root, 'pilot-public-key.pem');
    fs.writeFileSync(keyFile, publicKeyPem);
    const options: CommandEveEntitlementOptions = {
      userDataPath: root,
      now: () => NOW,
      bundledPublicKeyPath: path.join(root, '__no_bundled_key__.pem'),
      env: { COMMAND_EVE_REGISTRATION_REQUIRED: 'true', COMMAND_EVE_LICENSE_PUBLIC_KEY: keyFile },
    };
    const status = getEntitlementStatus(options);
    // Key resolves from the file path ⇒ no longer 'unconfigured'.
    expect(status.state).toBe('unregistered');
  });
});

// ---------------------------------------------------------------------------
// 1.1.0 multi-key resolution + activation (founder + server + env)
// ---------------------------------------------------------------------------

describe('multi-key resolution + activation', () => {
  // The founder bundled file = `command-eve-license-public-key.pem`; the server
  // bundled file = `command-eve-license-public-key-server.pem`. `optionsFor`
  // points the founder-key resolver at `<root>/__no_bundled_key__.pem`, so
  // sibling bundled files resolve from `<root>`.
  const FOUNDER_FILE = 'command-eve-license-public-key.pem';
  const SERVER_FILE = 'command-eve-license-public-key-server.pem';

  it('env with TWO concatenated PEMs verifies a code signed by either embedded key', () => {
    const root = makeRoot();
    const a = makeKeypair();
    const b = makeKeypair();
    // Both PEMs concatenated into the single env var (issuer 'env' for all).
    const concatenated = `${a.publicKeyPem}\n${b.publicKeyPem}`;
    const options = optionsFor(root, concatenated);

    const entries = resolveLicensePublicKeyEntries(options);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.issuer === 'env')).toBe(true);

    register(options);
    // A code signed by the SECOND embedded PEM still activates.
    const result = activateEntitlement({ code: signCode(b.privateKey, validPayload()) }, options);
    expect(result.ok).toBe(true);
    expect(result.record?.issuer).toBe('env');
  });

  it('env with a SINGLE PEM still works (W12 e2e env contract preserved)', () => {
    const root = makeRoot();
    const { publicKeyPem, privateKey } = makeKeypair();
    const options = optionsFor(root, publicKeyPem); // single-PEM env injection

    const entries = resolveLicensePublicKeyEntries(options);
    expect(entries).toHaveLength(1);
    expect(entries[0].issuer).toBe('env');

    register(options);
    const result = activateEntitlement({ code: signCode(privateKey, validPayload()) }, options);
    expect(result.ok).toBe(true);
    expect(result.record?.issuer).toBe('env');
  });

  it('bundled founder + server keys: a server-signed code verifies (issuer = server)', () => {
    const root = makeRoot();
    const founder = makeKeypair();
    const server = makeKeypair();
    fs.writeFileSync(path.join(root, FOUNDER_FILE), founder.publicKeyPem);
    fs.writeFileSync(path.join(root, SERVER_FILE), server.publicKeyPem);
    // No env key → fall back to the bundled list (founder, then server).
    const options = optionsFor(root, undefined);

    const entries = resolveLicensePublicKeyEntries(options);
    expect(entries.map((e) => e.issuer)).toEqual(['founder', 'server']);

    register(options);
    const result = activateEntitlement({ code: signCode(server.privateKey, validPayload()) }, options);
    expect(result.ok).toBe(true);
    expect(result.record?.issuer).toBe('server');

    // The audit event carries the (non-PII) issuer provenance tag.
    const ledgerPath = path.join(root, 'command-eve-runtime', 'entitlement', 'agent-events.jsonl');
    const event = JSON.parse(fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean)[0]);
    expect(event.payload.issuer).toBe('server');
  });

  it('bundled founder + server keys: a founder-signed code verifies (issuer = founder)', () => {
    const root = makeRoot();
    const founder = makeKeypair();
    const server = makeKeypair();
    fs.writeFileSync(path.join(root, FOUNDER_FILE), founder.publicKeyPem);
    fs.writeFileSync(path.join(root, SERVER_FILE), server.publicKeyPem);
    const options = optionsFor(root, undefined);

    register(options);
    const result = activateEntitlement({ code: signCode(founder.privateKey, validPayload()) }, options);
    expect(result.ok).toBe(true);
    expect(result.record?.issuer).toBe('founder');
  });

  it('optional server PEM ABSENT: founder-only resolution still works (no error)', () => {
    const root = makeRoot();
    const founder = makeKeypair();
    // Only the founder file exists; server file deliberately not written.
    fs.writeFileSync(path.join(root, FOUNDER_FILE), founder.publicKeyPem);
    const options = optionsFor(root, undefined);

    const entries = resolveLicensePublicKeyEntries(options);
    expect(entries.map((e) => e.issuer)).toEqual(['founder']);

    register(options);
    const result = activateEntitlement({ code: signCode(founder.privateKey, validPayload()) }, options);
    expect(result.ok).toBe(true);
    expect(result.record?.issuer).toBe('founder');
  });

  it('rejects a code signed by an untrusted key against bundled [founder, server] with SIGNATURE_INVALID', () => {
    const root = makeRoot();
    const founder = makeKeypair();
    const server = makeKeypair();
    const attacker = makeKeypair();
    fs.writeFileSync(path.join(root, FOUNDER_FILE), founder.publicKeyPem);
    fs.writeFileSync(path.join(root, SERVER_FILE), server.publicKeyPem);
    const options = optionsFor(root, undefined);

    register(options);
    const result = activateEntitlement({ code: signCode(attacker.privateKey, validPayload()) }, options);
    expect(result.ok).toBe(false);
    expect(result.reason_code).toBe('LICENSE_SIGNATURE_INVALID');
  });

  it('no key resolvable anywhere ⇒ unconfigured (gate state unchanged)', () => {
    const root = makeRoot();
    // No env key, founder sentinel path missing, no bundled siblings written.
    const options = optionsFor(root, undefined);
    expect(resolveLicensePublicKeyEntries(options)).toHaveLength(0);
    const status = getEntitlementStatus(options);
    expect(status.state).toBe('unconfigured');
    expect(status.ok).toBe(false);
  });
});
