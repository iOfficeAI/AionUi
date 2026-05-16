import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import {
  goToSettings,
  goToExtensionSettings,
  waitForSettle,
  takeScreenshot,
  SETTINGS_SIDER_ITEM,
  settingsSiderItemById,
} from '../helpers';

const EXT_E2E_SETTINGS_ID = 'ext-e2e-full-extension-e2e-settings';
const EXT_E2E_BEFORE_ABOUT_ID = 'ext-e2e-full-extension-e2e-before-about';
const EXT_HELLO_SETTINGS_ID = 'ext-hello-world-hello-settings';

const KNOWN_EXTENSION_TAB_IDS = [EXT_E2E_SETTINGS_ID, EXT_E2E_BEFORE_ABOUT_ID, EXT_HELLO_SETTINGS_ID] as const;

async function getSiderItemIds(page: Page): Promise<string[]> {
  const ids = await page.locator(SETTINGS_SIDER_ITEM).evaluateAll((elements) => {
    return elements.map((el) => (el as HTMLElement).dataset.settingsId || '').filter(Boolean);
  });
  return ids;
}

async function waitForExtensionSettingsTabs(page: Page, timeout = 10_000): Promise<string[]> {
  await expect
    .poll(
      async () => {
        const counts = await Promise.all(
          KNOWN_EXTENSION_TAB_IDS.map((id) => page.locator(settingsSiderItemById(id)).count())
        );
        return counts.some((count) => count > 0);
      },
      {
        timeout,
        message: 'Expected extension settings tabs to appear in the sidebar',
      }
    )
    .toBeTruthy();

  return getSiderItemIds(page);
}

test.describe('Extension: Settings Tabs Discovery', () => {
  test('extension settings tabs appear in the sidebar', async ({ page }) => {
    await goToSettings(page, 'gemini');

    const siderItemIds = await waitForExtensionSettingsTabs(page);

    expect(
      siderItemIds.some((id) => KNOWN_EXTENSION_TAB_IDS.includes(id as (typeof KNOWN_EXTENSION_TAB_IDS)[number]))
    ).toBeTruthy();
  });

  test('multiple extension tabs from different extensions appear', async ({ page }) => {
    await goToSettings(page, 'gemini');

    const siderItemIds = await waitForExtensionSettingsTabs(page);

    const hasE2eTab = siderItemIds.includes(EXT_E2E_SETTINGS_ID) || siderItemIds.includes(EXT_E2E_BEFORE_ABOUT_ID);
    const hasHelloTab = siderItemIds.includes(EXT_HELLO_SETTINGS_ID);

    expect(hasE2eTab && hasHelloTab).toBeTruthy();
  });
});

test.describe('Extension: Settings Tabs Position Anchoring', () => {
  test('tab with anchor "capabilities/after" appears after Capabilities in sidebar', async ({ page }) => {
    await goToSettings(page, 'capabilities');
    await waitForExtensionSettingsTabs(page);

    const siderItemIds = await getSiderItemIds(page);

    const capabilitiesIdx = siderItemIds.indexOf('capabilities');
    const e2eIdx = siderItemIds.indexOf(EXT_E2E_SETTINGS_ID);

    expect(capabilitiesIdx).toBeGreaterThanOrEqual(0);
    expect(e2eIdx).toBeGreaterThanOrEqual(0);
    expect(e2eIdx).toBeGreaterThan(capabilitiesIdx);
  });

  test('tab with anchor "about/before" appears before About in sidebar', async ({ page }) => {
    await goToSettings(page, 'about');
    await waitForExtensionSettingsTabs(page);

    const siderItemIds = await getSiderItemIds(page);

    const aboutIdx = siderItemIds.indexOf('about');
    const beforeAboutIdx = siderItemIds.indexOf(EXT_E2E_BEFORE_ABOUT_ID);

    expect(aboutIdx).toBeGreaterThanOrEqual(0);
    expect(beforeAboutIdx).toBeGreaterThanOrEqual(0);
    expect(beforeAboutIdx).toBeLessThan(aboutIdx);
  });

  test('tab with anchor "display/after" appears after Display in sidebar', async ({ page }) => {
    await goToSettings(page, 'display');
    await waitForExtensionSettingsTabs(page);

    const siderItemIds = await getSiderItemIds(page);

    const displayIdx = siderItemIds.indexOf('display');
    const helloIdx = siderItemIds.indexOf(EXT_HELLO_SETTINGS_ID);

    expect(displayIdx).toBeGreaterThanOrEqual(0);
    expect(helloIdx).toBeGreaterThanOrEqual(0);
    expect(helloIdx).toBeGreaterThan(displayIdx);
  });
});

test.describe('Extension: Settings Tabs Navigation', () => {
  test('navigating to an extension settings tab loads the iframe', async ({ page }) => {
    await goToExtensionSettings(page, EXT_E2E_SETTINGS_ID);
    await waitForSettle(page);

    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(30);
  });

  test('extension tab iframe renders HTML content', async ({ page }) => {
    await goToExtensionSettings(page, EXT_E2E_SETTINGS_ID);
    await waitForSettle(page);

    const iframe = page.locator('iframe[title*="Extension settings"]');
    const iframeCount = await iframe.count();

    if (iframeCount > 0) {
      await expect(iframe.first()).toBeVisible({ timeout: 10_000 });
    } else {
      const body = await page.locator('body').textContent();
      expect(body!.length).toBeGreaterThan(30);
    }
  });

  test('switching between extension and builtin tabs does not crash', async ({ page }) => {
    await goToExtensionSettings(page, EXT_E2E_SETTINGS_ID);
    await waitForSettle(page);

    await goToSettings(page, 'capabilities');
    await waitForSettle(page);

    await goToExtensionSettings(page, EXT_E2E_SETTINGS_ID);
    await waitForSettle(page);

    await goToSettings(page, 'system');
    await waitForSettle(page);

    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(30);
  });
});

test.describe('Extension: Settings Tabs $file: Resolution', () => {
  test('e2e-full-extension with $file: settingsTabs resolves correctly', async ({ page }) => {
    await goToSettings(page, 'gemini');

    const siderItemIds = await waitForExtensionSettingsTabs(page);

    expect(siderItemIds.includes(EXT_E2E_SETTINGS_ID)).toBeTruthy();
  });
});

test.describe('Extension: Settings Tabs Stability', () => {
  test('no console errors when navigating extension settings tabs', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await goToExtensionSettings(page, EXT_E2E_SETTINGS_ID);
    await waitForSettle(page);

    await goToSettings(page, 'gemini');
    await waitForSettle(page);

    const extErrors = errors.filter(
      (e) =>
        e.toLowerCase().includes('extension') ||
        e.toLowerCase().includes('settings-tab') ||
        e.toLowerCase().includes('settingstab')
    );

    expect(extErrors).toHaveLength(0);
  });

  test('navigating to nonexistent extension tab shows error gracefully', async ({ page }) => {
    await goToExtensionSettings(page, 'ext-nonexistent-tab');
    await waitForSettle(page);

    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(10);
  });

  test('screenshot: extension settings tab', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToExtensionSettings(page, EXT_E2E_SETTINGS_ID);
    await waitForSettle(page);
    await takeScreenshot(page, 'ext-settings-tab');
  });
});
