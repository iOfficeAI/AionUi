/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE registration + license gate — end-to-end anti-fake proof (W12).
 *
 * Proves the founder-facing first-run gate end to end against the REAL W11
 * main-process backend (`command-eve.entitlement-*` bridges + entitlementCore),
 * driving the production renderer route guard in
 * `packages/desktop/src/renderer/components/layout/Router.tsx`.
 *
 * Why this spec launches its OWN Electron instances (not the shared fixtures
 * app): the gate must boot with COMMAND_EVE_REGISTRATION_REQUIRED=1, a test
 * public key injected via COMMAND_EVE_LICENSE_PUBLIC_KEY, and a FRESH, empty
 * userData per scenario. The shared singleton fixtures app boots once with the
 * runner's ambient env and a persistent userData, so it cannot prove the
 * fresh-state gate, the relaunch-persistence skip, or the env-injected key. Each
 * launch here passes Chromium's `--user-data-dir` so the app's
 * `app.getPath('userData')` resolves into a throwaway temp dir.
 *
 * The CEVE.v1 codes are signed in-test with an ephemeral Ed25519 keypair whose
 * PUBLIC key PEM is written to a temp file and injected as the embedded key. The
 * private key never leaves this process. The wire format mirrors
 * `scripts/licensing/license-code-core.mjs` (CEVE.v1.<b64url(payload)>.<b64url(sig)>,
 * canonical key order), exactly as W11's unit suite does.
 *
 * No test.skip anywhere — every precondition failure throws loudly (same rule as
 * the egress keystone: a skipped proof is not a proof).
 *
 * The renderer bundle under out/ must be fresh (contain the W12 gate). Rebuild:
 *   npx electron-vite build --config packages/desktop/electron.vite.config.ts
 */

import { test, expect, type ElectronApplication, type Page, _electron as electron } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── CEVE.v1 in-test signer (mirror of license-code-core.mjs wire format) ──────

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

const signCode = (privateKey: crypto.KeyObject, payload: Record<string, unknown>): string => {
  const payloadBytes = Buffer.from(canonicalPayloadJson(payload), 'utf8');
  const signature = crypto.sign(null, payloadBytes, privateKey);
  return ['CEVE', 'v1', toBase64Url(payloadBytes), toBase64Url(signature)].join('.');
};

const pilotPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  license_version: 'command-eve-license/v1',
  edition: 'pilot',
  serial: 'CEVE-PILOT-E2E-0001',
  tenant_serial: 'TENANT-E2E-0001',
  issued_at: '2026-01-01T00:00:00.000Z',
  expires_at: '2030-01-01T00:00:00.000Z',
  ...overrides,
});

// ── Ephemeral signing key (private key never leaves this process) ─────────────

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const testPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

// A second, untrusted key to produce a wrong-key (signature-invalid) code.
const attacker = crypto.generateKeyPairSync('ed25519');

// ── Temp scaffolding (public key file + fresh userData root) ──────────────────

const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-registration-gate-e2e-'));
const publicKeyPath = path.join(scratchRoot, 'command-eve-license-public-key.pem');
fs.writeFileSync(publicKeyPath, testPublicKeyPem, { mode: 0o600 });

// Each scenario gets its OWN parent dir. In dev mode the Command EVE shell
// re-derives userData as `<dirname(--user-data-dir)>/<appName>-dev…`, i.e. a
// SIBLING of the passed dir — so isolating the parent keeps each scenario's
// store fully separate. The persistence scenario reuses the SAME --user-data-dir
// (same parent → same derived store) to prove the relaunch stays unlocked.
const mainScenarioParent = fs.mkdtempSync(path.join(scratchRoot, 'main-'));
const sharedUserDataDir = path.join(mainScenarioParent, 'user-data');
fs.mkdirSync(sharedUserDataDir, { recursive: true });

process.on('exit', () => {
  try {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

// ── Window resolution (mirrors fixtures.ts / auto-update spec) ────────────────

function isDevToolsWindow(page: Page): boolean {
  return page.url().startsWith('devtools://');
}

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
  const existing = electronApp.windows().find((win) => !isDevToolsWindow(win));
  if (existing) {
    await existing.waitForLoadState('domcontentloaded');
    return existing;
  }
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const win = await electronApp.waitForEvent('window', { timeout: 1_000 }).catch(() => null);
    if (win && !isDevToolsWindow(win)) {
      await win.waitForLoadState('domcontentloaded');
      return win;
    }
  }
  throw new Error('[registration-gate e2e] Failed to resolve main renderer window.');
}

/**
 * Launch the DEV app (`electron .`) with the gate flag + test public key + a
 * given userData dir. Uses `--user-data-dir` so the app's userData resolves into
 * our temp dir (fresh or shared depending on the scenario). AIONUI_MULTI_INSTANCE
 * keeps it independent of any other running instance.
 */
async function launchGateApp(opts: {
  userDataDir: string;
  registrationRequired?: string;
  injectKey?: boolean;
}): Promise<ElectronApplication> {
  const projectRoot = path.resolve(__dirname, '../../..');
  const mainEntry = path.join(projectRoot, 'out', 'main', 'index.js');
  if (!fs.existsSync(mainEntry)) {
    throw new Error(
      `[registration-gate e2e] Built main bundle not found: ${mainEntry}\n` +
        'Rebuild the app bundle first (stale-bundle trap):\n' +
        '  npx electron-vite build --config packages/desktop/electron.vite.config.ts'
    );
  }

  const launchArgs = ['.', `--user-data-dir=${opts.userDataDir}`];
  if (process.platform === 'linux' && process.env.CI) {
    launchArgs.push('--no-sandbox');
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    AIONUI_DISABLE_AUTO_UPDATE: '1',
    AIONUI_DISABLE_DEVTOOLS: '1',
    AIONUI_E2E_TEST: '1',
    AIONUI_MULTI_INSTANCE: '1',
    AIONUI_CDP_PORT: '0',
    NODE_ENV: 'development',
    COMMAND_EVE_REGISTRATION_REQUIRED: opts.registrationRequired ?? '1',
  };
  if (opts.injectKey ?? true) {
    env.COMMAND_EVE_LICENSE_PUBLIC_KEY = publicKeyPath;
  } else {
    delete env.COMMAND_EVE_LICENSE_PUBLIC_KEY;
  }

  return electron.launch({ args: launchArgs, cwd: projectRoot, env, timeout: 60_000 });
}

async function closeApp(app: ElectronApplication | null): Promise<void> {
  if (!app) return;
  try {
    await app.evaluate(async ({ app: electronApp }) => electronApp.exit(0));
  } catch {
    // ignore
  }
  await app.close().catch(() => {});
}

// Gate + main-surface markers. The gate root carries data-testid="registration-gate".
// The main app sider exposes the Command EVE chat/guid surface; we assert the gate
// is the only thing on screen and a forced deep-link route does not reveal it.
const GATE_SELECTOR = '[data-testid="registration-gate"]';

async function gotoHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}

/**
 * Recursively find the first file named `fileName` under `root`. The W11 store
 * writes under `getDataPath()`, which on macOS nests the data under
 * `<userData>/command-eve/command-eve-runtime/entitlement` and resolves through a
 * home symlink, so the exact path is env-derived. We search the userData root
 * (our `--user-data-dir`) instead of hardcoding the nesting. Follows symlinks so
 * the resolved real dir under Application Support is also covered.
 */
function findFileUnder(root: string, fileName: string): string | null {
  let stack: string[] = [root];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let real: string;
    try {
      real = fs.realpathSync(dir);
    } catch {
      continue;
    }
    if (seen.has(real)) continue;
    seen.add(real);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(real, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(real, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name === fileName) {
        return full;
      }
    }
  }
  return null;
}

test.describe.serial('Command EVE registration + license gate', () => {
  test.setTimeout(180_000);

  test('blocks main surfaces, rejects bad input, unlocks on a valid code, and stays unlocked on relaunch', async () => {
    // ── Launch 1: fresh userData → gate must block everything ────────────────
    let app = await launchGateApp({ userDataDir: sharedUserDataDir });
    let page = await resolveMainWindow(app);

    try {
      // (a) Gate renders; main surfaces are unreachable.
      await expect(page.locator(GATE_SELECTOR)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-testid="registration-gate-form"]')).toBeVisible({ timeout: 30_000 });

      // (a.bypass) Forced deep-link to a main route must NOT reveal a main surface:
      // the route guard renders the gate for every protected route.
      await gotoHash(page, '#/command-center');
      await expect(page.locator(GATE_SELECTOR)).toBeVisible({ timeout: 15_000 });
      await gotoHash(page, '#/guid');
      await expect(page.locator(GATE_SELECTOR)).toBeVisible({ timeout: 15_000 });
      await gotoHash(page, '#/settings/system');
      await expect(page.locator(GATE_SELECTOR)).toBeVisible({ timeout: 15_000 });

      // (b) Registration without consent is blocked (button stays, specific error).
      await page.locator('[data-testid="registration-gate-name"]').fill('Alois');
      await page.locator('[data-testid="registration-gate-company"]').fill('Alois GmbH');
      await page.locator('[data-testid="registration-gate-email"]').fill('alois@example.com');
      await page.locator('[data-testid="registration-gate-submit"]').click();
      await expect(page.locator('[data-testid="registration-gate-error"]')).toBeVisible({ timeout: 15_000 });
      // Still on the registration step (consent not checked) — license step not shown.
      await expect(page.locator('[data-testid="registration-gate-license-form"]')).toHaveCount(0);

      // Now check consent and submit → advances to the license step.
      await page.locator('[data-testid="registration-gate-consent"]').click();
      await page.locator('[data-testid="registration-gate-submit"]').click();
      await expect(page.locator('[data-testid="registration-gate-license-form"]')).toBeVisible({ timeout: 15_000 });

      // (c) A wrong-key code shows the SIGNATURE_INVALID-specific error and does NOT unlock.
      const wrongKeyCode = signCode(attacker.privateKey, pilotPayload());
      await page.locator('[data-testid="registration-gate-code"]').fill(wrongKeyCode);
      await page.locator('[data-testid="registration-gate-license-submit"]').click();
      await expect(page.locator('[data-testid="registration-gate-license-error"]')).toBeVisible({ timeout: 15_000 });
      // Gate is still up — the bad code did not unlock anything.
      await expect(page.locator(GATE_SELECTOR)).toBeVisible();

      // An expired code shows the EXPIRED-specific (distinct) error too.
      const expiredCode = signCode(privateKey, pilotPayload({ expires_at: '2020-01-01T00:00:00.000Z' }));
      await page.locator('[data-testid="registration-gate-code"]').fill(expiredCode);
      await page.locator('[data-testid="registration-gate-license-submit"]').click();
      await expect(page.locator('[data-testid="registration-gate-license-error"]')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(GATE_SELECTOR)).toBeVisible();

      // (d) A valid code unlocks: gate unmounts and a main surface becomes reachable.
      const validCode = signCode(privateKey, pilotPayload());
      await page.locator('[data-testid="registration-gate-code"]').fill(validCode);
      await page.locator('[data-testid="registration-gate-license-submit"]').click();
      await expect(page.locator(GATE_SELECTOR)).toHaveCount(0, { timeout: 30_000 });

      // Prove a real main surface renders (command center title in either locale).
      await gotoHash(page, '#/command-center');
      await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });

      // Prove the entitlement + audit artifacts were written under userData (W11
      // store). The store path nests under getDataPath(), which is env-derived
      // (in dev mode the shell re-derives userData as <base>/../<appName>-dev),
      // so search the scratch root that contains the --user-data-dir base and its
      // derived sibling rather than hardcoding the nesting.
      const registrationFile = findFileUnder(mainScenarioParent, 'registration.json');
      const entitlementFile = findFileUnder(mainScenarioParent, 'entitlement.json');
      const auditFile = findFileUnder(mainScenarioParent, 'agent-events.jsonl');
      expect(registrationFile, 'registration.json was not written under userData').not.toBeNull();
      expect(entitlementFile, 'entitlement.json was not written under userData').not.toBeNull();
      expect(auditFile, 'agent-events.jsonl was not written under userData').not.toBeNull();

      const entitlement = JSON.parse(fs.readFileSync(entitlementFile as string, 'utf8'));
      expect(entitlement.code_serial).toBe('CEVE-PILOT-E2E-0001');
      expect(entitlement.edition).toBe('pilot');
      expect(typeof entitlement.tenant_id).toBe('string');

      // Audit event is PII-free (no email/name/raw code), schema agent-event/v1.
      const auditLines = fs
        .readFileSync(auditFile as string, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0);
      expect(auditLines.length).toBeGreaterThanOrEqual(1);
      const auditEvent = JSON.parse(auditLines[auditLines.length - 1]);
      expect(auditEvent.schema_version).toBe('agent-event/v1');
      expect(auditEvent.event_type).toBe('command-eve.entitlement.activated');
      expect(auditEvent.payload.code_serial).toBe('CEVE-PILOT-E2E-0001');
      // No PII fields anywhere in the serialized event.
      const auditRaw = auditLines[auditLines.length - 1];
      expect(auditRaw).not.toContain('alois@example.com');
      expect(auditRaw).not.toContain('Alois');
      expect(auditRaw).not.toContain(validCode);
    } finally {
      await closeApp(app);
      app = null;
    }

    // ── Launch 2: SAME userData → gate must be skipped (persistence) ──────────
    app = await launchGateApp({ userDataDir: sharedUserDataDir });
    page = await resolveMainWindow(app);
    try {
      // (e) No gate on relaunch; a main surface is reachable directly without
      // re-entering name/company/email/code.
      await gotoHash(page, '#/command-center');
      await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(GATE_SELECTOR)).toHaveCount(0);
    } finally {
      await closeApp(app);
      app = null;
    }
  });

  test('pilot fallback: flag OFF skips the gate even with no registration', async () => {
    // A pristine userData (own parent dir → no inherited entitlement from the
    // first scenario) with COMMAND_EVE_REGISTRATION_REQUIRED=0 must let the user
    // straight into the app (founder pilot-day escape hatch, spec §4).
    const fallbackParent = fs.mkdtempSync(path.join(scratchRoot, 'fallback-'));
    const fallbackUserData = path.join(fallbackParent, 'user-data');
    fs.mkdirSync(fallbackUserData, { recursive: true });
    const app = await launchGateApp({ userDataDir: fallbackUserData, registrationRequired: '0', injectKey: false });
    const page = await resolveMainWindow(app);
    try {
      await gotoHash(page, '#/command-center');
      await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(GATE_SELECTOR)).toHaveCount(0);
    } finally {
      await closeApp(app);
    }
  });
});
