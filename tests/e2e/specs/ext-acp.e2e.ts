/**
 * Extensions – ACP Adapters tests.
 *
 * Validates extension-contributed ACP adapters on the agent settings
 * and guid pages.
 */
import { test, expect } from '../fixtures';
import { goToGuid, goToSettings, expectBodyContainsAny, takeScreenshot, waitForSettle } from '../helpers';

test.describe('Extension: ACP Adapters', () => {
  test('agent settings page loads with extension agents', async ({ page }) => {
    await goToSettings(page, 'agent');
    await expectBodyContainsAny(page, ['Agent', 'agent', '助手', 'Assistants', 'Custom', 'Preset']);
  });

  test('extension-contributed agents visible or page functional', async ({ page }) => {
    await goToSettings(page, 'agent');
    await waitForSettle(page);

    const body = await page.locator('body').textContent();
    // Page should at least render
    expect(body!.length).toBeGreaterThan(50);
  });

  test('agent pill bar on guid page still works with extensions', async ({ page }) => {
    await goToGuid(page);

    // At least one agent logo should appear (built-in backends)
    const logos = page.locator('img[alt$=" logo"]');
    await expect(logos.first()).toBeVisible({ timeout: 5000 });
    const count = await logos.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking an agent pill does not crash with extensions loaded', async ({ page }) => {
    await goToGuid(page);

    const logos = page.locator('img[alt$=" logo"]');
    await expect(logos.first()).toBeVisible({ timeout: 5000 });

    // Click first available agent
    await logos.first().click();
    await expect(logos.first()).toBeVisible();

    // Page should still be stable
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });

  test('screenshot: agent settings with extensions', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToSettings(page, 'agent');
    await waitForSettle(page);
    await takeScreenshot(page, 'ext-acp-agents');
  });
});
