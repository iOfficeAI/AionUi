/**
 * Navigation helpers for E2E tests.
 *
 * Centralises route constants and provides typed navigation utilities
 * so individual test files stay DRY.
 */
import type { Page } from '@playwright/test';

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

/** Navigate to a hash route and wait for the page to settle. */
export async function navigateTo(page: Page, hash: string): Promise<void> {
  // Guard against stale page references
  if (page.isClosed()) {
    throw new Error('Cannot navigate: page is already closed. The page fixture should re-resolve the window.');
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

/**
 * Navigate to the channels tab inside the webui settings page.
 * Extracted from individual test files to eliminate duplication.
 */
export async function goToChannelsTab(page: Page): Promise<void> {
  await goToSettings(page, 'webui');

  const channelTab = page
    .locator('.arco-tabs-header-title')
    .filter({ hasText: /channel|频道|渠道/i })
    .first();

  try {
    await channelTab.waitFor({ state: 'visible', timeout: 15_000 });
    await channelTab.click();
    await page.waitForFunction(
      () => {
        const t = document.body.textContent || '';
        return t.includes('Telegram') || t.includes('Lark') || t.includes('DingTalk') || t.includes('Channel') || t.includes('频道');
      },
      { timeout: 10_000 }
    );
  } catch {
    // Best-effort: if channels tab not found, page may show channels directly
  }
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
