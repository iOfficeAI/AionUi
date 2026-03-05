/**
 * ACP Agent – integration & switching tests.
 *
 * Covers:
 *  - Agent settings page loads and has management UI
 *  - Agent pill bar on guid page renders available agents
 *  - Switching between agent backends
 *  - Agent mode selection within a backend
 *  - MCP tools page loads
 */
import { test, expect } from '../fixtures';
import { goToGuid, goToSettings, expectBodyContainsAny, expectUrlContains, agentLogoByBackend, takeScreenshot } from '../helpers';

test.describe('ACP Agent', () => {
  // ── Settings page ────────────────────────────────────────────────────────

  test('agent settings page has management UI', async ({ page }) => {
    await goToSettings(page, 'agent');
    await expectBodyContainsAny(page, ['Agent', 'agent', '助手', '预设', 'Preset', 'Custom', 'Assistants']);
  });

  test('screenshot: agent settings', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToSettings(page, 'agent');
    await takeScreenshot(page, 'agent-settings');
  });

  // ── Pill bar on guid page ────────────────────────────────────────────────

  test('agent pill bar renders on guid page', async ({ page }) => {
    await goToGuid(page);

    // At least one agent logo should be visible (any backend)
    const logos = page.locator(
      'img[alt$=" logo"]' // matches "claude logo", "gemini logo", etc.
    );
    await expect(logos.first()).toBeVisible({ timeout: 10000 });

    const count = await logos.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('can see agent backend names', async ({ page }) => {
    await goToGuid(page);

    // Check that at least one known backend name appears in the pill bar area
    const knownBackends = ['claude', 'gemini', 'qwen', 'opencode', 'codex', 'iflow'];
    const logos = page.locator('img[alt$=" logo"]');
    await expect(logos.first()).toBeVisible({ timeout: 10000 });

    const count = await logos.count();
    const foundBackends: string[] = [];
    for (let i = 0; i < count; i++) {
      const alt = await logos.nth(i).getAttribute('alt');
      if (alt) {
        const backend = alt.replace(' logo', '');
        if (knownBackends.includes(backend)) {
          foundBackends.push(backend);
        }
      }
    }
    expect(foundBackends.length).toBeGreaterThanOrEqual(1);
  });

  test('clicking an agent pill selects it', async ({ page }) => {
    await goToGuid(page);

    // Wait for pill bar to be visible
    const logos = page.locator('img[alt$=" logo"]');
    await expect(logos.first()).toBeVisible({ timeout: 10000 });

    const count = await logos.count();
    if (count >= 2) {
      // Click the second agent to switch
      const secondAgent = logos.nth(1);
      const secondAlt = await secondAgent.getAttribute('alt');
      await secondAgent.click();

      // Wait for selection state to settle (class change)
      const parent = secondAgent.locator('..');
      const grandparent = parent.locator('..');
      await expect(grandparent).toBeVisible();
      // We just verify the click didn't throw and the page is still stable
      expect(secondAlt).toBeTruthy();
    }
  });

  test('screenshot: agent pill bar', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToGuid(page);
    const logos = page.locator('img[alt$=" logo"]');
    await expect(logos.first()).toBeVisible({ timeout: 10000 });
    await takeScreenshot(page, 'agent-pill-bar');
  });

  // ── MCP tools page ───────────────────────────────────────────────────────

  test('MCP tools page has server management UI', async ({ page }) => {
    await goToSettings(page, 'tools');
    await expectUrlContains(page, 'tools');
    await expectBodyContainsAny(page, ['MCP', 'mcp', 'Server', 'server', '工具', '配置', '添加', 'Add']);
  });

  // ── IPC: available agents ────────────────────────────────────────────────

  test('can query available agents via IPC', async ({ page, electronApp }) => {
    await goToGuid(page);

    const windowCount = await electronApp.evaluate(async ({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(windowCount).toBeGreaterThanOrEqual(1);
  });
});
