/**
 * Assertion helpers for E2E tests.
 *
 * Small utilities that wrap common multi-step assertions so test files
 * remain concise and consistent.
 */
import type { Page } from '@playwright/test';
import { expect } from '../fixtures';

/**
 * Assert that the page body contains at least one of the given strings
 * (case-sensitive). Useful for i18n-agnostic checks.
 */
export async function expectBodyContainsAny(page: Page, candidates: string[], timeoutMs = 10_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const content = await page.locator('body').textContent();
        return candidates.some((candidate) => content?.includes(candidate));
      },
      {
        timeout: timeoutMs,
        message: `Expected body to contain one of: ${candidates.join(', ')}`,
      }
    )
    .toBeTruthy();
}

/**
 * Assert the current URL contains the given substring.
 */
export async function expectUrlContains(page: Page, substring: string): Promise<void> {
  const url = page.url();
  expect(url).toContain(substring);
}

/**
 * Collect console errors from the page, ignoring known benign ones.
 * Returns only "critical" errors.
 */
export function createErrorCollector(page: Page): { errors: string[]; critical: () => string[] } {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  const IGNORED_PATTERNS = ['ResizeObserver', 'net::ERR_'];
  return {
    errors,
    critical: () => errors.filter((e) => !IGNORED_PATTERNS.some((p) => e.includes(p))),
  };
}
