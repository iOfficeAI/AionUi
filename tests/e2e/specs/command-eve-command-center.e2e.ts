/**
 * Command EVE Command Center – Electron bridge proof.
 *
 * Verifies the desktop app can render real Company.OS read-model data through
 * the Electron bridge. This is the GUI↔local-ledger evidence for COMPA-590.
 *
 * Path configuration (env-driven, release-machine fallback):
 *   COMMAND_EVE_COMPANY_OS_ROOT  – absolute path to the Company.OS repo root.
 *                                   Defaults to /Users/mathiasheinke/Developer/Company.OS
 *                                   (byte-for-byte release-machine behaviour when unset).
 *   COMMAND_EVE_E2E_EVENTS_LEDGER – absolute path to the clean ledger fixture.
 *                                   Defaults to <companyOsRoot>/reports/command-eve/e2e/2026-06-10/agent-events.clean.jsonl.
 * If neither env nor fallback path exists on disk the test fails loudly (no silent skip).
 */
import { test, expect } from '../fixtures';
import fs from 'fs';
import os from 'os';
import path from 'path';

const COMPANY_OS_ROOT_DEFAULT = '/Users/mathiasheinke/Developer/Company.OS';
const LEDGER_FIXTURE_RELATIVE = 'reports/command-eve/e2e/2026-06-10/agent-events.clean.jsonl';

const companyOsRoot: string = process.env.COMMAND_EVE_COMPANY_OS_ROOT ?? COMPANY_OS_ROOT_DEFAULT;
const cleanLedgerSource: string =
  process.env.COMMAND_EVE_E2E_EVENTS_LEDGER ?? path.join(companyOsRoot, LEDGER_FIXTURE_RELATIVE);

if (!fs.existsSync(cleanLedgerSource)) {
  throw new Error(
    `[command-eve-command-center e2e] Ledger fixture not found: ${cleanLedgerSource}\n` +
      `Set COMMAND_EVE_COMPANY_OS_ROOT or COMMAND_EVE_E2E_EVENTS_LEDGER to a valid path.`
  );
}

const e2eLedgerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-command-center-e2e-'));
const e2eLedgerPath = path.join(e2eLedgerRoot, 'agent-events.clean.jsonl');
fs.copyFileSync(cleanLedgerSource, e2eLedgerPath);
process.env.COMMAND_EVE_COMPANY_OS_ROOT = companyOsRoot;
process.env.COMMAND_EVE_AGENT_EVENTS_PATH = e2eLedgerPath;
process.on('exit', () => {
  fs.rmSync(e2eLedgerRoot, { recursive: true, force: true });
});

test.describe('Command EVE Command Center', () => {
  test.setTimeout(120_000);

  test('renders real local read-model data and creates a governed marketing proof card', async ({
    page,
    electronApp,
  }, testInfo) => {
    const userDataPath = await electronApp.evaluate(async ({ app }) => app.getPath('userData'));
    const reconciliationPath = path.join(
      userDataPath,
      'command-eve-runtime',
      'capabilities',
      'command-eve-runtime-reconciliation.json'
    );
    fs.mkdirSync(path.dirname(reconciliationPath), { recursive: true });
    fs.writeFileSync(
      reconciliationPath,
      `${JSON.stringify(
        {
          version: 'command-eve-runtime-reconciliation/v0',
          hermes_config: {
            mcp_servers: [],
            kanban_dispatch_in_gateway: false,
            kanban_auto_decompose: false,
          },
        },
        null,
        2
      )}\n`
    );

    await page.waitForSelector('body', { state: 'visible' });

    await page.evaluate(() => {
      window.location.hash = '#/command-center';
    });

    await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('COMMAND_CENTER_ELECTRON_BRIDGE_REQUIRED')).toHaveCount(0);
    await expect(page.getByText(/agent-events\.clean\.jsonl/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Lokales Board|Local Board/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Keine Mutation|No mutation/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Marketing Board/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('morning-ceo-brief-20260610-0632')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('daily-improvement-dream-2026-06-10').first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: /Proof-Karte anlegen|Create proof card/ }).click();
    await expect(page.getByText(/KANBAN_MARKETING_PROOF_CARD_CREATED|KANBAN_MARKETING_PROOF_CARD_EXISTS/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Command EVE Marketing Board proof card')).toBeVisible({ timeout: 30_000 });

    const screenshotPath = 'tests/e2e/results/command-eve-command-center-local-board.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('command-center-clean-ledger', {
      path: screenshotPath,
      contentType: 'image/png',
    });

    const marketingScreenshotPath = 'tests/e2e/results/command-eve-marketing-board-proof-card.png';
    await page.screenshot({ path: marketingScreenshotPath, fullPage: true });
    await testInfo.attach('command-eve-marketing-board-proof-card', {
      path: marketingScreenshotPath,
      contentType: 'image/png',
    });
  });
});
