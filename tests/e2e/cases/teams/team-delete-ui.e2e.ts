/**
 * Case 5: Delete Team — Full UI Flow
 *
 * Setup: create team via API (invokeBridge).
 * Core steps: Sider right-click -> Delete -> confirm modal -> assert gone.
 * No mocks, no UI shortcuts.
 */
import { test, expect } from '../../fixtures';
import { invokeBridge, navigateTo, cleanupTeamsByName, createTeam } from '../../helpers';

const TEAM_NAME = 'E2E Case5 Delete Team';

test.describe('Team Delete - Full UI Flow', () => {
  let teamId: string;

  test.beforeEach(async ({ page }) => {
    await cleanupTeamsByName(page, TEAM_NAME);

    try {
      teamId = await createTeam(page, TEAM_NAME);
    } catch {
      test.skip(true, 'No supported backend available — skipping Case 5');
      return;
    }

    // Navigate to the team page so the sidebar shows the team in context
    await navigateTo(page, `#/team/${teamId}`);
    await page.waitForURL(/\/team\//, { timeout: 10_000 });
  });

  test('delete team via sidebar context menu', async ({ page }) => {
    await page.screenshot({ path: 'tests/e2e/results/case5-01-before-delete.png' });

    // Step 1: Locate the team row in the Sider
    const teamRow = page
      .locator('div.group')
      .filter({ has: page.locator('[data-testid="sider-item-menu-trigger"]') })
      .filter({ has: page.getByText(TEAM_NAME, { exact: true }) })
      .first();
    await teamRow.waitFor({ state: 'visible', timeout: 10_000 });

    // Step 2: Hover to reveal the three-dot menu trigger, then click it
    await teamRow.hover();
    const menuTrigger = teamRow.locator('[data-testid="sider-item-menu-trigger"]');
    await menuTrigger.waitFor({ state: 'visible', timeout: 5_000 });
    await menuTrigger.click();

    await page.screenshot({ path: 'tests/e2e/results/case5-02-context-menu.png' });

    // Step 3: Click the Delete menu item
    const deleteMenuItem = page
      .locator('.arco-dropdown-menu-item, [role="menuitem"]')
      .filter({ hasText: /删除|Delete/i })
      .first();
    await deleteMenuItem.waitFor({ state: 'visible', timeout: 5_000 });
    await deleteMenuItem.click();

    // Step 4: Confirm dialog appears
    const confirmModal = page.locator('.arco-modal-simple');
    await confirmModal.waitFor({ state: 'visible', timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/case5-03-confirm-dialog.png' });

    // Step 5: Click the confirm/OK button
    const confirmBtn = page
      .locator('.arco-modal .arco-btn-primary')
      .filter({ hasText: /确定|OK|Delete|删除/i })
      .first();
    await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmBtn.click();

    // Step 6: Modal closes
    await expect(confirmModal).toBeHidden({ timeout: 8_000 });

    // Step 7: URL navigates away from the deleted team page
    await page.waitForFunction((id) => !window.location.hash.includes(id), teamId, {
      timeout: 10_000,
    });

    const currentHash = await page.evaluate(() => window.location.hash);
    expect(currentHash).not.toContain(teamId);

    // Step 8: Team name disappears from the Sider
    await expect(page.getByText(TEAM_NAME, { exact: true })).toHaveCount(0, { timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/case5-04-after-delete.png' });

    // Step 9: Backend confirms team is gone
    const teamState = await invokeBridge<unknown>(page, 'team.get', { id: teamId }).catch(
      () => null
    );
    expect(teamState).toBeNull();
  });
});
