/**
 * E2E: Delete team via sider menu.
 *
 * Flow: hover team sidebar item -> click three-dot trigger -> click Delete ->
 *       confirm modal -> assert navigation away + IPC confirms removal.
 */
import { test, expect } from '../../../fixtures';
import { invokeBridge, navigateTo, createTeam, cleanupTeamsByName } from '../../../helpers';

test.describe('Team Delete', () => {
  test('delete team via sider menu navigates away from team page', async ({ page }) => {
    const teamName = 'E2E Delete Team';

    // [setup] Remove leftovers from previous runs, then create a fresh team
    await cleanupTeamsByName(page, teamName);

    let teamId: string;
    try {
      teamId = await createTeam(page, teamName);
    } catch {
      test.skip(true, 'No supported backend available — skipping delete test');
      return;
    }

    // [navigate] Go to team page
    await navigateTo(page, '#/team/' + teamId);
    await page.waitForURL(/\/team\//, { timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-delete-01-before.png' });

    // [action] Hover the team sidebar item to reveal the three-dot menu trigger
    const teamItem = page.locator('text=' + teamName).first();
    await teamItem.waitFor({ state: 'visible', timeout: 10_000 });
    await teamItem.hover();

    // Three-dot trigger: prefer data-testid, fall back to group-ancestor span
    const menuTrigger = page
      .locator('[data-testid="sider-item-menu-trigger"]')
      .or(
        teamItem
          .locator('xpath=ancestor::div[contains(@class,"group")]')
          .locator('span.rd-4px.cursor-pointer')
          .last()
      );

    await menuTrigger.waitFor({ state: 'visible', timeout: 5_000 });
    await menuTrigger.click();

    await page.screenshot({ path: 'tests/e2e/results/team-delete-02-dropdown.png' });

    // [action] Click the Delete menu item
    const deleteMenuItem = page
      .locator('.arco-dropdown-menu-item, [role="menuitem"]')
      .filter({ hasText: /删除|Delete/i })
      .first();
    await deleteMenuItem.waitFor({ state: 'visible', timeout: 5_000 });
    await deleteMenuItem.click();

    await page.screenshot({ path: 'tests/e2e/results/team-delete-03-confirm-modal.png' });

    // [confirm] Click the primary confirm button in the arco Modal.confirm dialog
    const confirmOkBtn = page
      .locator('.arco-modal .arco-btn-primary')
      .filter({ hasText: /确定|OK|Delete|删除/i })
      .first();
    await confirmOkBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmOkBtn.click();

    // [assert-ui] URL should no longer contain the deleted teamId
    await page.waitForFunction(
      (id) => !window.location.hash.includes(id),
      teamId,
      { timeout: 10_000 }
    );

    await page.screenshot({ path: 'tests/e2e/results/team-delete-04-navigated-away.png' });

    const currentHash = await page.evaluate(() => window.location.hash);
    expect(currentHash).not.toContain(teamId);

    // [assert-backend] IPC should confirm team is gone
    const teamState = await invokeBridge<unknown>(page, 'team.get', { id: teamId }).catch(() => null);
    expect(teamState).toBeNull();
  });

  test('deleted team is removed from sidebar', async ({ page }) => {
    const teamName = 'E2E Delete Sidebar Team';

    // [setup] Remove leftovers, then create a fresh team
    await cleanupTeamsByName(page, teamName);

    let teamId: string;
    try {
      teamId = await createTeam(page, teamName);
    } catch {
      test.skip(true, 'No supported backend available — skipping delete sidebar test');
      return;
    }

    await navigateTo(page, '#/team/' + teamId);
    await page.waitForURL(/\/team\//, { timeout: 10_000 });

    // [assert] Sidebar shows the team before deletion
    const sidebarEntry = page.locator('text=' + teamName).first();
    await expect(sidebarEntry).toBeVisible({ timeout: 10_000 });

    // [action] Hover to reveal trigger
    await sidebarEntry.hover();

    const menuTrigger = page
      .locator('[data-testid="sider-item-menu-trigger"]')
      .or(
        sidebarEntry
          .locator('xpath=ancestor::div[contains(@class,"group")]')
          .locator('span.rd-4px.cursor-pointer')
          .last()
      );

    await menuTrigger.waitFor({ state: 'visible', timeout: 5_000 });
    await menuTrigger.click();

    const deleteMenuItem = page
      .locator('.arco-dropdown-menu-item, [role="menuitem"]')
      .filter({ hasText: /删除|Delete/i })
      .first();
    await deleteMenuItem.waitFor({ state: 'visible', timeout: 5_000 });
    await deleteMenuItem.click();

    const confirmOkBtn = page
      .locator('.arco-modal .arco-btn-primary')
      .filter({ hasText: /确定|OK|Delete|删除/i })
      .first();
    await confirmOkBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmOkBtn.click();

    // Wait for modal to close
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 8_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-delete-05-sidebar-after.png' });

    // [assert] Sidebar no longer shows the deleted team name
    await expect(page.locator('text=' + teamName)).toHaveCount(0, { timeout: 10_000 });
  });
});
