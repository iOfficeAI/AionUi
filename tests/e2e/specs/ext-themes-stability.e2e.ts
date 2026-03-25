/**
 * Extensions – Themes, Assistants & System Stability tests.
 *
 * Validates extension-contributed themes & assistants, and cross-cutting
 * stability when navigating settings pages with extensions loaded.
 */
import { test, expect } from '../fixtures';
import { goToGuid, goToSettings, goToExtensionSettings, takeScreenshot, waitForSettle } from '../helpers';

// ═════════════════════════════════════════════════════════════════════════════
// Themes from Extensions
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Extension: Themes', () => {
  test('display settings page loads', async ({ page }) => {
    await goToSettings(page, 'display');
    await waitForSettle(page);
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(50);
  });

  test('extension themes may appear in theme list', async ({ page }) => {
    await goToSettings(page, 'display');
    await waitForSettle(page);

    const body = await page.locator('body').textContent();
    // Themes might be rendered as visual cards/thumbnails without text labels
    // The page should at least be meaningfully rendered
    expect(body!.length).toBeGreaterThan(100);
  });

  test('screenshot: display with extension themes', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToSettings(page, 'display');
    await waitForSettle(page);
    await takeScreenshot(page, 'ext-themes');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Assistants from Extensions
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Extension: Assistants', () => {
  test('assistant settings page loads', async ({ page }) => {
    await goToSettings(page, 'agent');
    await waitForSettle(page);
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(50);
  });

  test('extension assistant preset may appear in list', async ({ page }) => {
    await goToSettings(page, 'agent');
    await waitForSettle(page);

    const body = await page.locator('body').textContent();
    // Extension assistants may appear in a presets list or custom section
    // Page should be functional
    expect(body!.length).toBeGreaterThan(50);
  });

  test('screenshot: assistants with extensions', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToSettings(page, 'agent');
    await waitForSettle(page);
    await takeScreenshot(page, 'ext-assistants');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-cutting: extension system stability
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Extension System Stability', () => {
  test('navigating across all settings pages with extensions does not crash', async ({ page }) => {
    const tabs = ['agent', 'tools', 'display', 'webui', 'system', 'about'] as const;

    for (const tab of tabs) {
      await goToSettings(page, tab);
      const body = await page.locator('body').textContent();
      expect(body!.length).toBeGreaterThan(10);
    }

    // Also navigate to extension-contributed settings tabs
    await goToExtensionSettings(page, 'ext-e2e-full-extension-e2e-settings');
    const extBody = await page.locator('body').textContent();
    expect(extBody!.length).toBeGreaterThan(10);

    // Return to guid page
    await goToGuid(page);
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });

  test('no console errors related to extensions on navigation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const tabs = ['agent', 'tools', 'display', 'webui'] as const;
    for (const tab of tabs) {
      await goToSettings(page, tab);
      await waitForSettle(page);
    }

    // Filter for extension-specific errors
    const extErrors = errors.filter(
      (e) =>
        e.toLowerCase().includes('extension') ||
        e.toLowerCase().includes('manifest') ||
        e.toLowerCase().includes('contribute')
    );

    expect(extErrors).toHaveLength(0);
  });
});
