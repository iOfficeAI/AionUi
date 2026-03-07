/**
 * Navigation helpers for E2E tests.
 *
 * Centralises route constants and provides typed navigation utilities
 * so individual test files stay DRY.
 */
import type { Page } from '@playwright/test';
import { channelItemById, webuiTabByKey } from './selectors';

// ── Route constants ──────────────────────────────────────────────────────────

export const ROUTES = {
  guid: '#/guid',
  settings: {
    gemini: '#/settings/gemini',
    model: '#/settings/model',
    agent: '#/settings/agent',
    tools: '#/settings/tools',
    display: '#/settings/display',
    webui: '#/settings/webui',
    system: '#/settings/system',
    about: '#/settings/about',
  },
  /** Dynamic extension settings tab route */
  extensionSettings: (tabId: string) => `#/settings/ext/${tabId}`,
} as const;

export type SettingsTab = keyof typeof ROUTES.settings;

// ── Navigation helpers ───────────────────────────────────────────────────────

/**
 * Check if the page is already at the target hash route.
 * Avoids redundant navigation + re-render when consecutive tests
 * in the same describe block navigate to the same page.
 */
function isAlreadyAt(page: Page, hash: string): boolean {
  try {
    const url = page.url();
    // Compare the hash portion (e.g. "#/guid" or "#/settings/agent")
    const currentHash = url.includes('#') ? '#' + url.split('#')[1] : '';
    return currentHash === hash;
  } catch {
    return false;
  }
}

/** Navigate to a hash route and wait for the page to settle. */
export async function navigateTo(page: Page, hash: string): Promise<void> {
  // Guard against stale page references
  if (page.isClosed()) {
    throw new Error('Cannot navigate: page is already closed. The page fixture should re-resolve the window.');
  }

  // Skip navigation if already on the target route (big speed win)
  if (isAlreadyAt(page, hash)) {
    return;
  }

  await page.evaluate((h) => window.location.assign(h), hash);
  // Give React a tick to begin re-rendering after hash change
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Wait for body to have meaningful content (event-driven, no fixed sleep)
  try {
    await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: 10_000 });
  } catch {
    // Best-effort: if content doesn't appear, continue with the test
  }
}

/**
 * Wait for the page to settle using event-driven detection.
 * If the condition is not met within timeout, simply continues (best-effort).
 */
export async function waitForSettle(page: Page, timeoutMs = 3000): Promise<void> {
  try {
    await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: timeoutMs });
  } catch {
    // Best-effort: page may not have enough content yet, continue without fixed sleep
  }
}

/** Navigate to the guid / chat page. */
export async function goToGuid(page: Page): Promise<void> {
  await navigateTo(page, ROUTES.guid);
}

/** Navigate to a settings tab. */
export async function goToSettings(page: Page, tab: SettingsTab): Promise<void> {
  await navigateTo(page, ROUTES.settings[tab]);
}

/** Navigate to an extension-contributed settings tab by its ID. */
export async function goToExtensionSettings(page: Page, tabId: string): Promise<void> {
  await navigateTo(page, ROUTES.extensionSettings(tabId));
}

/** Track whether we have already navigated to the channels tab in this session. */
let _onChannelsTab = false;

/**
 * Navigate to the channels tab inside the webui settings page.
 * Extracted from individual test files to eliminate duplication.
 * Uses a session-level flag to skip re-navigation when already on the tab.
 */
export async function goToChannelsTab(page: Page): Promise<void> {
  // Quick check: if we're already on the channels tab, verify a channel item is still visible
  if (_onChannelsTab && isAlreadyAt(page, ROUTES.settings.webui)) {
    const channelItem = page.locator(`${channelItemById('telegram')}, ${channelItemById('lark')}, ${channelItemById('dingtalk')}`).first();
    const stillVisible = await channelItem.isVisible().catch(() => false);
    if (stillVisible) return;
  }

  await goToSettings(page, 'webui');

  const stableTab = page.locator(webuiTabByKey('channels')).first();

  try {
    await stableTab.waitFor({ state: 'visible', timeout: 8_000 });
    await stableTab.click();
  } catch {
    // Backward-compatible fallback for old UI builds without data attributes
    const fallbackTab = page
      .locator('.arco-tabs-header-title')
      .filter({ hasText: /channel|频道|渠道/i })
      .first();
    await fallbackTab.waitFor({ state: 'visible', timeout: 8_000 });
    await fallbackTab.click();
  }

  try {
    await page
      .locator(`${channelItemById('telegram')}, ${channelItemById('lark')}, ${channelItemById('dingtalk')}`)
      .first()
      .waitFor({ state: 'visible', timeout: 8_000 });
    _onChannelsTab = true;
  } catch {
    // Best-effort fallback for transitional states
    await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: 5_000 });
    _onChannelsTab = true;
  }
}

/** Reset the channels-tab navigation cache (call when navigating away). */
export function resetChannelsTabCache(): void {
  _onChannelsTab = false;
}

/**
 * Wait for a MutationObserver-based class change on an element.
 * Extracted from repeated inline usage across test files.
 */
export async function waitForClassChange(element: import('@playwright/test').Locator, timeoutMs = 1500): Promise<void> {
  await element.evaluate(
    (el, ms) =>
      new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          resolve();
        });
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, ms);
      }),
    timeoutMs
  );
}
