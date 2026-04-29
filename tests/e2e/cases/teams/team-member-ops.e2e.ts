/**
 * E2E: Team member operations — rename leader tab, remove member.
 */
import { test, expect } from '../../fixtures';
import { cleanupTeamsByName, createTeam, invokeBridge, navigateTo } from '../../helpers';

const TEAM_NAME = 'E2E-Member-Ops';

test.describe('Team Member Ops', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupTeamsByName(page, TEAM_NAME);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTeamsByName(page, TEAM_NAME);
  });

  test('rename leader tab via double-click', async ({ page }) => {
    test.setTimeout(120_000);

    const teamId = await createTeam(page, TEAM_NAME);
    expect(teamId).toBeTruthy();

    const tabBar = page.locator('[data-testid="team-tab-bar"]');
    await expect(tabBar).toBeVisible({ timeout: 15_000 });

    // Identify the leader tab — it is the first tab inside the bar
    const firstTab = tabBar.locator('> div > div > div').first();
    await expect(firstTab).toBeVisible({ timeout: 10_000 });

    // Grab the original name text from the tab
    const originalName = await firstTab.locator('span').last().textContent();
    expect(originalName?.trim()).toBeTruthy();

    await page.screenshot({ path: 'tests/e2e/results/member-ops-01-before-rename.png' });

    // Double-click the tab to enter edit mode
    await firstTab.dblclick();

    // An input should appear inside the tab
    const renameInput = firstTab.locator('input');
    await expect(renameInput).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/member-ops-02-editing.png' });

    // Clear and type new name
    const newName = 'Renamed-Leader';
    await renameInput.fill(newName);
    await renameInput.press('Enter');

    // Input should disappear (editing committed)
    await expect(renameInput).toBeHidden({ timeout: 5_000 });

    // Tab should now display the new name
    await expect(tabBar.locator(`text=${newName}`).first()).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/member-ops-03-renamed.png' });
  });

  test('remove member via tab close button', async ({ page }) => {
    test.setTimeout(120_000);

    const teamId = await createTeam(page, TEAM_NAME);
    expect(teamId).toBeTruthy();

    // Add a member deterministically via IPC bridge (setup, not under test)
    const memberName = `E2E-rm-${Date.now()}`;
    const addResult = await invokeBridge<{ slot_id: string } | null>(page, 'team.add-agent', {
      team_id: teamId,
      agent: { name: memberName, role: 'teammate', backend: 'acp', model: 'claude' },
    }).catch(() => null);

    if (!addResult?.slot_id) {
      console.log('[E2E] team.add-agent failed — agent backend may not be installed. Skipping.');
      test.skip();
      return;
    }

    // Reload team page so SWR picks up the new member
    await navigateTo(page, '#/team/' + teamId);
    await page.waitForURL(/\/team\//, { timeout: 10_000 });

    const tabBar = page.locator('[data-testid="team-tab-bar"]');
    await expect(tabBar).toBeVisible({ timeout: 15_000 });

    // Verify the member tab appeared
    const memberTab = tabBar.locator('span').filter({ hasText: memberName }).first();
    await expect(memberTab).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/member-ops-04-member-added.png' });

    // Count tabs before removal
    const tabsBefore = await tabBar.locator('> div > div > div').count();
    expect(tabsBefore).toBeGreaterThanOrEqual(2);

    // Find the member tab's container div (has the close button)
    const memberTabContainer = tabBar.locator('> div > div > div').filter({ hasText: memberName }).first();
    await expect(memberTabContainer).toBeVisible({ timeout: 5_000 });

    // Hover to reveal the close button
    await memberTabContainer.hover();

    // CloseSmall icon renders as svg inside a span; it is the last such span for non-leader tabs
    const closeBtn = memberTabContainer
      .locator('span')
      .filter({ has: page.locator('svg') })
      .last();
    await expect(closeBtn).toBeVisible({ timeout: 3_000 });
    await closeBtn.click();

    // If the agent is active, a confirm modal appears; otherwise removal is instant
    const confirmModal = page.locator('.arco-modal-simple');
    const hasConfirm = await confirmModal
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);

    if (hasConfirm) {
      const okBtn = confirmModal.locator('.arco-btn-primary').first();
      await expect(okBtn).toBeVisible({ timeout: 3_000 });
      await okBtn.click();
      await expect(confirmModal).toBeHidden({ timeout: 8_000 });
    }

    await page.screenshot({ path: 'tests/e2e/results/member-ops-05-after-remove.png' });

    // Member tab should be gone
    await expect(tabBar.locator('span').filter({ hasText: memberName })).toHaveCount(0, { timeout: 10_000 });

    // Tab count should have decreased
    const tabsAfter = await tabBar.locator('> div > div > div').count();
    expect(tabsAfter).toBeLessThan(tabsBefore);
  });
});
