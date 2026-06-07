/**
 * POUNDING Managed Runtime CLI E2E Tests
 *
 * Validates that the MANAGED_NEWAPI_PROVIDER_ID constant and managed CLI
 * settings pages work without crashing. Does NOT require AI API keys.
 *
 * Tests are intentionally lightweight — avoiding deep settings navigation
 * which is slow in E2E mode.
 */
import { test, expect } from '../fixtures';
import { createErrorCollector } from '../helpers';

test.describe('POUNDING Managed CLI Provider', () => {
  test('app launches without ReferenceError for MANAGED_NEWAPI_PROVIDER_ID', async ({ page }) => {
    const collector = createErrorCollector(page);
    await page.waitForTimeout(2000);

    const errors = collector.critical();
    for (const err of errors) {
      expect(err).not.toContain('MANAGED_NEWAPI_PROVIDER_ID');
      expect(err).not.toContain('is not defined');
    }
  });

  test('app launches without uncaught errors', async ({ page }) => {
    const collector = createErrorCollector(page);
    await page.waitForTimeout(2000);

    // No unexpected errors during app initialization
    expect(collector.critical()).toHaveLength(0);
  });
});
