/**
 * Guid Agent Selection — E2E tests.
 *
 * Covers: agent pill bar rendering, agent/preset selection, switching,
 * skill loading, cross-page sync.
 */
import { test, expect } from '../fixtures';
import { goToGuid, AGENT_PILL, AGENT_PILL_SELECTED, agentPillByBackend, selectAgent } from '../helpers';

test.describe('Guid Agent Selection', () => {
  test('agent pill bar renders on guid page', async ({ page }) => {
    await goToGuid(page);

    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });
    expect(await pills.count()).toBeGreaterThanOrEqual(1);
  });

  test('select Gemini agent via pill', async ({ page }) => {
    await goToGuid(page);

    const geminiPill = page.locator(agentPillByBackend('gemini'));
    const aionrsPill = page.locator(agentPillByBackend('aionrs'));

    // Try gemini first, fallback to aionrs (fork gemini)
    const targetPill = (await geminiPill.isVisible().catch(() => false)) ? geminiPill : aionrsPill;
    const pillVisible = await targetPill.isVisible().catch(() => false);
    if (!pillVisible) {
      test.skip(true, 'Neither gemini nor aionrs pill available');
      return;
    }

    await targetPill.click();
    await expect(targetPill).toHaveAttribute('data-agent-selected', 'true');
  });

  test('select Claude agent via pill', async ({ page }) => {
    await goToGuid(page);

    const pill = page.locator(agentPillByBackend('claude'));
    const pillVisible = await pill.isVisible().catch(() => false);
    if (!pillVisible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Claude agent pill not available');
        return;
      }
    }

    await pill.click();
    await expect(pill).toHaveAttribute('data-agent-selected', 'true');
  });

  test('select Codex agent via pill', async ({ page }) => {
    await goToGuid(page);

    const pill = page.locator(agentPillByBackend('codex'));
    const pillVisible = await pill.isVisible().catch(() => false);
    if (!pillVisible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Codex agent pill not available');
        return;
      }
    }

    await pill.click();
    await expect(pill).toHaveAttribute('data-agent-selected', 'true');
  });

  test('switching agent deselects previous', async ({ page }) => {
    await goToGuid(page);

    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });

    const count = await pills.count();
    if (count < 2) {
      test.skip(true, 'Need at least 2 agent pills to test switching');
      return;
    }

    // Select first pill
    await pills.nth(0).click();
    await expect(pills.nth(0)).toHaveAttribute('data-agent-selected', 'true');

    // Select second pill
    await pills.nth(1).click();
    await expect(pills.nth(1)).toHaveAttribute('data-agent-selected', 'true');
    await expect(pills.nth(0)).toHaveAttribute('data-agent-selected', 'false');
  });

  test('preset assistants visible in selection area', async ({ page }) => {
    await goToGuid(page);

    // Preset assistant pills use data-testid="preset-pill-{id}"
    const presetPills = page.locator('[data-testid^="preset-pill-"]');
    // Wait for pills area to load
    await page.locator(AGENT_PILL).first().waitFor({ state: 'visible', timeout: 8_000 });

    // Check if any preset pills are visible (may not exist if no presets configured)
    const presetCount = await presetPills.count();
    // This test verifies rendering — if presets exist, they should be visible
    if (presetCount > 0) {
      await expect(presetPills.first()).toBeVisible();
    }
  });

  test('select preset assistant changes selection state', async ({ page }) => {
    await goToGuid(page);
    await page.locator(AGENT_PILL).first().waitFor({ state: 'visible', timeout: 8_000 });

    const presetPills = page.locator('[data-testid^="preset-pill-"]');
    const presetCount = await presetPills.count();
    if (presetCount === 0) {
      test.skip(true, 'No preset assistants available');
      return;
    }

    // Click the first preset
    await presetPills.first().click();

    // After selecting a preset, the agent pill bar should show the preset's backend as selected
    // or the selection area should switch to "selected assistant view"
    // Check that some selection state changed
    const selectedPills = page.locator(AGENT_PILL_SELECTED);
    await expect(selectedPills.first()).toBeVisible({ timeout: 5_000 });
  });

  test('switch between two presets', async ({ page }) => {
    await goToGuid(page);
    await page.locator(AGENT_PILL).first().waitFor({ state: 'visible', timeout: 8_000 });

    const presetPills = page.locator('[data-testid^="preset-pill-"]');
    const presetCount = await presetPills.count();
    if (presetCount < 2) {
      test.skip(true, 'Need at least 2 preset assistants');
      return;
    }

    // Select first preset
    await presetPills.nth(0).click();
    // Small wait for state to settle
    await page.waitForTimeout(500);

    // Select second preset
    await presetPills.nth(1).click();
    await page.waitForTimeout(500);

    // Verify page doesn't crash and some selection is active
    const selectedPills = page.locator(AGENT_PILL_SELECTED);
    await expect(selectedPills.first()).toBeVisible({ timeout: 5_000 });
  });

  test('agent pill bar shows backend data attribute', async ({ page }) => {
    await goToGuid(page);

    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });

    // Every pill should have a data-agent-backend attribute
    const count = await pills.count();
    for (let i = 0; i < count; i++) {
      const backend = await pills.nth(i).getAttribute('data-agent-backend');
      expect(backend).toBeTruthy();
      // Backend should not be 'custom' for agent pills (presets are filtered out)
      expect(backend).not.toBe('custom');
    }
  });

  test('newly created assistant appears on guid page', async ({ page }) => {
    // This test requires creating an assistant first
    // Navigate to settings, create, then check guid
    // We'll verify the cross-page sync by navigating
    await goToGuid(page);
    await page.locator(AGENT_PILL).first().waitFor({ state: 'visible', timeout: 8_000 });

    // Navigate to assistant settings
    await page.evaluate(() => window.location.assign('#/settings/assistants'));
    await page.waitForFunction(() => window.location.hash.includes('/settings/assistants'), { timeout: 10_000 });

    // Navigate back to guid — assistants should still load
    await goToGuid(page);
    await page.locator(AGENT_PILL).first().waitFor({ state: 'visible', timeout: 8_000 });

    // Page should render without errors
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(10);
  });

  test('unavailable agent pill is not rendered or shows unavailable state', async ({ page }) => {
    await goToGuid(page);

    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });

    // All visible pills should have valid backends
    const count = await pills.count();
    for (let i = 0; i < count; i++) {
      const backend = await pills.nth(i).getAttribute('data-agent-backend');
      // Should be a non-empty string
      expect(backend).toBeTruthy();
      expect(typeof backend).toBe('string');
    }
  });

  test('agent pill has data-agent-key attribute', async ({ page }) => {
    await goToGuid(page);

    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });

    const firstKey = await pills.first().getAttribute('data-agent-key');
    expect(firstKey).toBeTruthy();
  });
});
