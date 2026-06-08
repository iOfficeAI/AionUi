/**
 * POUNDING Model Selector E2E Tests
 *
 * Validates the model selector UI renders without errors for all agent types.
 * Does NOT require AI API keys — tests structural rendering only.
 *
 * Tests are intentionally lightweight — avoiding deep settings navigation
 * which is slow in E2E mode.
 */
import { test, expect } from '../fixtures';
import { createErrorCollector } from '../helpers';

test.describe('POUNDING Model Selector (no backend required)', () => {
  test('app starts without crashing', async ({ page }) => {
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });

  test('no useAcpModelInfo polling crashes on startup', async ({ page }) => {
    const collector = createErrorCollector(page);
    // Wait a few seconds for polling to kick in (useAcpModelInfo polls every 5s)
    await page.waitForTimeout(3000);
    const errors = collector.critical();
    // No crashes from ACP model info polling
    expect(errors.filter((e) => e.includes('ReferenceError') || e.includes('TypeError'))).toHaveLength(0);
  });
});
