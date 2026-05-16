/**
 * Screenshot helpers for E2E tests.
 */
import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');

/**
 * Take a screenshot and save it under `tests/e2e/screenshots/<name>`.
 * `.png` is appended automatically when the caller omits it.
 */
export async function takeScreenshot(page: Page, name: string, opts?: { fullPage?: boolean }): Promise<void> {
  const fileName = name.endsWith('.png') ? name : `${name}.png`;
  const fullPath = path.join(SCREENSHOTS_DIR, fileName);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  await page.screenshot({
    path: fullPath,
    fullPage: opts?.fullPage ?? false,
  });
}
