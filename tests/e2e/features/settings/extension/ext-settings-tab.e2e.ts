/**
 * Extension Settings Tab — iframe rendering, content verification, keep-alive.
 *
 * Supplements specs/ext-settings-tabs.e2e.ts (tab discovery, position anchoring,
 * basic navigation). This file focuses on:
 *   1. Page-route entry and hash verification
 *   2. Iframe renders meaningful content (not just existence)
 *   3. Tab switch round-trip: switch away then back, content survives
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { goToSettings, goToExtensionSettings, waitForSettle, settingsSiderItemById } from '../../../helpers';

const KNOWN_TAB_IDS = ['ext-e2e-full-extension-e2e-settings', 'ext-hello-world-hello-settings'] as const;

const IFRAME_SEL = 'iframe[title*="Extension settings"]';

async function countTabsPresent(page: Page): Promise<number[]> {
  return Promise.all(KNOWN_TAB_IDS.map((id) => page.locator(settingsSiderItemById(id)).count()));
}

async function waitForAnyExtTab(page: Page, timeout = 10_000): Promise<string | null> {
  try {
    await expect
      .poll(async () => (await countTabsPresent(page)).some((c) => c > 0), {
        timeout,
        message: 'Waiting for at least one extension settings tab',
      })
      .toBeTruthy();
  } catch {
    return null;
  }
  const counts = await countTabsPresent(page);
  const idx = counts.findIndex((c) => c > 0);
  return idx >= 0 ? KNOWN_TAB_IDS[idx] : null;
}

async function waitForIframeLoaded(page: Page, timeoutMs = 15_000): Promise<void> {
  const iframe = page.locator(IFRAME_SEL);
  await expect
    .poll(async () => Number(await iframe.first().evaluate((el) => getComputedStyle(el).opacity)), {
      timeout: timeoutMs,
    })
    .toBe(1);
}

test.describe('Extension: Page-Route Entry', () => {
  test('page route sets correct hash', async ({ page }) => {
    await goToSettings(page, 'gemini');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toContain(`/settings/ext/${tabId}`);
  });

  test('sider highlights the active extension tab', async ({ page }) => {
    await goToSettings(page, 'gemini');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const siderItem = page.locator(settingsSiderItemById(tabId!));
    await expect(siderItem).toBeVisible({ timeout: 5_000 });
    const cls = await siderItem.evaluate((el) => el.className);
    expect(cls).toMatch(/active|selected/i);
  });
});

test.describe('Extension: Iframe Content Rendering', () => {
  test('renders an iframe or webview with a valid src', async ({ page }) => {
    await goToSettings(page, 'gemini');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const iframe = page.locator(IFRAME_SEL);
    const webview = page.locator('webview');
    expect((await iframe.count()) > 0 || (await webview.count()) > 0).toBeTruthy();

    if ((await iframe.count()) > 0) {
      const src = await iframe.first().getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).toMatch(/^https?:\/\/|^file:/);
    }
  });

  test('iframe becomes fully visible after load', async ({ page }) => {
    await goToSettings(page, 'gemini');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    test.skip((await page.locator(IFRAME_SEL).count()) === 0, 'External webview tab');

    await waitForIframeLoaded(page);
  });

  test('iframe has sandbox attributes for local tabs', async ({ page }) => {
    await goToSettings(page, 'gemini');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const iframe = page.locator(IFRAME_SEL);
    test.skip((await iframe.count()) === 0, 'No iframe found');

    const sandbox = await iframe.first().getAttribute('sandbox');
    expect(sandbox).toContain('allow-scripts');
  });
});

test.describe('Extension: Tab Switch Round-Trip', () => {
  test('switch to builtin tab and back preserves extension content', async ({ page }) => {
    await goToSettings(page, 'gemini');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const iframe = page.locator(IFRAME_SEL);
    const hasIframe = (await iframe.count()) > 0;
    let initialSrc: string | null = null;
    if (hasIframe) {
      await waitForIframeLoaded(page);
      initialSrc = await iframe.first().getAttribute('src');
    }

    await goToSettings(page, 'system');
    await waitForSettle(page);
    expect(await page.evaluate(() => window.location.hash)).toContain('/settings/system');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    if (hasIframe) {
      const returned = page.locator(IFRAME_SEL);
      await expect(returned.first()).toBeVisible({ timeout: 10_000 });
      expect(await returned.first().getAttribute('src')).toBe(initialSrc);
    }
  });

  test('switch between two extension tabs loads each correctly', async ({ page }) => {
    await goToSettings(page, 'gemini');

    let ids: string[] = [];
    try {
      await expect
        .poll(
          async () => {
            const counts = await countTabsPresent(page);
            ids = KNOWN_TAB_IDS.filter((_, i) => counts[i] > 0);
            return ids.length;
          },
          { timeout: 10_000, message: 'Waiting for multiple extension tabs' }
        )
        .toBeGreaterThanOrEqual(2);
    } catch {
      /* not enough tabs in this environment */
    }

    test.skip(ids.length < 2, 'Need at least 2 extension tabs installed');

    await goToExtensionSettings(page, ids[0]);
    await waitForSettle(page);
    expect(await page.evaluate(() => window.location.hash)).toContain(`/settings/ext/${ids[0]}`);

    await goToExtensionSettings(page, ids[1]);
    await waitForSettle(page);
    expect(await page.evaluate(() => window.location.hash)).toContain(`/settings/ext/${ids[1]}`);
  });
});
