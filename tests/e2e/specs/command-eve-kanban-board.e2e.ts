/**
 * Command EVE Kanban Board – end-to-end mutation proof.
 *
 * Verifies that real GUI interactions (create card + move card) produce:
 *   1. A real sqlite row in the tasks table of the board DB the app wrote.
 *   2. A real task_events receipt row (kind = command_eve_card_created /
 *      command_eve_card_moved / command_eve_dispatch_plan_checked) with the
 *      HG-2.5 / NL-5 governance payload.
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
let prevNl5CompanyOsRoot: string | undefined;
let prevCommandEveNodeBinary: string | undefined;

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

function writeFakeNl5DispatchCli(companyOsRoot: string): void {
  const cliPath = path.join(companyOsRoot, 'scripts', 'orchestration', 'hermes-pre-generation-dispatch.mjs');
  fs.mkdirSync(path.dirname(cliPath), { recursive: true });
  fs.writeFileSync(
    cliPath,
    `#!/usr/bin/env node
import fs from 'node:fs';

JSON.parse(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify({
  version: 'hermes-pre-generation-dispatch/v0',
  ok: false,
  status: 'blocked',
  subprocess_spawned: false,
  reason_codes: ['hermes.pre_generation.controller_approval_missing'],
  policy: {
    status: 'blocked',
    data_boundary_receipt: {
      ok: true,
      status: 'local-only-pass',
      sensitivity: 'S1',
      sensitivity_score: 1,
      effective_lane: 'local_only'
    }
  }
}, null, 2));
process.exitCode = 78;
`,
    { mode: 0o700 }
  );
}

function removeCrmOverlayDatabases(userDataPath: string): void {
  const commandEveDataRoots = [
    path.join(userDataPath, 'command-eve'),
    path.join(os.homedir(), '.command-eve-dev'),
    path.join(os.homedir(), '.command-eve-dev-2'),
    path.join(os.homedir(), '.command-eve'),
  ];
  for (const root of commandEveDataRoots) {
    const crmDbPath = path.join(root, 'command-eve-runtime', 'hermes', 'home', 'crm', 'command-eve-crm.db');
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${crmDbPath}${suffix}`, { force: true });
    }
  }
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
    prevNl5CompanyOsRoot = process.env.COMMAND_EVE_NL5_COMPANY_OS_ROOT;
    prevCommandEveNodeBinary = process.env.COMMAND_EVE_NODE_BINARY;

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
    const nl5CompanyOsRoot = path.join(e2eLedgerRoot, 'company-os-nl5-fixture');
    writeFakeNl5DispatchCli(nl5CompanyOsRoot);

    // Point the bridge at our isolated ledger.
    process.env.COMMAND_EVE_COMPANY_OS_ROOT = companyOsRoot;
    process.env.COMMAND_EVE_AGENT_EVENTS_PATH = e2eLedgerPath;
    process.env.COMMAND_EVE_NL5_COMPANY_OS_ROOT = nl5CompanyOsRoot;
    process.env.COMMAND_EVE_NODE_BINARY = process.execPath;
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
    if (prevNl5CompanyOsRoot === undefined) {
      delete process.env.COMMAND_EVE_NL5_COMPANY_OS_ROOT;
    } else {
      process.env.COMMAND_EVE_NL5_COMPANY_OS_ROOT = prevNl5CompanyOsRoot;
    }
    if (prevCommandEveNodeBinary === undefined) {
      delete process.env.COMMAND_EVE_NODE_BINARY;
    } else {
      process.env.COMMAND_EVE_NODE_BINARY = prevCommandEveNodeBinary;
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
    await expect(page.getByText(/agent-events\.clean\.jsonl/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Lokales Board|Local Board/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Marketing Board/).first()).toBeVisible({ timeout: 30_000 });

    // ── Ensure the board DB exists by running the proof card first ──────────
    // This is the same step the command-center spec proves. It initialises
    // the DB and makes the "Post anlegen" button enabled.
    await page.getByRole('button', { name: /Proof-Karte anlegen|Create proof card/ }).click();
    await expect(page.getByText(/KANBAN_MARKETING_PROOF_CARD_CREATED|KANBAN_MARKETING_PROOF_CARD_EXISTS/)).toBeVisible({
      timeout: 60_000,
    });

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

  // ── TEST 3: Local card actions ────────────────────────────────────────────
  test('actions: GUI comment/block/unblock/complete produce receipts without spawning Hermes', async ({
    page,
    electronApp,
  }, testInfo) => {
    if (!createdCardId || !boardDbPath) {
      throw new Error(
        `[kanban-board e2e] action test requires a prior successful create test; ` +
          `createdCardId=${String(createdCardId)} boardDbPath=${String(boardDbPath)}`
      );
    }

    const userDataPath = await electronApp.evaluate(async ({ app }) => app.getPath('userData'));
    const reconciliationPath = path.join(
      userDataPath,
      'command-eve-runtime',
      'capabilities',
      'command-eve-runtime-reconciliation.json'
    );
    writeReconciliationLock(reconciliationPath);

    await page.waitForSelector('body', { state: 'visible' });
    await page.evaluate(() => {
      window.location.hash = '#/command-center';
    });
    await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Marketing Board/).first()).toBeVisible({ timeout: 30_000 });

    const cardTestId = `marketing-card-${createdCardId}`;
    await expect(page.getByTestId(cardTestId)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId(`marketing-card-comment-${createdCardId}`).click();
    await expect(page.getByTestId('marketing-card-comment-modal')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('marketing-card-comment-input').fill('E2E local action receipt.');
    await page.getByTestId('marketing-card-comment-submit').click();
    await expect(page.getByTestId('marketing-card-comment-modal')).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('KANBAN_MARKETING_CARD_COMMENTED')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId(`marketing-card-block-${createdCardId}`).click();
    await expect(page.getByText('KANBAN_MARKETING_CARD_BLOCKED')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('marketing-lane-review').getByTestId(cardTestId)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId(`marketing-card-unblock-${createdCardId}`).click();
    await expect(page.getByText('KANBAN_MARKETING_CARD_UNBLOCKED')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('marketing-lane-review').getByTestId(cardTestId)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId(`marketing-card-complete-${createdCardId}`).click();
    await expect(page.getByText('KANBAN_MARKETING_CARD_COMPLETED')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('marketing-lane-readyToApprove').getByTestId(cardTestId)).toBeVisible({
      timeout: 30_000,
    });

    const taskRows = sqliteQuery(
      boardDbPath,
      `SELECT id, current_step_key, status, completed_at FROM tasks WHERE id = '${createdCardId}'`
    );
    expect(taskRows[0][1], 'current_step_key must be readyToApprove after complete').toBe('readyToApprove');
    expect(taskRows[0][2], 'status must be completed after complete').toBe('completed');
    expect(Number(taskRows[0][3]), 'completed_at must be recorded').toBeGreaterThan(0);

    const commentRows = sqliteQuery(
      boardDbPath,
      `SELECT author, body FROM task_comments WHERE task_id = '${createdCardId}'`
    );
    expect(commentRows.length, 'task_comments receipt row must exist').toBeGreaterThan(0);
    expect(commentRows[0][0], 'comment author must be eve').toBe('eve');
    expect(commentRows[0][1], 'comment body must match submitted text').toBe('E2E local action receipt.');

    const receiptKinds = sqliteQuery(
      boardDbPath,
      `SELECT kind, payload FROM task_events WHERE task_id = '${createdCardId}' AND kind IN ('command_eve_card_commented','command_eve_card_blocked','command_eve_card_unblocked','command_eve_card_completed') ORDER BY id`
    );
    expect(receiptKinds.map((row) => row[0])).toEqual([
      'command_eve_card_commented',
      'command_eve_card_blocked',
      'command_eve_card_unblocked',
      'command_eve_card_completed',
    ]);
    for (const row of receiptKinds) {
      const payload = JSON.parse(row[1]) as { subprocess_spawned?: boolean; external_calls?: boolean };
      expect(payload.subprocess_spawned, `${row[0]} must not spawn Hermes`).toBe(false);
      expect(payload.external_calls, `${row[0]} must not call external services`).toBe(false);
    }

    const ledgerLines = fs.readFileSync(e2eLedgerPath, 'utf8').split('\n').filter(Boolean);
    for (const eventType of [
      'kanban.marketing_board_card_commented',
      'kanban.marketing_board_card_blocked',
      'kanban.marketing_board_card_unblocked',
      'kanban.marketing_board_card_completed',
    ]) {
      const match = ledgerLines.find((line) => {
        try {
          const evt = JSON.parse(line) as { event_type?: string; issue_id?: string };
          return evt.issue_id === createdCardId && evt.event_type === eventType;
        } catch {
          return false;
        }
      });
      expect(match, `audit ledger must contain ${eventType} for card_id=${createdCardId}`).toBeTruthy();
    }

    const screenshotPath = 'tests/e2e/results/command-eve-kanban-board-actions.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('kanban-board-action-proof', { path: screenshotPath, contentType: 'image/png' });
  });

  // ── TEST 4: Dispatch gate check ───────────────────────────────────────────
  test('dispatch gate: GUI click routes through NL-5 and records a blocked no-spawn receipt', async ({
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
    writeReconciliationLock(reconciliationPath);

    await page.waitForSelector('body', { state: 'visible' });
    await page.reload();
    await page.waitForSelector('body', { state: 'visible' });
    await page.evaluate(() => {
      window.location.hash = '#/command-center';
    });
    await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Lokales Board|Local Board/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Marketing Board/).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /Proof-Karte anlegen|Create proof card/ }).click();
    await expect(page.getByText(/KANBAN_MARKETING_PROOF_CARD_CREATED|KANBAN_MARKETING_PROOF_CARD_EXISTS/)).toBeVisible({
      timeout: 60_000,
    });

    const createOpenBtn = page.getByTestId('marketing-card-create-open');
    await expect(createOpenBtn).toBeVisible({ timeout: 30_000 });
    await expect(createOpenBtn).toBeEnabled({ timeout: 30_000 });

    const dbPathLabel = await page.locator('span:has-text("/kanban/boards/marketing/kanban.db")').first().textContent();
    const dbPathMatch = dbPathLabel?.match(/([^\s]+kanban\.db)/);
    const dispatchBoardDbPath = dbPathMatch?.[1] ?? null;
    expect(dispatchBoardDbPath, 'Board db_path must be visible in the marketing board section').toBeTruthy();

    const postTitle = `${uniquePostTitle()} Dispatch`;
    await createOpenBtn.click();
    await expect(page.getByTestId('marketing-card-create-modal')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('marketing-card-create-title').fill(postTitle);
    await page.getByTestId('marketing-card-create-description').fill('E2E mutation proof – dispatch gate');
    await page.getByTestId('marketing-card-create-submit').click();
    await expect(page.getByTestId('marketing-card-create-modal')).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('KANBAN_MARKETING_CARD_CREATED')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(postTitle)).toBeVisible({ timeout: 30_000 });

    const cardArticle = page.locator(`article:has-text("${postTitle}")`).first();
    await expect(cardArticle).toBeVisible({ timeout: 10_000 });
    const cardTestId = await cardArticle.getAttribute('data-testid');
    expect(cardTestId, 'Card article must have data-testid attribute').toBeTruthy();
    const dispatchCardId = cardTestId?.replace(/^marketing-card-/, '') ?? null;
    expect(dispatchCardId, 'card_id must be extractable from data-testid').toBeTruthy();

    const dispatchButton = page.getByTestId(`marketing-card-dispatch-plan-${dispatchCardId}`);
    await expect(dispatchButton).toBeVisible({ timeout: 30_000 });
    await dispatchButton.click();

    const dispatchResult = page.getByTestId('marketing-card-dispatch-plan-result');
    await expect(dispatchResult).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('marketing-card-dispatch-plan-detail')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('marketing-card-dispatch-plan-reason')).toHaveText(
      /hermes\.pre_generation\.controller_approval_missing/
    );
    await expect(dispatchResult.getByText(/Hermes: nicht gestartet|Hermes: not spawned/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('marketing-card-dispatch-controller-approval')).toContainText(
      /Controller-Freigabe:\s*erforderlich|Controller approval:\s*required/,
      {
        timeout: 30_000,
      }
    );
    await expect(page.getByTestId('marketing-card-dispatch-release-gate')).toContainText(
      /Release:\s*blockiert|Release:\s*blocked/,
      {
        timeout: 30_000,
      }
    );
    await expect(page.getByTestId('command-center-operating-readiness')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('operating-readiness-dispatchBlocked')).toContainText(
      /ready|bereit|KANBAN_MARKETING_DISPATCH_PLAN_READY/
    );
    await expect(page.getByTestId('operating-readiness-workerAutonomyLocked')).toContainText(
      /ready|bereit|worker_dispatch|dispatcher_enabled=false/
    );

    const dispatchRows = sqliteQuery(
      dispatchBoardDbPath!,
      `SELECT kind, payload FROM task_events WHERE task_id = '${dispatchCardId}' AND kind = 'command_eve_dispatch_plan_checked' LIMIT 1`
    );
    expect(dispatchRows.length, `dispatch plan receipt must exist for ${dispatchCardId}`).toBeGreaterThan(0);
    const dispatchPayload = JSON.parse(dispatchRows[0][1]) as {
      nl5_gate_checked?: boolean;
      subprocess_spawned?: boolean;
      controller_approval_required?: boolean;
      release_blocked?: boolean;
      reason_codes?: string[];
    };
    expect(dispatchPayload.nl5_gate_checked, 'NL-5 must be checked').toBe(true);
    expect(dispatchPayload.subprocess_spawned, 'Hermes subprocess must not spawn without controller approval').toBe(
      false
    );
    expect(dispatchPayload.controller_approval_required, 'Controller approval must be required').toBe(true);
    expect(dispatchPayload.release_blocked, 'Release must remain blocked before controller approval').toBe(true);
    expect(dispatchPayload.reason_codes).toContain('hermes.pre_generation.controller_approval_missing');

    const ledgerLines = fs.readFileSync(e2eLedgerPath, 'utf8').split('\n').filter(Boolean);
    const matchingDispatchAudit = ledgerLines.find((line) => {
      try {
        const evt = JSON.parse(line) as { event_type?: string; issue_id?: string; payload?: Record<string, unknown> };
        return (
          evt.issue_id === dispatchCardId &&
          evt.event_type === 'kanban.marketing_board_dispatch_plan_checked' &&
          evt.payload?.subprocess_spawned === false
        );
      } catch {
        return false;
      }
    });
    expect(
      matchingDispatchAudit,
      `audit ledger must contain kanban.marketing_board_dispatch_plan_checked for card_id=${dispatchCardId}`
    ).toBeTruthy();

    const screenshotPath = 'tests/e2e/results/command-eve-kanban-board-dispatch-gate.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('kanban-board-dispatch-gate-proof', { path: screenshotPath, contentType: 'image/png' });
  });

  // ── TEST 5: Embedded NL-5 fallback ─────────────────────────────────────────
  test('dispatch gate: GUI click uses embedded NL-5 when Company.OS dispatch CLI is unavailable', async ({
    page,
    electronApp,
  }, testInfo) => {
    const nl5FixtureRoot = process.env.COMMAND_EVE_NL5_COMPANY_OS_ROOT;
    if (nl5FixtureRoot) {
      fs.rmSync(nl5FixtureRoot, { recursive: true, force: true });
    }

    const userDataPath = await electronApp.evaluate(async ({ app }) => app.getPath('userData'));
    const reconciliationPath = path.join(
      userDataPath,
      'command-eve-runtime',
      'capabilities',
      'command-eve-runtime-reconciliation.json'
    );
    writeReconciliationLock(reconciliationPath);

    await page.waitForSelector('body', { state: 'visible' });
    await page.reload();
    await page.waitForSelector('body', { state: 'visible' });
    await page.evaluate(() => {
      window.location.hash = '#/command-center';
    });
    await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Marketing Board/).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /Proof-Karte anlegen|Create proof card/ }).click();
    await expect(page.getByText(/KANBAN_MARKETING_PROOF_CARD_CREATED|KANBAN_MARKETING_PROOF_CARD_EXISTS/)).toBeVisible({
      timeout: 60_000,
    });

    const createOpenBtn = page.getByTestId('marketing-card-create-open');
    await expect(createOpenBtn).toBeEnabled({ timeout: 30_000 });
    const dbPathLabel = await page.locator('span:has-text("/kanban/boards/marketing/kanban.db")').first().textContent();
    const dbPathMatch = dbPathLabel?.match(/([^\s]+kanban\.db)/);
    const embeddedBoardDbPath = dbPathMatch?.[1] ?? null;
    expect(embeddedBoardDbPath, 'Board db_path must be visible for embedded NL-5 proof').toBeTruthy();

    const postTitle = `${uniquePostTitle()} Embedded NL5`;
    await createOpenBtn.click();
    await expect(page.getByTestId('marketing-card-create-modal')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('marketing-card-create-title').fill(postTitle);
    await page
      .getByTestId('marketing-card-create-description')
      .fill('Embedded NL-5 proof with German phone +49 30 12345678 and no external Company.OS CLI.');
    await page.getByTestId('marketing-card-create-submit').click();
    await expect(page.getByTestId('marketing-card-create-modal')).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('KANBAN_MARKETING_CARD_CREATED')).toBeVisible({ timeout: 60_000 });

    const cardArticle = page.locator(`article:has-text("${postTitle}")`).first();
    await expect(cardArticle).toBeVisible({ timeout: 10_000 });
    const cardTestId = await cardArticle.getAttribute('data-testid');
    const embeddedCardId = cardTestId?.replace(/^marketing-card-/, '') ?? null;
    expect(embeddedCardId, 'embedded NL-5 card_id must be extractable').toBeTruthy();

    await page.getByTestId(`marketing-card-dispatch-plan-${embeddedCardId}`).click();

    const dispatchResult = page.getByTestId('marketing-card-dispatch-plan-result');
    await expect(dispatchResult).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('marketing-card-dispatch-plan-source')).toHaveText('command-eve-embedded-nl5', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('marketing-card-dispatch-plan-reason')).toHaveText(
      /hermes\.pre_generation\.controller_approval_missing/
    );
    await expect(dispatchResult.getByText(/Hermes: nicht gestartet|Hermes: not spawned/)).toBeVisible({
      timeout: 30_000,
    });

    const dispatchRows = sqliteQuery(
      embeddedBoardDbPath!,
      `SELECT kind, payload FROM task_events WHERE task_id = '${embeddedCardId}' AND kind = 'command_eve_dispatch_plan_checked' LIMIT 1`
    );
    expect(dispatchRows.length, `embedded dispatch receipt must exist for ${embeddedCardId}`).toBeGreaterThan(0);
    const dispatchPayload = JSON.parse(dispatchRows[0][1]) as {
      nl5_gate_checked?: boolean;
      subprocess_spawned?: boolean;
      dispatch_source?: string;
      dispatch_source_reason?: string;
      reason_codes?: string[];
      policy?: {
        dispatch_source?: string;
        dispatch_source_reason?: string;
        implementation?: string;
        data_boundary_receipt?: { finding_count?: number; raw_text_stored?: boolean };
      };
    };
    expect(dispatchPayload.nl5_gate_checked).toBe(true);
    expect(dispatchPayload.subprocess_spawned).toBe(false);
    expect(dispatchPayload.dispatch_source).toBe('command-eve-embedded-nl5');
    expect(dispatchPayload.policy?.dispatch_source).toBe('command-eve-embedded-nl5');
    expect(dispatchPayload.dispatch_source_reason || dispatchPayload.policy?.dispatch_source_reason || '').toContain(
      'Company.OS'
    );
    expect(dispatchPayload.reason_codes).toContain('hermes.pre_generation.controller_approval_missing');
    expect(dispatchPayload.policy?.implementation).toBe('command-eve-embedded-nl5');
    expect(dispatchPayload.policy?.data_boundary_receipt?.raw_text_stored).toBe(false);
    expect(dispatchPayload.policy?.data_boundary_receipt?.finding_count ?? 0).toBeGreaterThanOrEqual(1);

    const ledgerLines = fs.readFileSync(e2eLedgerPath, 'utf8').split('\n').filter(Boolean);
    const matchingEmbeddedAudit = ledgerLines.find((line) => {
      try {
        const evt = JSON.parse(line) as { event_type?: string; issue_id?: string; payload?: Record<string, unknown> };
        return (
          evt.issue_id === embeddedCardId &&
          evt.event_type === 'kanban.marketing_board_dispatch_plan_checked' &&
          evt.payload?.subprocess_spawned === false
        );
      } catch {
        return false;
      }
    });
    expect(
      matchingEmbeddedAudit,
      `audit ledger must contain embedded NL-5 dispatch event for card_id=${embeddedCardId}`
    ).toBeTruthy();

    const screenshotPath = 'tests/e2e/results/command-eve-kanban-board-embedded-nl5.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('kanban-board-embedded-nl5-proof', { path: screenshotPath, contentType: 'image/png' });
  });

  // ── TEST 6: CRM overlay init ──────────────────────────────────────────────
  test('crm overlay: GUI click initializes local-only CRM schema + audit receipt', async ({
    page,
    electronApp,
  }, testInfo) => {
    const userDataPath = await electronApp.evaluate(async ({ app }) => app.getPath('userData'));
    removeCrmOverlayDatabases(userDataPath);
    const reconciliationPath = path.join(
      userDataPath,
      'command-eve-runtime',
      'capabilities',
      'command-eve-runtime-reconciliation.json'
    );
    writeReconciliationLock(reconciliationPath);

    await page.waitForSelector('body', { state: 'visible' });
    await page.reload();
    await page.waitForSelector('body', { state: 'visible' });
    await page.evaluate(() => {
      window.location.hash = '#/command-center';
    });
    await expect(page.getByText(/Command Center|Kommandozentrale/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/CRM Overlay/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('crm-overlay-blocked')).toBeVisible({ timeout: 30_000 });

    const initializeButton = page.getByTestId('crm-overlay-initialize');
    await expect(initializeButton).toBeVisible({ timeout: 30_000 });
    await expect(initializeButton).toBeEnabled({ timeout: 30_000 });
    await initializeButton.click();

    await expect(page.getByTestId('crm-overlay-initialize-result')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/CRM_OVERLAY_INITIALIZED_LOCAL_ONLY/)).toBeVisible({ timeout: 60_000 });
    await expect(initializeButton).toBeDisabled({ timeout: 30_000 });

    const dbPathLabel = await page.getByTestId('crm-overlay-db-path').textContent();
    const crmDbPath = dbPathLabel?.trim() || '';
    expect(crmDbPath, 'CRM overlay db path must be visible').toContain('command-eve-crm.db');

    const tableRows = sqliteQuery(crmDbPath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    expect(tableRows).toEqual([
      ['crm_companies'],
      ['crm_contacts'],
      ['crm_deals'],
      ['crm_events'],
      ['sqlite_sequence'],
    ]);
    const crmEventRows = sqliteQuery(
      crmDbPath,
      "SELECT kind, payload FROM crm_events WHERE kind = 'crm_overlay_initialized'"
    );
    expect(crmEventRows.length, 'crm_events initialization receipt must exist').toBeGreaterThan(0);
    const crmEventPayload = JSON.parse(crmEventRows[0][1]) as {
      local_only?: boolean;
      hosted_sync_enabled?: boolean;
      outreach_enabled?: boolean;
      human_gate?: string;
    };
    expect(crmEventPayload.local_only).toBe(true);
    expect(crmEventPayload.hosted_sync_enabled).toBe(false);
    expect(crmEventPayload.outreach_enabled).toBe(false);
    expect(crmEventPayload.human_gate).toBe('HG-4');

    const draftButton = page.getByTestId('crm-draft-create');
    await expect(draftButton).toBeVisible({ timeout: 30_000 });
    await expect(draftButton).toBeEnabled({ timeout: 30_000 });
    await draftButton.click();

    await expect(page.getByTestId('crm-draft-create-result')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/CRM_DRAFT_DEAL_CREATED_LOCAL_ONLY/)).toBeVisible({ timeout: 60_000 });
    const draftDealList = page.getByTestId('crm-draft-deal-list');
    await expect(draftDealList).toBeVisible({ timeout: 30_000 });
    await expect(draftDealList.getByText(/crm-deal-/)).toBeVisible({ timeout: 30_000 });
    await expect(draftDealList.getByText('draft-only')).toBeVisible({ timeout: 30_000 });
    await expect(draftDealList.getByText('unknown')).toBeVisible({ timeout: 30_000 });
    await expect(draftDealList.getByText('HG-4')).toBeVisible({ timeout: 30_000 });
    await expect(draftDealList.getByText('S2')).toBeVisible({ timeout: 30_000 });

    const qualifyButton = draftDealList.getByRole('button', { name: /Qualifizieren|Qualify/ }).first();
    await expect(qualifyButton).toBeVisible({ timeout: 30_000 });
    await expect(qualifyButton).toBeEnabled({ timeout: 30_000 });
    await qualifyButton.click();

    await expect(page.getByTestId('crm-stage-local-result')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/CRM_STAGE_CHANGED_LOCAL_ONLY/)).toBeVisible({ timeout: 60_000 });
    await expect(draftDealList.getByText('qualified')).toBeVisible({ timeout: 30_000 });

    const consentButton = draftDealList.getByRole('button', { name: /Consent notieren|Record consent/ }).first();
    await expect(consentButton).toBeVisible({ timeout: 30_000 });
    await expect(consentButton).toBeEnabled({ timeout: 30_000 });
    await consentButton.click();

    await expect(page.getByTestId('crm-consent-local-result')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/CRM_CONSENT_CAPTURED_LOCAL_ONLY/)).toBeVisible({ timeout: 60_000 });
    await expect(draftDealList.getByText('captured-local')).toBeVisible({ timeout: 30_000 });
    await expect(draftDealList.getByText('review-only')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('command-center-operating-readiness')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('operating-readiness-crmNl5Receipts')).toContainText(/ready|bereit/);

    const dealRows = sqliteQuery(
      crmDbPath,
      'SELECT stage, allowed_actions, consent_status, human_gate, data_class FROM crm_deals'
    );
    expect(dealRows).toEqual([['qualified', 'review-only', 'captured-local', 'HG-4', 'S2']]);
    const draftEventRows = sqliteQuery(
      crmDbPath,
      "SELECT kind, payload FROM crm_events WHERE kind = 'crm_draft_deal_created'"
    );
    expect(draftEventRows.length, 'crm_events draft receipt must exist').toBeGreaterThan(0);
    const draftEventPayload = JSON.parse(draftEventRows[0][1]) as {
      local_only?: boolean;
      outreach_enabled?: boolean;
      consent_status?: string;
      allowed_actions?: string;
      human_gate?: string;
      data_boundary_checked?: boolean;
      data_boundary_receipt?: { version?: string; action?: string; status?: string };
    };
    expect(draftEventPayload.local_only).toBe(true);
    expect(draftEventPayload.outreach_enabled).toBe(false);
    expect(draftEventPayload.consent_status).toBe('unknown');
    expect(draftEventPayload.allowed_actions).toBe('draft-only');
    expect(draftEventPayload.human_gate).toBe('HG-4');
    expect(draftEventPayload.data_boundary_checked).toBe(true);
    expect(draftEventPayload.data_boundary_receipt).toMatchObject({
      version: 'command-eve-crm-nl5-local-receipt/v0',
      action: 'crm_draft_deal_create',
      status: 'local-only-pass',
    });
    const stageEventRows = sqliteQuery(
      crmDbPath,
      "SELECT kind, payload FROM crm_events WHERE kind = 'crm_draft_deal_stage_changed'"
    );
    expect(stageEventRows.length, 'crm_events stage receipt must exist').toBeGreaterThan(0);
    const stageEventPayload = JSON.parse(stageEventRows[0][1]) as {
      local_only?: boolean;
      outreach_enabled?: boolean;
      subprocess_spawned?: boolean;
      consent_status?: string;
      allowed_actions?: string;
      human_gate?: string;
      stage?: string;
      data_boundary_checked?: boolean;
      data_boundary_receipt?: { version?: string; action?: string; status?: string };
    };
    expect(stageEventPayload.local_only).toBe(true);
    expect(stageEventPayload.outreach_enabled).toBe(false);
    expect(stageEventPayload.subprocess_spawned).toBe(false);
    expect(stageEventPayload.consent_status).toBe('unknown');
    expect(stageEventPayload.allowed_actions).toBe('draft-only');
    expect(stageEventPayload.human_gate).toBe('HG-4');
    expect(stageEventPayload.stage).toBe('qualified');
    expect(stageEventPayload.data_boundary_checked).toBe(true);
    expect(stageEventPayload.data_boundary_receipt).toMatchObject({
      version: 'command-eve-crm-nl5-local-receipt/v0',
      action: 'crm_draft_deal_stage_local',
      status: 'local-only-pass',
    });
    const consentEventRows = sqliteQuery(
      crmDbPath,
      "SELECT kind, payload FROM crm_events WHERE kind = 'crm_consent_captured_local'"
    );
    expect(consentEventRows.length, 'crm_events consent receipt must exist').toBeGreaterThan(0);
    const consentEventPayload = JSON.parse(consentEventRows[0][1]) as {
      local_only?: boolean;
      outreach_enabled?: boolean;
      subprocess_spawned?: boolean;
      consent_status?: string;
      consent_basis?: string;
      consent_source?: string;
      allowed_actions?: string;
      human_gate?: string;
      data_class?: string;
      data_boundary_checked?: boolean;
      data_boundary_receipt?: { version?: string; action?: string; status?: string };
    };
    expect(consentEventPayload.local_only).toBe(true);
    expect(consentEventPayload.outreach_enabled).toBe(false);
    expect(consentEventPayload.subprocess_spawned).toBe(false);
    expect(consentEventPayload.consent_status).toBe('captured-local');
    expect(consentEventPayload.consent_basis).toBe('manual-founder-confirmation');
    expect(consentEventPayload.consent_source).toBe('command-eve-local-ui');
    expect(consentEventPayload.allowed_actions).toBe('review-only');
    expect(consentEventPayload.human_gate).toBe('HG-4');
    expect(consentEventPayload.data_class).toBe('S2');
    expect(consentEventPayload.data_boundary_checked).toBe(true);
    expect(consentEventPayload.data_boundary_receipt).toMatchObject({
      version: 'command-eve-crm-nl5-local-receipt/v0',
      action: 'crm_consent_capture_local',
      status: 'local-only-pass',
    });

    const ledgerLines = fs.readFileSync(e2eLedgerPath, 'utf8').split('\n').filter(Boolean);
    const matchingCrmAudit = ledgerLines.find((line) => {
      try {
        const evt = JSON.parse(line) as { event_type?: string; payload?: Record<string, unknown> };
        return evt.event_type === 'crm.overlay_initialized' && evt.payload?.local_only === true;
      } catch {
        return false;
      }
    });
    expect(matchingCrmAudit, 'audit ledger must contain crm.overlay_initialized').toBeTruthy();
    const matchingCrmDraftAudit = ledgerLines.find((line) => {
      try {
        const evt = JSON.parse(line) as { event_type?: string; payload?: Record<string, unknown> };
        return (
          evt.event_type === 'crm.draft_deal_created' &&
            evt.payload?.local_only === true &&
            evt.payload?.allowed_actions === 'draft-only' &&
            evt.payload?.data_boundary_checked === true
        );
      } catch {
        return false;
      }
    });
    expect(matchingCrmDraftAudit, 'audit ledger must contain crm.draft_deal_created').toBeTruthy();
    const matchingCrmStageAudit = ledgerLines.find((line) => {
      try {
        const evt = JSON.parse(line) as { event_type?: string; payload?: Record<string, unknown> };
        return (
          evt.event_type === 'crm.draft_deal_stage_changed' &&
          evt.payload?.local_only === true &&
            evt.payload?.subprocess_spawned === false &&
            evt.payload?.data_boundary_checked === true &&
            evt.payload?.stage === 'qualified'
        );
      } catch {
        return false;
      }
    });
    expect(matchingCrmStageAudit, 'audit ledger must contain crm.draft_deal_stage_changed').toBeTruthy();
    const matchingCrmConsentAudit = ledgerLines.find((line) => {
      try {
        const evt = JSON.parse(line) as { event_type?: string; payload?: Record<string, unknown> };
        return (
          evt.event_type === 'crm.consent_captured_local' &&
          evt.payload?.local_only === true &&
            evt.payload?.subprocess_spawned === false &&
            evt.payload?.data_boundary_checked === true &&
            evt.payload?.consent_status === 'captured-local' &&
          evt.payload?.allowed_actions === 'review-only'
        );
      } catch {
        return false;
      }
    });
    expect(matchingCrmConsentAudit, 'audit ledger must contain crm.consent_captured_local').toBeTruthy();

    const screenshotPath = 'tests/e2e/results/command-eve-crm-overlay-init.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('crm-overlay-init-proof', { path: screenshotPath, contentType: 'image/png' });
  });
});
