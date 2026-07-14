/**
 * E2E Scenario 1: Create a team from the sidebar.
 *
 * Flow: sidebar "+" button -> Create Team modal -> fill form -> create -> verify navigation
 */
import { test, expect } from '../../fixtures';
import { TEAM_SUPPORTED_BACKENDS, cleanupTeamsByName } from '../../helpers';

/**
 * UI label patterns for each backend. Used to match the assistant option in
 * the Create Team list. Falls back to a case-insensitive backend name match.
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
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await expect(createBtn).toBeVisible();
  });

  test('clicking + opens create team modal', async ({ page }) => {
    // Wait for create button to be ready before clicking
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Screenshot: modal open
    await page.screenshot({ path: 'tests/e2e/results/team-02-modal.png' });

    // Verify Modal is visible with "Create Team" title
    const modalTitle = page.locator('.arco-modal h3').filter({ hasText: /Create Team|创建团队/ });
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    // Verify Team name input exists
    const modal = page.locator('.arco-modal');
    const nameInput = modal.getByRole('textbox').first();
    await expect(nameInput).toBeVisible();

    // Verify assistant leader choices render, or the empty-state appears.
    const leaderOptions = modal.locator('[data-testid^="team-create-agent-option-"]');
    const noAssistantsMsg = page.locator('.arco-modal').getByText(/No supported assistants available|没有支持的助手/i);
    const hasOptions = await leaderOptions
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasNoAssistantsMsg = await noAssistantsMsg.isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasOptions || hasNoAssistantsMsg).toBeTruthy();

    // Verify Create button exists (disabled until agent is selected and name is filled)
    const confirmBtn = page.locator('.arco-modal .arco-btn-primary');
    await expect(confirmBtn).toBeVisible();

    // Close modal via the standard header close button
    await page.locator('.arco-modal button[aria-label="Close"]').first().click();
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
  });

  test('can fill form and create team', async ({ page }) => {
    // Wait for create button to be ready before clicking
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Wait for modal to appear
    const modalTitle = page.locator('.arco-modal h3').filter({ hasText: /Create Team|创建团队/ });
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    // Fill team name
    const modal = page.locator('.arco-modal');
    const nameInput = modal.getByRole('textbox').first();
    await nameInput.fill('E2E Test Team');

    const firstOption = modal.locator('[data-testid^="team-create-agent-option-"]').first();
    const hasOption = await firstOption.isVisible({ timeout: 3000 }).catch(() => false);

    await page.screenshot({ path: 'tests/e2e/results/team-03-assistant-list.png' });

    if (hasOption) {
      await expect(firstOption).toBeVisible({ timeout: 5000 });
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

      // cleanup: remove the team we just created to avoid polluting later tests
      await cleanupTeamsByName(page, 'E2E Test Team');
    } else {
      // No supported agents installed — screenshot and skip
      await page.screenshot({ path: 'tests/e2e/results/team-03-no-assistants.png' });
      console.log('[E2E] No supported assistants available for team creation');
      test.skip();
    }
  });
});

/**
 * Helper: open the Create Team modal, fill a team name, select the assistant
 * whose option text matches `agentTextPattern`, click Create, and verify the
 * team was created. Skips gracefully if the assistant is unavailable.
 */
async function createTeamWithAgent(
  page: import('@playwright/test').Page,
  teamName: string,
  agentTextPattern: RegExp,
  screenshotPrefix: string
): Promise<void> {
  // Wait for create button to be ready (sidebar may still be loading after previous test)
  const createBtn = page.locator('[data-testid="team-create-btn"]').first();
  await expect(createBtn).toBeVisible({ timeout: 10000 });
  await createBtn.click();

  // Wait for modal to appear
  const modalTitle = page.locator('.arco-modal h3').filter({ hasText: /Create Team|创建团队/ });
  await expect(modalTitle).toBeVisible({ timeout: 5000 });

  // Fill team name
  const modal = page.locator('.arco-modal');
  const nameInput = modal.getByRole('textbox').first();
  await nameInput.fill(teamName);

  await page.screenshot({ path: `tests/e2e/results/${screenshotPrefix}-assistant-list.png` });

  // Find the assistant option matching the text pattern.
  const allOptions = modal.locator('[data-testid^="team-create-agent-option-"]');
  await expect(allOptions.first())
    .toBeVisible({ timeout: 5000 })
    .catch(() => {});
  const optionCount = await allOptions.count().catch(() => 0);

  let matchingOption: import('@playwright/test').Locator | null = null;
  for (let i = 0; i < optionCount; i++) {
    const option = allOptions.nth(i);
    const text = await option.textContent().catch(() => '');
    if (agentTextPattern.test(text ?? '')) {
      matchingOption = option;
      break;
    }
  }

  if (!matchingOption) {
    await page.locator('.arco-modal button[aria-label="Close"]').first().click({ force: true });
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
    console.log(`[E2E] Assistant matching ${agentTextPattern} not found — skipping`);
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

  // cleanup: remove the team we just created to avoid polluting later tests
  await cleanupTeamsByName(page, teamName);
}

test.describe('Team Create - whitelisted leader types', () => {
  for (const backend of TEAM_SUPPORTED_BACKENDS) {
    const pattern = BACKEND_UI_PATTERN[backend] ?? new RegExp(backend, 'i');
    test(`create E2E Team (${backend})`, async ({ page }) => {
      await createTeamWithAgent(page, `E2E Team (${backend})`, pattern, `team-${backend}`);
    });
  }
});
