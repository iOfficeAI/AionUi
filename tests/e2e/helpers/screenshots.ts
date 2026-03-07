/**
 * Screenshot helpers for E2E tests.
 */
import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');

/** Take a screenshot and save it under `tests/e2e/screenshots/<name>.png`. */
export async function takeScreenshot(page: Page, name: string, opts?: { fullPage?: boolean }): Promise<void> {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, `${name}.png`),
    fullPage: opts?.fullPage ?? false,
  });
}
