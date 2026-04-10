/**
 * E2E Scenario 1: Create a team from the sidebar.
 *
 * Flow: sidebar "+" button -> Create Team modal -> fill form -> create -> verify navigation
 */
import { test, expect } from '../fixtures';
import { TEAM_SUPPORTED_BACKENDS } from '../helpers';

/**
 * UI label patterns for each backend. Used to match the agent option in the
 * Create Team dropdown. Falls back to a case-insensitive backend name match.
 */
const BACKEND_UI_PATTERN: Record<string, RegExp> = {
  claude: /Claude Code/i,
  codex: /Codex/i,
  gemini: /Gemini/i,
};

test.describe('Team Create', () => {
  test('sidebar shows team section with create button', async ({ page }) => {
    // Wait for sidebar to render — no fixed timeout, listen for element
    const teamSection = page.locator('text=Teams').or(page.locator('text=团队'));
    await expect(teamSection.first()).toBeVisible({ timeout: 15000 });

    // Screenshot: initial state
    await page.screenshot({ path: 'tests/e2e/results/team-01-initial.png' });

    // Verify the "+" create button exists next to the Teams title
    const createBtn = page.locator('.h-20px.w-20px.rd-4px').first();
    await expect(createBtn).toBeVisible();
  });

  test('clicking + opens create team modal', async ({ page }) => {
    // Wait for create button to be ready before clicking
    const createBtn = page.locator('.h-20px.w-20px.rd-4px').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Screenshot: modal open
    await page.screenshot({ path: 'tests/e2e/results/team-02-modal.png' });

    // Verify Modal is visible with "Create Team" title
    const modalTitle = page.locator('.arco-modal-title').filter({ hasText: /Create Team|创建团队/ });
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    // Verify Team name input exists
    const nameInput = page.locator('.arco-modal input').first();
    await expect(nameInput).toBeVisible();

    // Verify Dispatch Agent select exists
    const agentSelect = page.locator('.arco-modal .arco-select').first();
    await expect(agentSelect).toBeVisible();

    // Verify Create button exists but is disabled (form not filled)
    const confirmBtn = page.locator('.arco-modal .arco-btn-primary');
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeDisabled();

    // Close modal and wait for it to disappear
    await page.locator('.arco-modal .arco-modal-close-icon').click();
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
  });

  test('can fill form and create team', async ({ page }) => {
    // Wait for create button to be ready before clicking
    const createBtn = page.locator('.h-20px.w-20px.rd-4px').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Wait for modal to appear
    const modalTitle = page.locator('.arco-modal-title').filter({ hasText: /Create Team|创建团队/ });
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    // Fill team name
    const nameInput = page.locator('.arco-modal input').first();
    await nameInput.fill('E2E Test Team');

    // Open Agent select dropdown and wait for options to appear
    const agentSelect = page.locator('.arco-modal .arco-select').first();
    await agentSelect.click();
    const firstOption = page.locator('.arco-select-option').first();
    await firstOption.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // Screenshot: dropdown options
    await page.screenshot({ path: 'tests/e2e/results/team-03-agent-dropdown.png' });

    const hasOption = await firstOption.isVisible().catch(() => false);

    if (hasOption) {
      await firstOption.click();

      // Wait for select value to reflect the chosen option (Create btn becomes enabled)
      const confirmBtn = page.locator('.arco-modal .arco-btn-primary');
      await expect(confirmBtn).toBeEnabled({ timeout: 5000 });

      // Screenshot: form filled
      await page.screenshot({ path: 'tests/e2e/results/team-04-filled.png' });

      // Click Create and wait for navigation
      await confirmBtn.click();
      await page.waitForURL(/\/team\//, { timeout: 15000 });

      // Screenshot: after creation
      await page.screenshot({ path: 'tests/e2e/results/team-05-created.png' });

      // Verify team name appears in sidebar
      const teamName = page.locator('text=E2E Test Team');
      await expect(teamName.first()).toBeVisible({ timeout: 10000 });
    } else {
      // No supported agents installed — screenshot and skip
      await page.screenshot({ path: 'tests/e2e/results/team-03-no-agents.png' });
      console.log('[E2E] No supported agents available for team creation');
      test.skip();
    }
  });
});

/**
 * Helper: open the Create Team modal, fill a team name, select the agent whose
 * option text matches `agentTextPattern`, click Create, and verify the team
 * was created. Skips gracefully if the agent is not installed.
 */
async function createTeamWithAgent(
  page: import('@playwright/test').Page,
  teamName: string,
  agentTextPattern: RegExp,
  screenshotPrefix: string
): Promise<void> {
  // Wait for create button to be ready (sidebar may still be loading after previous test)
  const createBtn = page.locator('.h-20px.w-20px.rd-4px').first();
  await expect(createBtn).toBeVisible({ timeout: 10000 });
  await createBtn.click();

  // Wait for modal to appear
  const modalTitle = page.locator('.arco-modal-title').filter({ hasText: /Create Team|创建团队/ });
  await expect(modalTitle).toBeVisible({ timeout: 5000 });

  // Fill team name
  const nameInput = page.locator('.arco-modal input').first();
  await nameInput.fill(teamName);

  // Open agent select dropdown and wait for options
  const agentSelect = page.locator('.arco-modal .arco-select').first();
  await agentSelect.click();
  await page
    .locator('.arco-select-option')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {});

  await page.screenshot({ path: `tests/e2e/results/${screenshotPrefix}-dropdown.png` });

  // Find the option matching the agent text pattern
  const matchingOption = page.locator('.arco-select-option').filter({ hasText: agentTextPattern }).first();
  const optionVisible = await matchingOption.isVisible().catch(() => false);

  if (!optionVisible) {
    // Agent not installed — close dropdown then modal, skip test
    await page.keyboard.press('Escape');
    await page.locator('.arco-modal .arco-modal-close-icon').click({ force: true });
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
    console.log(`[E2E] Agent matching ${agentTextPattern} not found — skipping`);
    test.skip();
    return;
  }

  await matchingOption.click();

  // Wait for Create button to become enabled (select value applied)
  const confirmBtn = page.locator('.arco-modal .arco-btn-primary');
  await expect(confirmBtn).toBeEnabled({ timeout: 5000 });

  await page.screenshot({ path: `tests/e2e/results/${screenshotPrefix}-filled.png` });

  // Submit and wait for navigation
  await confirmBtn.click();
  await page.waitForURL(/\/team\//, { timeout: 15000 });

  await page.screenshot({ path: `tests/e2e/results/${screenshotPrefix}-created.png` });

  // Verify team name appears in sidebar
  const teamNameLocator = page.locator(`text=${teamName}`);
  await expect(teamNameLocator.first()).toBeVisible({ timeout: 10000 });
}

test.describe('Team Create - whitelisted leader types', () => {
  for (const backend of TEAM_SUPPORTED_BACKENDS) {
    const pattern = BACKEND_UI_PATTERN[backend] ?? new RegExp(backend, 'i');
    test(`create E2E Team (${backend})`, async ({ page }) => {
      await createTeamWithAgent(page, `E2E Team (${backend})`, pattern, `team-${backend}`);
    });
  }
});
