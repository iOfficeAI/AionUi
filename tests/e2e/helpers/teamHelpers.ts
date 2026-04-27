import { expect, type Locator, type Page } from '@playwright/test';
import { invokeBridge } from './bridge';
import { TEAM_SUPPORTED_BACKENDS } from './teamConfig';

type TeamAgent = { role: string; name: string };
type TeamRecord = { id: string; name: string; agents: TeamAgent[] };

/** UI label patterns for each backend leader type. */
const BACKEND_UI_PATTERN: Record<string, RegExp> = {
  claude: /Claude Code/i,
  codex: /Codex/i,
  gemini: /Gemini/i,
};

/**
 * Create a team through the sidebar UI (TeamCreateModal).
 *
 * Uses the real user flow so the TeamCreateModal.onCreated -> refreshTeams()
 * callback runs and the sidebar SWR cache stays in sync. Plain HTTP POST of
 * /api/teams would bypass this, leaving the sidebar empty under Playwright
 * Electron (see mnemo #269).
 *
 * Throws if no supported backend is available — callers should skip the test.
 */
export async function createTeam(page: Page, name: string, leaderType?: string): Promise<string> {
  if (TEAM_SUPPORTED_BACKENDS.size === 0) {
    throw new Error('No supported team backends available — skip this test');
  }

  const createBtn = page.locator('[data-testid="team-create-btn"]').first();
  await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await createBtn.click();

  const modal = page.locator('.arco-modal').last();
  await modal.waitFor({ state: 'visible', timeout: 5_000 });

  const nameInput = modal.getByRole('textbox').first();
  await nameInput.fill(name);

  const leaderSelect = modal.locator('[data-testid="team-create-leader-select"]');
  const hasLeaderSelect = await leaderSelect.isVisible({ timeout: 3_000 }).catch(() => false);
  if (!hasLeaderSelect) {
    await closeModal(page, modal);
    throw new Error('No supported agents installed — skip this test');
  }
  await leaderSelect.click();

  const option = await pickLeaderOption(page, leaderType);
  if (!option) {
    await page.keyboard.press('Escape').catch(() => {});
    await closeModal(page, modal);
    throw new Error(`No agent option matched leader type "${leaderType ?? 'any'}" — skip this test`);
  }
  await option.click();

  const confirmBtn = modal.locator('.arco-btn-primary');
  await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
  await confirmBtn.click();

  await page.waitForURL(/\/team\//, { timeout: 15_000 });

  const hash = await page.evaluate(() => window.location.hash);
  const match = hash.match(/#\/team\/([^/?#]+)/);
  if (!match) {
    throw new Error(`Could not extract teamId from URL hash: ${hash}`);
  }
  return match[1];
}

async function pickLeaderOption(page: Page, leaderType?: string): Promise<Locator | null> {
  const options = page.locator('[data-testid^="team-create-agent-option-"]');
  await options
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => {});

  if (!leaderType) {
    const first = options.first();
    return (await first.count().catch(() => 0)) > 0 ? first : null;
  }

  const pattern = BACKEND_UI_PATTERN[leaderType] ?? new RegExp(leaderType, 'i');
  const count = await options.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const option = options.nth(i);
    const text = await option.textContent().catch(() => '');
    if (pattern.test(text ?? '')) return option;
  }
  return null;
}

async function closeModal(page: Page, modal: Locator): Promise<void> {
  const cancel = modal
    .locator('.arco-btn')
    .filter({ hasText: /Cancel|取消/i })
    .first();
  if ((await cancel.count().catch(() => 0)) > 0) {
    await cancel.click({ force: true }).catch(() => {});
  }
  await page
    .locator('.arco-modal')
    .last()
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .catch(() => {});
}

/**
 * Find-or-create a team by name. Returns teamId.
 */
export async function ensureTeam(page: Page, name: string, leaderType?: string): Promise<string> {
  const teams = await invokeBridge<TeamRecord[]>(page, 'team.list', {
    user_id: 'system_default_user',
  }).catch(() => [] as TeamRecord[]);

  const existing = teams.find((t) => t.name === name);
  if (existing) return existing.id;

  return createTeam(page, name, leaderType);
}

/**
 * Delete a team by id via IPC. No-op if team doesn't exist.
 */
export async function deleteTeam(page: Page, id: string): Promise<void> {
  await invokeBridge(page, 'team.remove', { id }).catch(() => {});
}

/**
 * Remove all teams whose name matches `name`. Used for pre-test cleanup.
 *
 * Cleanup is done via IPC — faster and doesn't require the sidebar row to
 * render. After deleting we reload the page so SWR refetches the team list
 * and the sidebar reflects current backend state.
 */
export async function cleanupTeamsByName(page: Page, name: string): Promise<void> {
  const teams = await invokeBridge<TeamRecord[]>(page, 'team.list', {
    user_id: 'system_default_user',
  }).catch(() => [] as TeamRecord[]);

  const matches = teams.filter((t) => t.name === name);
  for (const t of matches) {
    await invokeBridge(page, 'team.remove', { id: t.id }).catch(() => {});
  }

  if (matches.length > 0) {
    const url = page.url();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
  }
}
