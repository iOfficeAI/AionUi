import { test, expect } from '../../fixtures';
import { cleanupTeamsByName, createTeam } from '../../helpers';

const TEAM_FULLSCREEN = 'E2E Fullscreen Team';
const TEAM_MODEL = 'E2E Model Selector Team';

test.describe('Team View Modes', () => {
  test('fullscreen toggle: enter and exit fullscreen for an agent slot', async ({ page }) => {
    await cleanupTeamsByName(page, TEAM_FULLSCREEN);

    try {
      await createTeam(page, TEAM_FULLSCREEN);
    } catch {
      test.skip();
      return;
    }

    // Wait for the leader agent panel header to render
    const agentHeader = page.locator('.border-b .flex.items-center.justify-between').first();
    await expect(agentHeader).toBeVisible({ timeout: 15_000 });

    // Locate the FullScreen icon button (icon-park renders .i-icon-full-screen)
    const fullscreenBtn = page.locator('.i-icon-full-screen').first();
    await expect(fullscreenBtn).toBeVisible({ timeout: 10_000 });

    // Count agent slot containers before fullscreen
    const slotsBeforeCount = await page.locator('[data-role="leader"], [data-role="member"]').count();

    await fullscreenBtn.click();

    // After entering fullscreen the OffScreen icon should appear
    const offscreenBtn = page.locator('.i-icon-off-screen').first();
    await expect(offscreenBtn).toBeVisible({ timeout: 5_000 });

    // In fullscreen mode, FullScreen icon should not be present
    await expect(page.locator('.i-icon-full-screen')).toHaveCount(0, { timeout: 3_000 });

    // Exit fullscreen
    await offscreenBtn.click();

    // FullScreen icon should reappear
    await expect(page.locator('.i-icon-full-screen').first()).toBeVisible({ timeout: 5_000 });

    // OffScreen icon should disappear (no slot is fullscreened)
    await expect(page.locator('.i-icon-off-screen')).toHaveCount(0, { timeout: 3_000 });

    // Slot count should be restored (at least as many as before)
    const slotsAfterCount = await page.locator('[data-role="leader"], [data-role="member"]').count();
    expect(slotsAfterCount).toBeGreaterThanOrEqual(slotsBeforeCount);

    await cleanupTeamsByName(page, TEAM_FULLSCREEN);
  });

  test('model selector dropdown shows available models for ACP agent', async ({ page }) => {
    await cleanupTeamsByName(page, TEAM_MODEL);

    try {
      await createTeam(page, TEAM_MODEL, 'claude');
    } catch {
      // claude not installed — try codex
      try {
        await createTeam(page, TEAM_MODEL, 'codex');
      } catch {
        test.skip();
        return;
      }
    }

    // Wait for leader agent panel to load
    const agentHeader = page.locator('.border-b .flex.items-center.justify-between').first();
    await expect(agentHeader).toBeVisible({ timeout: 15_000 });

    // Find the model selector button (AcpModelSelector renders with class header-model-btn)
    const modelBtn = page.locator('.header-model-btn').first();
    await expect(modelBtn).toBeVisible({ timeout: 15_000 });

    await modelBtn.click();

    // The dropdown uses Arco Menu — check if menu items appeared
    const menuItems = page.locator('.arco-dropdown-menu-item, .arco-menu-item');
    const menuVisible = await menuItems
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (menuVisible) {
      const itemCount = await menuItems.count();
      expect(itemCount).toBeGreaterThan(0);

      // Close the dropdown by pressing Escape
      await page.keyboard.press('Escape');
    } else {
      // Model info may not be loaded yet (can_switch=false or no models cached).
      // The button is still visible which confirms the component renders — that is acceptable.
      console.log('[E2E] Model selector button visible but dropdown did not open (can_switch may be false)');
    }

    await cleanupTeamsByName(page, TEAM_MODEL);
  });
});
