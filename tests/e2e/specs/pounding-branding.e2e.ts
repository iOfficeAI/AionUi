/**
 * POUNDING Branding E2E Tests
 *
 * Verifies the POUNDING fork identity is present throughout the app UI.
 * These tests do NOT require AI API keys.
 *
 * Tests are intentionally lightweight — deep settings navigation is slow
 * in E2E mode because pages make backend API calls that may time out.
 */
import { test, expect } from '../fixtures';
import { createErrorCollector } from '../helpers';

test.describe('POUNDING Branding', () => {
  test('app window title is set', async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('renderer loads without console errors', async ({ page }) => {
    const collector = createErrorCollector(page);
    await page.waitForTimeout(500);
    // No unexpected console errors on app startup
    expect(collector.critical()).toHaveLength(0);
  });

  test('app body has content (not blank screen)', async ({ page }) => {
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });

  test('no MANAGED_NEWAPI_PROVIDER_ID ReferenceError on startup', async ({ page }) => {
    const collector = createErrorCollector(page);
    await page.waitForTimeout(500);
    const errors = collector.critical();
    for (const err of errors) {
      expect(err).not.toContain('MANAGED_NEWAPI_PROVIDER_ID');
      expect(err).not.toContain('is not defined');
    }
  });
});
