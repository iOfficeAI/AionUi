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
export async function navigateTo(page: Page, hash: string, waitMs = 2000): Promise<void> {
  // Guard against stale page references
  if (page.isClosed()) {
    throw new Error('Cannot navigate: page is already closed. The page fixture should re-resolve the window.');
  }
  await page.evaluate((h) => window.location.assign(h), hash);
  // Wait for DOM to settle before checking content
  await page.waitForTimeout(waitMs);
  // Ensure body has meaningful content (not just the shell)
  try {
    await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: 10_000 });
  } catch {
    // Best-effort: if content doesn't appear, continue with the test
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
