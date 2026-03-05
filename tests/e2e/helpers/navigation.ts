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
 * Wait for a condition instead of using a fixed timeout.
 * Falls back to a short 300ms sleep if the condition is not met within timeout.
 */
export async function waitForSettle(page: Page, timeoutMs = 3000): Promise<void> {
  try {
    await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: timeoutMs });
  } catch {
    // Best-effort fallback
    await page.waitForTimeout(300);
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
