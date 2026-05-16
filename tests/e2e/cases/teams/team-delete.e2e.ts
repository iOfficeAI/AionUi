/**
 * E2E: Delete team via sider menu.
 *
 * Flow: hover team sidebar item -> click three-dot trigger -> click Delete ->
 *       confirm modal -> assert navigation away + IPC confirms removal.
 */
import { test, expect } from '../../fixtures';
import { invokeBridge, navigateTo, createTeam, cleanupTeamsByName } from '../../helpers';

async function deleteTeamBySiderMenu(page: Parameters<typeof createTeam>[0], teamName: string) {
  // Scope to the sidebar team row: a `.group` ancestor that contains the three-dot trigger AND
  // the exact team-name text. Exactness avoids "E2E Delete Team" matching "E2E Delete Sidebar Team".
  const teamRow = page
    .locator('div.group')
    .filter({ has: page.locator('[data-testid="sider-item-menu-trigger"]') })
    .filter({ has: page.getByText(teamName, { exact: true }) })
    .first();
  await teamRow.waitFor({ state: 'visible', timeout: 10_000 });
  await teamRow.hover();

  const menuTrigger = teamRow.locator('[data-testid="sider-item-menu-trigger"]');

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
}

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

    await deleteTeamBySiderMenu(page, teamName);

    // [assert-ui] URL should no longer contain the deleted teamId
    await page.waitForFunction((id) => !window.location.hash.includes(id), teamId, { timeout: 10_000 });

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
    const sidebarEntry = page.getByText(teamName, { exact: true }).first();
    await expect(sidebarEntry).toBeVisible({ timeout: 10_000 });

    await deleteTeamBySiderMenu(page, teamName);

    // Wait for the confirm dialog to close. Scope to `.arco-modal-simple` because
    // Modal.confirm renders with the `simple` modifier — this avoids matching a lingering
    // TeamCreateModal DOM node (still in the tree with `zoomModal-exit-done` class).
    await expect(page.locator('.arco-modal-simple')).toBeHidden({ timeout: 8_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-delete-05-sidebar-after.png' });

    // [assert] Sidebar no longer shows the deleted team name
    await expect(page.getByText(teamName, { exact: true })).toHaveCount(0, { timeout: 10_000 });
  });
});
