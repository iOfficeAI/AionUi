/**
 * Command EVE Kanban Board – end-to-end mutation proof.
 *
 * Verifies that real GUI interactions (create card + move card) produce:
 *   1. A real sqlite row in the tasks table of the board DB the app wrote.
 *   2. A real task_events receipt row (kind = command_eve_card_created /
 *      command_eve_card_moved) with the HG-2.5 governance payload.
 *   3. A real agent-event/v1 audit line in the temp ledger
 *      (event_type = kanban.marketing_board_card_created /
 *       kanban.marketing_board_card_moved).
 *
 * No test.skip – fails loud if any precondition is missing (mirrors the
 * proof-card spec in command-eve-command-center.e2e.ts).
 *
 * Strategy:
 *   - The marketing board is created (if missing) by clicking the proof card
 *     button first, which is exactly what the command-center spec already proves.
 *     After the proof card step the board status is 'ready' and the "Post anlegen"
 *     create button becomes enabled.
 *   - Card creation uses the real modal: click → fill → submit.
 *   - Card move uses the real "Weiter →" button.
 *   - The card_id and board db_path are read from the UI after creation so
 *     the sqlite assertions target the exact DB the app wrote.
 *
 * Path configuration (env-driven, release-machine fallback):
 *   COMMAND_EVE_COMPANY_OS_ROOT   – absolute path to the Company.OS repo root.
 *                                   Defaults to /Users/mathiasheinke/Developer/Company.OS
 *   COMMAND_EVE_E2E_EVENTS_LEDGER – absolute path to the clean ledger fixture.
 *                                   Defaults to <companyOsRoot>/reports/command-eve/e2e/2026-06-10/agent-events.clean.jsonl
 */
import { test, expect } from '../fixtures';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

// ── Fixture / ledger setup (mirrors command-center spec) ──────────────────────

const COMPANY_OS_ROOT_DEFAULT = '/Users/mathiasheinke/Developer/Company.OS';
const LEDGER_FIXTURE_RELATIVE = 'reports/command-eve/e2e/2026-06-10/agent-events.clean.jsonl';

// State initialised in beforeAll, used by test bodies.
let e2eLedgerPath: string = '';
let e2eLedgerRoot: string = '';

// Prior env values captured in beforeAll, restored in afterAll.
let prevCompanyOsRoot: string | undefined;
let prevAgentEventsPath: string | undefined;

// ── SQLite helper ─────────────────────────────────────────────────────────────

function sqliteQuery(dbPath: string, sql: string): string[][] {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`[kanban-board e2e] Board DB not found: ${dbPath}`);
  }
  const raw = execFileSync('sqlite3', ['-separator', '\t', dbPath, sql], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uniquePostTitle(): string {
  return `E2E Post ${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Write the reconciliation lock file so the bridge's governance check passes.
 * Mirrors the command-center spec exactly.
 */
function writeReconciliationLock(reconciliationPath: string): void {
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
}

// ── Shared state (create → move hand-off) ─────────────────────────────────────

let createdCardId: string | null = null;
let boardDbPath: string | null = null;

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Command EVE Kanban Board – mutation proof', () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    // Capture prior values before any mutation.
    prevCompanyOsRoot = process.env.COMMAND_EVE_COMPANY_OS_ROOT;
    prevAgentEventsPath = process.env.COMMAND_EVE_AGENT_EVENTS_PATH;

    const companyOsRoot: string = process.env.COMMAND_EVE_COMPANY_OS_ROOT ?? COMPANY_OS_ROOT_DEFAULT;
    const cleanLedgerSource: string =
      process.env.COMMAND_EVE_E2E_EVENTS_LEDGER ?? path.join(companyOsRoot, LEDGER_FIXTURE_RELATIVE);

    if (!fs.existsSync(cleanLedgerSource)) {
      throw new Error(
        `[command-eve-kanban-board e2e] Ledger fixture not found: ${cleanLedgerSource}\n` +
          `Set COMMAND_EVE_COMPANY_OS_ROOT or COMMAND_EVE_E2E_EVENTS_LEDGER to a valid path.`
      );
    }

    // Isolated temp dir so the canonical evidence file is never mutated.
    e2eLedgerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-kanban-board-e2e-'));
    e2eLedgerPath = path.join(e2eLedgerRoot, 'agent-events.clean.jsonl');
    fs.copyFileSync(cleanLedgerSource, e2eLedgerPath);

    // Point the bridge at our isolated ledger.
    process.env.COMMAND_EVE_COMPANY_OS_ROOT = companyOsRoot;
    process.env.COMMAND_EVE_AGENT_EVENTS_PATH = e2eLedgerPath;
  });

  test.afterAll(() => {
    // Restore prior env values exactly.
    if (prevCompanyOsRoot === undefined) {
      delete process.env.COMMAND_EVE_COMPANY_OS_ROOT;
    } else {
      process.env.COMMAND_EVE_COMPANY_OS_ROOT = prevCompanyOsRoot;
    }
    if (prevAgentEventsPath === undefined) {
      delete process.env.COMMAND_EVE_AGENT_EVENTS_PATH;
    } else {
      process.env.COMMAND_EVE_AGENT_EVENTS_PATH = prevAgentEventsPath;
    }

    // Clean up temp dir.
    if (e2eLedgerRoot) {
      fs.rmSync(e2eLedgerRoot, { recursive: true, force: true });
      e2eLedgerRoot = '';
    }
  });

  // ── TEST 1: Create ──────────────────────────────────────────────────────────
  test('create: GUI click produces sqlite row + task_events receipt + audit event', async ({
    page,
    electronApp,
  }, testInfo) => {
    // ── Reconciliation lock ─────────────────────────────────────────────────
    const userDataPath = await electronApp.evaluate(async ({ app }) => app.getPath('userData'));
    const reconciliationPath = path.join(
      userDataPath,
      'command-eve-runtime',
      'capabilities',
      'command-eve-runtime-reconciliation.json'
    );
    writeReconciliationLock(reconciliationPath);

    // ── Navigate to Command Center ──────────────────────────────────────────
    await page.waitForSelector('body', { state: 'visible' });
    await page.evaluate(() => {
      window.location.hash = '#/command-center';
    });
    await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });
    // Wait for read model to load (mirrors command-center spec).
    await expect(page.getByText(/agent-events\.clean\.jsonl/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Lokales Board|Local Board/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Marketing Board/).first()).toBeVisible({ timeout: 30_000 });

    // ── Ensure the board DB exists by running the proof card first ──────────
    // This is the same step the command-center spec proves. It initialises
    // the DB and makes the "Post anlegen" button enabled.
    await page.getByRole('button', { name: /Proof-Karte anlegen|Create proof card/ }).click();
    await expect(
      page.getByText(/KANBAN_MARKETING_PROOF_CARD_CREATED|KANBAN_MARKETING_PROOF_CARD_EXISTS/)
    ).toBeVisible({ timeout: 60_000 });

    // After proof card creation the marketingResult state is updated in-place
    // by the UI (it re-reads the board via kanbanMarketingBoard.invoke).
    // The "Post anlegen" button is now enabled (board status = ready).
    // Wait for it without re-navigating (we're already on the page).
    const createOpenBtn = page.getByTestId('marketing-card-create-open');
    await expect(createOpenBtn).toBeVisible({ timeout: 30_000 });
    await expect(createOpenBtn).toBeEnabled({ timeout: 30_000 });

    // ── Read the board db_path from the UI ─────────────────────────────────
    // The board section renders: "<Database label>: <db_path>"
    // We extract this so the sqlite assertions target the correct file.
    const dbPathLabel = await page.locator('span:has-text("/kanban/boards/marketing/kanban.db")').first().textContent();
    const dbPathMatch = dbPathLabel?.match(/([^\s]+kanban\.db)/);
    const resolvedDbPath = dbPathMatch?.[1] ?? null;
    expect(resolvedDbPath, 'Board db_path must be visible in the marketing board section').toBeTruthy();
    boardDbPath = resolvedDbPath!;

    // ── Click "Post anlegen" → open create modal ────────────────────────────
    const postTitle = uniquePostTitle();
    const postDescription = 'E2E mutation proof – create';

    await createOpenBtn.click();
    await expect(page.getByTestId('marketing-card-create-modal')).toBeVisible({ timeout: 10_000 });

    // ── Fill the modal ──────────────────────────────────────────────────────
    await page.getByTestId('marketing-card-create-title').fill(postTitle);
    await page.getByTestId('marketing-card-create-description').fill(postDescription);
    // Lane defaults to 'research' – leave as is.

    // ── Submit ──────────────────────────────────────────────────────────────
    await page.getByTestId('marketing-card-create-submit').click();

    // ── Wait for success: modal closes and Alert appears ────────────────────
    await expect(page.getByTestId('marketing-card-create-modal')).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('KANBAN_MARKETING_CARD_CREATED')).toBeVisible({ timeout: 60_000 });

    // ── Extract card_id from the DOM ────────────────────────────────────────
    // The create result Alert shows card_id or audit_event_path.
    // We find the card in the research lane by its unique title.
    await expect(page.getByText(postTitle)).toBeVisible({ timeout: 30_000 });

    // Find the article (card) containing this title.
    const cardArticle = page.locator(`article:has-text("${postTitle}")`).first();
    await expect(cardArticle).toBeVisible({ timeout: 10_000 });

    // The card's data-testid is `marketing-card-{card_id}`. Extract it.
    const cardTestId = await cardArticle.getAttribute('data-testid');
    expect(cardTestId, 'Card article must have data-testid attribute').toBeTruthy();
    const extractedCardId = cardTestId?.replace(/^marketing-card-/, '') ?? null;
    expect(extractedCardId, 'card_id must be extractable from data-testid').toBeTruthy();
    createdCardId = extractedCardId!;

    // ── Assert: research lane column contains the card ──────────────────────
    await expect(page.getByTestId('marketing-lane-research')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`marketing-card-${createdCardId}`)).toBeVisible({ timeout: 10_000 });

    // ── Assert: sqlite tasks row ────────────────────────────────────────────
    const taskRows = sqliteQuery(
      boardDbPath,
      `SELECT id, title, current_step_key, status FROM tasks WHERE id = '${createdCardId}'`
    );
    expect(taskRows.length, `tasks row for card_id=${createdCardId} must exist`).toBeGreaterThan(0);
    expect(taskRows[0][0], 'tasks.id must match card_id').toBe(createdCardId);
    expect(taskRows[0][1], 'tasks.title must match submitted title').toBe(postTitle);
    expect(taskRows[0][2], 'tasks.current_step_key must be research').toBe('research');

    // ── Assert: task_events 'command_eve_card_created' receipt ─────────────
    const eventRows = sqliteQuery(
      boardDbPath,
      `SELECT kind, payload FROM task_events WHERE task_id = '${createdCardId}' AND kind = 'command_eve_card_created' LIMIT 1`
    );
    expect(eventRows.length, `task_events created receipt must exist`).toBeGreaterThan(0);
    const eventPayload = JSON.parse(eventRows[0][1]) as {
      lane_key?: string;
      human_gate?: string;
      dispatcher_enabled?: boolean;
      auto_decompose_enabled?: boolean;
    };
    expect(eventPayload.human_gate, 'receipt human_gate must be HG-2.5').toBe('HG-2.5');
    expect(eventPayload.dispatcher_enabled, 'receipt dispatcher_enabled must be false').toBe(false);
    expect(eventPayload.auto_decompose_enabled, 'receipt auto_decompose_enabled must be false').toBe(false);
    expect(eventPayload.lane_key, 'receipt lane_key must be research').toBe('research');

    // ── Assert: audit event in temp ledger ─────────────────────────────────
    // The bridge uses COMMAND_EVE_AGENT_EVENTS_PATH (our temp file) as the
    // ledger path. It appends the audit event there.
    expect(fs.existsSync(e2eLedgerPath), `audit ledger must exist: ${e2eLedgerPath}`).toBe(true);

    const ledgerLines = fs.readFileSync(e2eLedgerPath, 'utf8').split('\n').filter(Boolean);
    const matchingCreateAudit = ledgerLines.find((line) => {
      try {
        const evt = JSON.parse(line) as { event_type?: string; issue_id?: string };
        return evt.issue_id === createdCardId && evt.event_type === 'kanban.marketing_board_card_created';
      } catch {
        return false;
      }
    });
    expect(
      matchingCreateAudit,
      `audit ledger must contain kanban.marketing_board_card_created for card_id=${createdCardId}`
    ).toBeTruthy();

    // ── Screenshot ──────────────────────────────────────────────────────────
    const screenshotPath = 'tests/e2e/results/command-eve-kanban-board-create.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('kanban-board-create-proof', { path: screenshotPath, contentType: 'image/png' });
  });

  // ── TEST 2: Move ────────────────────────────────────────────────────────────
  test('move: GUI click produces sqlite task_events moved receipt + audit event', async ({
    page,
    electronApp,
  }, testInfo) => {
    // Fail loud if create test did not produce a card.
    if (!createdCardId || !boardDbPath) {
      throw new Error(
        `[kanban-board e2e] move test requires a prior successful create test; ` +
          `createdCardId=${String(createdCardId)} boardDbPath=${String(boardDbPath)}`
      );
    }

    // ── Reconciliation lock ─────────────────────────────────────────────────
    const userDataPath = await electronApp.evaluate(async ({ app }) => app.getPath('userData'));
    const reconciliationPath = path.join(
      userDataPath,
      'command-eve-runtime',
      'capabilities',
      'command-eve-runtime-reconciliation.json'
    );
    writeReconciliationLock(reconciliationPath);

    // ── Navigate to Command Center ──────────────────────────────────────────
    await page.waitForSelector('body', { state: 'visible' });
    await page.evaluate(() => {
      window.location.hash = '#/command-center';
    });
    await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Lokales Board|Local Board/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Marketing Board/).first()).toBeVisible({ timeout: 30_000 });

    // Wait for the created card to appear in the board.
    const cardTestId = `marketing-card-${createdCardId}`;
    await expect(page.getByTestId(cardTestId)).toBeVisible({ timeout: 30_000 });

    // Confirm card is in research lane (pre-condition).
    await expect(page.getByTestId('marketing-lane-research').getByTestId(cardTestId)).toBeVisible({
      timeout: 10_000,
    });

    // ── Click the "Weiter →" move button ───────────────────────────────────
    const moveBtn = page.getByTestId(`marketing-card-move-${createdCardId}`);
    await expect(moveBtn).toBeVisible({ timeout: 10_000 });
    await moveBtn.click();

    // ── Wait for move success Alert ─────────────────────────────────────────
    await expect(page.getByText('KANBAN_MARKETING_CARD_MOVED')).toBeVisible({ timeout: 60_000 });

    // ── Card should now be in draft lane ───────────────────────────────────
    await expect(page.getByTestId('marketing-lane-draft').getByTestId(cardTestId)).toBeVisible({
      timeout: 30_000,
    });

    // ── Assert: sqlite tasks row updated ───────────────────────────────────
    const taskRows = sqliteQuery(
      boardDbPath,
      `SELECT id, current_step_key, status FROM tasks WHERE id = '${createdCardId}'`
    );
    expect(taskRows.length, `tasks row for card_id=${createdCardId} must still exist`).toBeGreaterThan(0);
    expect(taskRows[0][1], 'current_step_key must be draft after move').toBe('draft');
    expect(taskRows[0][2], 'status must be todo (draft native status)').toBe('todo');

    // ── Assert: task_events 'command_eve_card_moved' receipt ───────────────
    const eventRows = sqliteQuery(
      boardDbPath,
      `SELECT kind, payload FROM task_events WHERE task_id = '${createdCardId}' AND kind = 'command_eve_card_moved' LIMIT 1`
    );
    expect(eventRows.length, `task_events moved receipt must exist`).toBeGreaterThan(0);
    const movedPayload = JSON.parse(eventRows[0][1]) as {
      to_lane_key?: string;
      human_gate?: string;
      dispatcher_enabled?: boolean;
      auto_decompose_enabled?: boolean;
    };
    expect(movedPayload.human_gate, 'moved receipt human_gate must be HG-2.5').toBe('HG-2.5');
    expect(movedPayload.dispatcher_enabled, 'moved receipt dispatcher_enabled must be false').toBe(false);
    expect(movedPayload.auto_decompose_enabled, 'moved receipt auto_decompose_enabled must be false').toBe(false);
    expect(movedPayload.to_lane_key, 'moved receipt to_lane_key must be draft').toBe('draft');

    // ── Assert: audit event in temp ledger ─────────────────────────────────
    expect(fs.existsSync(e2eLedgerPath), `audit ledger must exist: ${e2eLedgerPath}`).toBe(true);

    const ledgerLines = fs.readFileSync(e2eLedgerPath, 'utf8').split('\n').filter(Boolean);
    const matchingMoveAudit = ledgerLines.find((line) => {
      try {
        const evt = JSON.parse(line) as { event_type?: string; issue_id?: string };
        return evt.issue_id === createdCardId && evt.event_type === 'kanban.marketing_board_card_moved';
      } catch {
        return false;
      }
    });
    expect(
      matchingMoveAudit,
      `audit ledger must contain kanban.marketing_board_card_moved for card_id=${createdCardId}`
    ).toBeTruthy();

    // ── Screenshot ──────────────────────────────────────────────────────────
    const screenshotPath = 'tests/e2e/results/command-eve-kanban-board-move.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('kanban-board-move-proof', { path: screenshotPath, contentType: 'image/png' });
  });
});
