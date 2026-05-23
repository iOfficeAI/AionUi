/**
 * Navigation – route transitions and sidebar.
 *
 * Ensures the app can navigate between the guid/chat page and all
 * settings sub-pages without errors.
 */
import { test, expect } from '../fixtures';
import {
  goToGuid,
  goToSettings,
  hasSettingsTab,
  ROUTES,
  expectUrlContains,
  takeScreenshot,
  type SettingsTab,
} from '../helpers';

// ── Guid Page ────────────────────────────────────────────────────────────────

test.describe('Guid Page', () => {
  test('navigates to guid page', async ({ page }) => {
    await goToGuid(page);
    await expectUrlContains(page, 'guid');
  });

  test('chat input area is present', async ({ page }) => {
    await goToGuid(page);
    const textarea = page.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
  });

  test('can type in chat input', async ({ page }) => {
    await goToGuid(page);
    const input = page.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
    await input.click();
    await input.fill('E2E test message');
    const value = await input.inputValue().catch(() => input.textContent());
    expect(value).toContain('E2E test');
  });

  test('screenshot: guid page', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToGuid(page);
    await takeScreenshot(page, 'guid-page', { fullPage: true });
  });
});

// ── Settings Pages ───────────────────────────────────────────────────────────

test.describe('Settings Pages', () => {
  const baseTabs: { tab: SettingsTab; name: string }[] = [
    { tab: 'model', name: 'Model Settings' },
    { tab: 'agent', name: 'Agent/ACP Settings' },
    { tab: 'assistants', name: 'Assistants Settings' },
    { tab: 'capabilities', name: 'Capabilities Settings' },
    { tab: 'webui', name: 'WebUI Settings' },
    { tab: 'system', name: 'System Settings' },
    { tab: 'about', name: 'About Page' },
  ];

  const devOnlyTabs: { tab: SettingsTab; name: string }[] = [{ tab: 'display', name: 'Display Settings' }];

  for (const { tab, name } of [...baseTabs, ...devOnlyTabs]) {
    test(`${name} loads`, async ({ page }) => {
      if (tab === 'display') {
        const visible = await hasSettingsTab(page, tab);
        test.skip(!visible, 'display settings are hidden in the current runtime');
      }

      await goToSettings(page, tab);
      await expectUrlContains(page, tab);
      const body = await page.locator('body').textContent();
      expect(body!.length).toBeGreaterThan(10);
    });
  }

  test('screenshot: settings pages', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    const visibleTabs = [...baseTabs];
    for (const item of devOnlyTabs) {
      if (await hasSettingsTab(page, item.tab)) {
        visibleTabs.push(item);
      }
    }

    for (const { tab } of visibleTabs) {
      await goToSettings(page, tab);
      await takeScreenshot(page, `settings-${tab}`);
    }
  });
});

// ── Cross-page navigation ────────────────────────────────────────────────────

test.describe('Sidebar Navigation', () => {
  test('can navigate between pages via URL', async ({ page }) => {
    await goToGuid(page);
    expect(page.url()).toContain('guid');

    await goToSettings(page, 'about');
    expect(page.url()).toContain('about');

    await goToGuid(page);
    expect(page.url()).toContain('guid');
  });
});
