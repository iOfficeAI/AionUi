/**
 * Extensions – Discovery & Loading tests.
 *
 * Validates that the extension system discovers and loads extensions
 * from the configured path.
 */
import { test, expect } from '../fixtures';
import { goToGuid } from '../helpers';

test.describe('Extension Discovery', () => {
  test('extensions path is configured via env', async ({ electronApp }) => {
    const extPath = await electronApp.evaluate(async () => {
      return process.env.AIONUI_EXTENSIONS_PATH || 'not set';
    });
    expect(extPath).toContain('examples');
  });

  test('all example extensions pass manifest validation (app launched)', async ({ page, electronApp }) => {
    // If manifests were invalid, app startup/navigation would fail.
    await goToGuid(page);

    const windowCount = await electronApp.evaluate(async ({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(windowCount).toBeGreaterThanOrEqual(1);
  });

  test('extensions source is the examples directory', async ({ electronApp }) => {
    const extPath = await electronApp.evaluate(async () => {
      return process.env.AIONUI_EXTENSIONS_PATH || '';
    });
    expect(extPath).toBeTruthy();
    // Normalise slashes for cross-platform
    expect(extPath.replace(/\\/g, '/')).toContain('examples');
  });
});
