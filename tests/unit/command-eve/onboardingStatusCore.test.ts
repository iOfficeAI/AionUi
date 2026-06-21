import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCommandEveOnboardingStatus,
  type CommandEveOnboardingStatusOptions,
  type CommandEveOnboardingStatusModel,
  type CommandEveOnboardingItemId,
} from '../../../packages/desktop/src/process/commandEve/onboardingStatusCore';

// =========================================================================
// S0 keystone self-detection: the onboarding-status aggregator is the signal
// EVE reads to know her own setup state. The S0 build agent died on a
// transient API drop BEFORE writing these tests, so the keystone shipped
// untested. The single most important invariant: first_value_ready is gated
// on licensed + cloud-bearer ONLY — a blocked LOCAL lane must NEVER hold back
// first value (cloud is the default lane). These tests lock that + the
// reason-code -> remediation map + honest fallthrough + read resilience.
// We call the REAL exported function with injected entitlement/license readers
// and a tmp receipt file — no keychain, no real bootstrap.
// =========================================================================

type Ent = ReturnType<NonNullable<CommandEveOnboardingStatusOptions['readEntitlement']>>;
const ent = (state: string, reason_code?: string): Ent =>
  ({ state, reason_code }) as unknown as Ent;

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-onboarding-s0-'));
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

let receiptSeq = 0;
function writeReceipt(receipt: unknown): string {
  const p = path.join(tmp, `receipt-${receiptSeq++}.json`);
  fs.writeFileSync(p, JSON.stringify(receipt));
  return p;
}
const MISSING = () => path.join(tmp, `does-not-exist-${receiptSeq++}.json`);

function build(opts: Partial<CommandEveOnboardingStatusOptions>): CommandEveOnboardingStatusModel {
  const res = buildCommandEveOnboardingStatus({
    userDataPath: tmp,
    receiptPath: opts.receiptPath ?? MISSING(),
    firstRunProfilePath: opts.firstRunProfilePath ?? MISSING(),
    now: () => new Date('2026-06-21T00:00:00.000Z'),
    readEntitlement: opts.readEntitlement ?? (() => ent('entitled')),
    readLicenseWirePresence: opts.readLicenseWirePresence ?? (() => true),
    ...opts,
  });
  expect(res.ok, `build must succeed: ${res.reason_code ?? ''} ${res.message ?? ''}`).toBe(true);
  expect(res.model).toBeDefined();
  return res.model!;
}
const item = (m: CommandEveOnboardingStatusModel, id: CommandEveOnboardingItemId) =>
  m.items.find((i) => i.id === id)!;

describe('S0 onboarding-status: the first_value_ready gate (honesty keystone)', () => {
  it('a licensed cloud user (entitled + bearer) is first_value_ready', () => {
    const m = build({ readEntitlement: () => ent('entitled'), readLicenseWirePresence: () => true });
    expect(m.first_value_ready).toBe(true);
    expect(m.cloud_bearer_available).toBe(true);
  });

  it('CRITICAL: a BLOCKED local lane never holds back first value — cloud user stays ready', () => {
    const receiptPath = writeReceipt({
      status: 'blocked',
      stages: [{ id: 'ollama', status: 'blocked', code: 'OLLAMA_MISSING' }],
    });
    const m = build({
      receiptPath,
      readEntitlement: () => ent('entitled'),
      readLicenseWirePresence: () => true,
    });
    // The local lane IS surfaced as blocked...
    expect(item(m, 'local-lane').state).toBe('blocked');
    expect(item(m, 'local-lane').reason_code).toBe('OLLAMA_MISSING');
    // ...but first value is STILL ready (the whole point: cloud is the default lane).
    expect(m.first_value_ready).toBe(true);
  });

  it('no cloud bearer => NOT first_value_ready even when entitled', () => {
    const m = build({ readEntitlement: () => ent('entitled'), readLicenseWirePresence: () => false });
    expect(m.first_value_ready).toBe(false);
  });

  it('registered-but-unlicensed => not ready; registration ok, license blocked', () => {
    const m = build({
      readEntitlement: () => ent('registered_unlicensed'),
      readLicenseWirePresence: () => false,
    });
    expect(m.first_value_ready).toBe(false);
    expect(item(m, 'registration').state).toBe('ok');
    expect(item(m, 'license').state).toBe('blocked');
  });
});

describe('S0 onboarding-status: local reason-code -> remediation mapping', () => {
  const cases: Array<[string, string]> = [
    ['OLLAMA_MISSING', 'external-link'],
    ['BLOCKED_RAM', 'cloud-redirect'],
    ['BLOCKED_DISK', 'cloud-redirect'],
    ['PYTHON_UNSUPPORTED', 'reinstall'],
    ['MODEL_NOT_FETCHED', 'html-screen'],
  ];
  for (const [code, kind] of cases) {
    it(`${code} -> remediation_kind ${kind}`, () => {
      const receiptPath = writeReceipt({ status: 'blocked', stages: [{ id: 's', status: 'blocked', code }] });
      const m = build({ receiptPath });
      const local = item(m, 'local-lane');
      expect(local.state).toBe('blocked');
      expect(local.reason_code).toBe(code);
      expect(local.remediation_kind).toBe(kind);
    });
  }

  it('an UNKNOWN block code falls through honestly (reinstall class, never an invented terminal command)', () => {
    const receiptPath = writeReceipt({ status: 'failed', stages: [{ id: 's', status: 'failed', code: 'TOTALLY_NEW_CODE' }] });
    const m = build({ receiptPath });
    const local = item(m, 'local-lane');
    expect(local.state).toBe('blocked');
    expect(local.reason_code).toBe('TOTALLY_NEW_CODE');
    expect(local.remediation_kind).toBe('reinstall');
    // Honesty: the fallthrough message must not invent a brew/terminal command.
    expect(local.plain_meaning.toLowerCase()).not.toMatch(/brew|curl|terminal|sudo/);
  });
});

describe('S0 onboarding-status: local-lane default + read resilience', () => {
  it('no receipt => local lane is SKIPPED (cloud-first default), never a blocker', () => {
    const m = build({ receiptPath: MISSING() });
    expect(item(m, 'local-lane').state).toBe('skipped');
    expect(item(m, 'local-lane').remediation_kind).toBe('none');
  });

  it('a ready receipt => local lane ok', () => {
    const receiptPath = writeReceipt({ status: 'ready', stages: [] });
    const m = build({ receiptPath });
    expect(item(m, 'local-lane').state).toBe('ok');
  });

  it('missing signal files produce warnings but the build still succeeds', () => {
    const m = build({ receiptPath: MISSING(), firstRunProfilePath: MISSING() });
    // Identity falls back to placeholder/needs-confirmation when no profile.
    expect(m.identity.needs_confirmation).toBe(true);
  });

  it('a malformed receipt JSON is a warning, not a throw', () => {
    const p = path.join(tmp, `bad-${receiptSeq++}.json`);
    fs.writeFileSync(p, '{ not valid json');
    const m = build({ receiptPath: p });
    expect(m.warnings.some((w) => w.includes('onboarding_receipt'))).toBe(true);
  });
});

describe('S0 onboarding-status: model contract', () => {
  it('the model is read_only and carries the bridge version', () => {
    const m = build({});
    expect(m.read_only).toBe(true);
    expect(m.schema_version).toContain('command-eve-onboarding-status');
  });

  it('exposes exactly the five onboarding items', () => {
    const m = build({});
    expect(m.items.map((i) => i.id).sort()).toEqual(
      ['cloud-lane', 'identity', 'license', 'local-lane', 'registration'].sort()
    );
  });
});
