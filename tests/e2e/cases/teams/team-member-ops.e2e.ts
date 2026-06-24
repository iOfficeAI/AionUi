/**
 * E2E: Team member operations — rename leader tab, remove member.
 */
import { test, expect } from '../../fixtures';
import { cleanupTeamsByName, createTeam, findAssistantIdForBackend, invokeBridge, navigateTo } from '../../helpers';

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

    await navigateTo(page, '#/team');
    let teamId: string;
    try {
      teamId = await createTeam(page, TEAM_NAME);
    } catch {
      console.log('[E2E] createTeam unavailable — skipping member-ops rename test');
      test.skip();
      return;
    }
    expect(teamId).toBeTruthy();

    const tabBar = page.locator('[data-testid="team-tab-bar"]');
    await expect(tabBar).toBeVisible({ timeout: 15_000 });

    const leaderTab = tabBar.locator('[data-team-tab-role="leader"]').first();
    await expect(leaderTab).toBeVisible({ timeout: 10_000 });

    const originalName = await leaderTab.locator('[data-testid^="team-tab-name-"]').first().textContent();
    expect(originalName?.trim()).toBeTruthy();

    await page.screenshot({ path: 'tests/e2e/results/member-ops-01-before-rename.png' });

    // Double-click the tab to enter edit mode
    await leaderTab.dblclick();

    const renameInput = leaderTab.locator('input');
    await expect(renameInput).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/member-ops-02-editing.png' });

    // Clear and type new name
    const newName = 'Renamed-Leader';
    await renameInput.fill(newName);
    await renameInput.press('Enter');

    // Input should disappear (editing committed)
    await expect(renameInput).toBeHidden({ timeout: 5_000 });

    // Tab should now display the new name
    await expect(leaderTab.locator('[data-testid^="team-tab-name-"]').first()).toHaveText(newName, { timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/member-ops-03-renamed.png' });
  });

  test('remove member via tab close button', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateTo(page, '#/team');
    let teamId: string;
    try {
      teamId = await createTeam(page, TEAM_NAME);
    } catch {
      console.log('[E2E] createTeam unavailable — skipping member-ops remove test');
      test.skip();
      return;
    }
    expect(teamId).toBeTruthy();

    const memberAssistantId = await findAssistantIdForBackend(page, 'claude');
    if (!memberAssistantId) {
      console.log('[E2E] No assistant found for claude backend — skipping member remove flow.');
      test.skip();
      return;
    }

    // Add a member deterministically via IPC bridge (setup, not under test)
    const memberName = `E2E-rm-${Date.now()}`;
    const addResult = await invokeBridge<{ slot_id: string } | null>(page, 'team.add-agent', {
      team_id: teamId,
      agent: {
        name: memberName,
        role: 'teammate',
        assistant_id: memberAssistantId,
        model: 'claude',
      },
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
    const memberTab = page.locator(`[data-testid="team-tab-${addResult.slot_id}"]`);
    await expect(memberTab).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/member-ops-04-member-added.png' });

    // Count tabs before removal
    const tabsBefore = await tabBar.locator('[data-testid^="team-tab-"][data-team-tab-role]').count();
    expect(tabsBefore).toBeGreaterThanOrEqual(2);

    await memberTab.hover();

    const closeBtn = memberTab.locator(`[data-testid="team-tab-remove-${addResult.slot_id}"]`);
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
    await expect(page.locator(`[data-testid="team-tab-${addResult.slot_id}"]`)).toHaveCount(0, { timeout: 10_000 });

    const tabsAfter = await tabBar.locator('[data-testid^="team-tab-"][data-team-tab-role]').count();
    expect(tabsAfter).toBeLessThan(tabsBefore);
  });
});
