/**
 * Case 1: Create Team - Full UI Flow
 *
 * Verifies the complete flow from Sider create button to Team page navigation.
 * No invokeBridge in core steps — all actions are real user interactions.
 * Cleanup uses invokeBridge (test data teardown is permitted).
 */
import { test, expect } from '../../fixtures';
import { TEAM_SUPPORTED_BACKENDS, cleanupTeamsByName } from '../../helpers';

const TEAM_NAME = 'E2E Test Team 001';

test.describe('Team Create - Full UI Flow', () => {
  test('create team via UI without any API shortcut', async ({ page }) => {
    if (TEAM_SUPPORTED_BACKENDS.size === 0) {
      test.skip();
      return;
    }

    // Step 1: Wait for Sider Teams section to appear
    const teamSection = page.locator('text=Teams').or(page.locator('text=团队'));
    await expect(teamSection.first()).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-ui-01-sider.png' });

    // Step 2: Click "+" create button
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    // Step 3: Verify modal opened
    const modal = page.locator('.arco-modal').last();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const modalTitle = modal.locator('h3').filter({ hasText: /Create Team|创建团队/ });
    await expect(modalTitle).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-ui-02-modal.png' });

    // Step 4: Fill team name
    const nameInput = modal.getByRole('textbox').first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(TEAM_NAME);
    await expect(nameInput).toHaveValue(TEAM_NAME);

    // Step 5: Open leader dropdown
    const leaderSelect = modal.locator('[data-testid="team-create-leader-select"]');
    const hasLeaderSelect = await leaderSelect.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!hasLeaderSelect) {
      // No supported agents installed — cancel and skip
      const cancelBtn = modal.locator('.arco-btn').filter({ hasText: /Cancel|取消/i }).first();
      await cancelBtn.click({ force: true }).catch(() => {});
      console.log('[E2E] No supported agent available for team creation — skipping');
      test.skip();
      return;
    }

    await leaderSelect.click();

    await page.screenshot({ path: 'tests/e2e/results/team-ui-03-dropdown.png' });

    // Step 6: Select first available agent option (options are portaled to document.body)
    const firstOption = page.locator('[data-testid^="team-create-agent-option-"]').first();
    await expect(firstOption).toBeVisible({ timeout: 5_000 });
    await firstOption.click();

    // Step 7: Verify Create button becomes enabled, then click
    const confirmBtn = modal.locator('.arco-btn-primary');
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-ui-04-filled.png' });

    await confirmBtn.click();

    // Step 8: Wait for navigation to /team/{id}
    await page.waitForURL(/\/team\//, { timeout: 15_000 });

    // Modal must be closed after navigation
    await expect(modal).toBeHidden({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-ui-05-created.png' });

    // Step 9: Verify Sider shows the new team name
    const teamNameInSider = page.locator(`text=${TEAM_NAME}`);
    await expect(teamNameInSider.first()).toBeVisible({ timeout: 10_000 });

    // Step 10: Verify Tab bar with Leader agent is visible
    const tabBar = page.locator('[data-testid="team-tab-bar"]');
    await expect(tabBar).toBeVisible({ timeout: 10_000 });

    // At least one tab (the Leader) must exist
    const tabs = tabBar.locator('> div');
    await expect(tabs.first()).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-ui-06-team-page.png' });

    // Cleanup: remove the team via IPC (test data teardown only)
    await cleanupTeamsByName(page, TEAM_NAME);
  });
});
