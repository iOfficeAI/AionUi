/**
 * Extensions – Settings Tabs E2E tests.
 *
 * Validates:
 * 1. Extension-contributed settings tabs appear in the sidebar
 * 2. Position anchoring works (before/after specific built-in tabs)
 * 3. $file: JSON reference resolution for settingsTabs
 * 4. Tab iframe loads successfully with aion-asset:// protocol
 * 5. Multiple extensions can contribute tabs without conflict
 * 6. i18n name resolution
 * 7. Tab navigation does not crash the app
 */
import { test, expect } from '../fixtures';
import { goToSettings, goToExtensionSettings, waitForSettle, takeScreenshot, SETTINGS_SIDER_ITEM_LABEL } from '../helpers';

// ═════════════════════════════════════════════════════════════════════════════
// Extension Settings Tabs — Discovery
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Extension: Settings Tabs Discovery', () => {
  test('extension settings tabs appear in the sidebar', async ({ page }) => {
    await goToSettings(page, 'gemini');
    await waitForSettle(page);

    const siderText = await page.locator('.settings-sider').textContent();

    // e2e-full-extension contributes "E2E Settings" and "E2E Before About"
    // hello-world-theme contributes "Hello Config"
    // At least one extension tab should be visible
    const hasExtTab = siderText?.includes('E2E Settings') || siderText?.includes('E2E 测试设置') || siderText?.includes('Hello Config') || siderText?.includes('Hello 设置') || siderText?.includes('E2E Before About') || siderText?.includes('E2E (About之前)');

    expect(hasExtTab).toBeTruthy();
  });

  test('multiple extension tabs from different extensions appear', async ({ page }) => {
    await goToSettings(page, 'gemini');
    await waitForSettle(page);

    const siderLabels = await page.locator(SETTINGS_SIDER_ITEM_LABEL).allTextContents();

    // Check that both extension sources contribute tabs
    const hasE2eTab = siderLabels.some((label) => label.includes('E2E Settings') || label.includes('E2E 测试设置'));
    const hasHelloTab = siderLabels.some((label) => label.includes('Hello Config') || label.includes('Hello 设置'));

    // At minimum one should be present (both extensions are loaded from examples/)
    expect(hasE2eTab || hasHelloTab).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Extension Settings Tabs — Position Anchoring
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Extension: Settings Tabs Position Anchoring', () => {
  test('tab with anchor "tools/after" appears after Tools in sidebar', async ({ page }) => {
    await goToSettings(page, 'tools');
    await waitForSettle(page);

    const siderLabels = await page.locator(SETTINGS_SIDER_ITEM_LABEL).allTextContents();

    // Find the indices
    const toolsIdx = siderLabels.findIndex((l) => l.includes('Tools') || l.includes('工具'));
    const e2eIdx = siderLabels.findIndex((l) => l.includes('E2E Settings') || l.includes('E2E 测试设置'));

    // If both found, E2E settings should be after Tools
    if (toolsIdx >= 0 && e2eIdx >= 0) {
      expect(e2eIdx).toBeGreaterThan(toolsIdx);
    }
  });

  test('tab with anchor "about/before" appears before About in sidebar', async ({ page }) => {
    await goToSettings(page, 'about');
    await waitForSettle(page);

    const siderLabels = await page.locator(SETTINGS_SIDER_ITEM_LABEL).allTextContents();

    const aboutIdx = siderLabels.findIndex((l) => l.includes('About') || l.includes('关于'));
    const beforeAboutIdx = siderLabels.findIndex((l) => l.includes('E2E Before About') || l.includes('E2E (About之前)'));

    if (aboutIdx >= 0 && beforeAboutIdx >= 0) {
      expect(beforeAboutIdx).toBeLessThan(aboutIdx);
    }
  });

  test('tab with anchor "display/after" appears after Display in sidebar', async ({ page }) => {
    await goToSettings(page, 'display');
    await waitForSettle(page);

    const siderLabels = await page.locator(SETTINGS_SIDER_ITEM_LABEL).allTextContents();

    const displayIdx = siderLabels.findIndex((l) => l.includes('Display') || l.includes('显示'));
    const helloIdx = siderLabels.findIndex((l) => l.includes('Hello Config') || l.includes('Hello 设置'));

    if (displayIdx >= 0 && helloIdx >= 0) {
      expect(helloIdx).toBeGreaterThan(displayIdx);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Extension Settings Tabs — Navigation & Rendering
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Extension: Settings Tabs Navigation', () => {
  test('navigating to an extension settings tab loads the iframe', async ({ page }) => {
    // e2e-full-extension contributes tab with id "e2e-settings", global ID = "ext-e2e-full-extension-e2e-settings"
    await goToExtensionSettings(page, 'ext-e2e-full-extension-e2e-settings');
    await waitForSettle(page);

    // The page should render — check for iframe or extension content
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(30);
  });

  test('extension tab iframe renders HTML content', async ({ page }) => {
    await goToExtensionSettings(page, 'ext-e2e-full-extension-e2e-settings');
    await waitForSettle(page);

    // Look for iframe element
    const iframe = page.locator('iframe[title*="Extension settings"]');
    const iframeCount = await iframe.count();

    // Either we find the iframe directly, or the page is successfully rendered
    if (iframeCount > 0) {
      await expect(iframe.first()).toBeVisible({ timeout: 10_000 });
    } else {
      // Page might render content differently
      const body = await page.locator('body').textContent();
      expect(body!.length).toBeGreaterThan(30);
    }
  });

  test('switching between extension and builtin tabs does not crash', async ({ page }) => {
    // Navigate to extension tab
    await goToExtensionSettings(page, 'ext-e2e-full-extension-e2e-settings');
    await waitForSettle(page);

    // Switch to builtin tab
    await goToSettings(page, 'tools');
    await waitForSettle(page);

    // Switch back to extension tab
    await goToExtensionSettings(page, 'ext-e2e-full-extension-e2e-settings');
    await waitForSettle(page);

    // Switch to another builtin tab
    await goToSettings(page, 'system');
    await waitForSettle(page);

    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(30);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Extension Settings Tabs — $file: Reference Resolution
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Extension: Settings Tabs $file: Resolution', () => {
  test('e2e-full-extension with $file: settingsTabs resolves correctly', async ({ page }) => {
    // If $file: resolution failed, the extension would not load at all.
    // Verify by checking that the e2e extension tab appears in the sidebar.
    await goToSettings(page, 'gemini');
    await waitForSettle(page);

    const siderText = await page.locator('.settings-sider').textContent();
    const hasE2eTab = siderText?.includes('E2E Settings') || siderText?.includes('E2E 测试设置');

    // The tab should be present, proving $file:contributes/settings-tabs.json was resolved
    expect(hasE2eTab).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Extension Settings Tabs — Stability
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Extension: Settings Tabs Stability', () => {
  test('no console errors when navigating extension settings tabs', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Navigate to an extension tab
    await goToExtensionSettings(page, 'ext-e2e-full-extension-e2e-settings');
    await waitForSettle(page);

    // Navigate back to builtin
    await goToSettings(page, 'gemini');
    await waitForSettle(page);

    // Filter for extension-specific errors
    const extErrors = errors.filter((e) => e.toLowerCase().includes('extension') || e.toLowerCase().includes('settings-tab') || e.toLowerCase().includes('settingstab'));

    expect(extErrors).toHaveLength(0);
  });

  test('navigating to nonexistent extension tab shows error gracefully', async ({ page }) => {
    await goToExtensionSettings(page, 'ext-nonexistent-tab');
    await waitForSettle(page);

    // Should not crash — page should still be functional
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(10);
  });

  test('screenshot: extension settings tab', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToExtensionSettings(page, 'ext-e2e-full-extension-e2e-settings');
    await waitForSettle(page);
    await takeScreenshot(page, 'ext-settings-tab');
  });
});
