/**
 * Zoom / font-scale E2E tests.
 *
 * Covers the FontSizeControl widget on the Display settings page:
 *   - Increase via "+" button
 *   - Decrease via "-" button
 *   - Reset via "Reset zoom" button
 *   - Percentage label reflects current value
 */
import { test, expect } from '../../../fixtures';
import { goToSettings, waitForSettle } from '../../../helpers';

const PERCENT_RE = /^\d{2,3}%$/;

function fontSizeControlLocator(page: import('@playwright/test').Page) {
  return page.locator('.font-scale-slider').locator('..');
}

function percentLabel(page: import('@playwright/test').Page) {
  return fontSizeControlLocator(page).locator('..').locator('span').filter({ hasText: PERCENT_RE });
}

function plusButton(page: import('@playwright/test').Page) {
  return fontSizeControlLocator(page).locator('button:has-text("+")');
}

function minusButton(page: import('@playwright/test').Page) {
  return fontSizeControlLocator(page).locator('button:has-text("-")');
}

function resetButton(page: import('@playwright/test').Page) {
  return fontSizeControlLocator(page)
    .locator('..')
    .locator('..')
    .locator('button')
    .filter({ hasNotText: /^[+-]$/ })
    .last();
}

async function currentPercent(page: import('@playwright/test').Page): Promise<number> {
  const text = await percentLabel(page).textContent();
  return parseInt(text!.replace('%', ''), 10);
}

test.describe('Zoom scale (FontSizeControl)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'display');
    await waitForSettle(page);
  });

  test('percentage label is visible and shows a valid value', async ({ page }) => {
    const label = percentLabel(page);
    await expect(label).toBeVisible({ timeout: 5_000 });
    const text = await label.textContent();
    expect(text).toMatch(PERCENT_RE);
  });

  test('clicking + increases the percentage', async ({ page }) => {
    const btn = plusButton(page);
    await expect(btn).toBeVisible({ timeout: 5_000 });

    if (await btn.isDisabled()) {
      // Already at max — click minus first to make room
      await minusButton(page).click();
      await waitForSettle(page, 1_000);
    }

    const baseline = await currentPercent(page);
    await plusButton(page).click();
    await waitForSettle(page, 1_000);
    const after = await currentPercent(page);
    expect(after).toBeGreaterThan(baseline);
  });

  test('clicking - decreases the percentage', async ({ page }) => {
    const btn = minusButton(page);
    await expect(btn).toBeVisible({ timeout: 5_000 });

    if (await btn.isDisabled()) {
      // Already at min — click plus first to make room
      await plusButton(page).click();
      await waitForSettle(page, 1_000);
    }

    const baseline = await currentPercent(page);
    await minusButton(page).click();
    await waitForSettle(page, 1_000);
    const after = await currentPercent(page);
    expect(after).toBeLessThan(baseline);
  });

  test('clicking reset returns to 100%', async ({ page }) => {
    const pct = await currentPercent(page);
    const plus = plusButton(page);

    // Move away from 100% so reset has something to do
    if (pct === 100) {
      await plus.click();
      await waitForSettle(page, 1_000);
      const moved = await currentPercent(page);
      expect(moved).not.toBe(100);
    }

    const reset = resetButton(page);
    await expect(reset).toBeVisible({ timeout: 5_000 });
    await expect(reset).toBeEnabled({ timeout: 2_000 });
    await reset.click();
    await waitForSettle(page, 1_000);

    const final = await currentPercent(page);
    expect(final).toBe(100);
  });

  test('+ button is disabled at maximum scale', async ({ page }) => {
    const plus = plusButton(page);
    for (let i = 0; i < 11; i++) {
      if (await plus.isDisabled()) break;
      await plus.click();
      await waitForSettle(page, 500);
    }

    await expect(plus).toBeDisabled();
    const pct = await currentPercent(page);
    expect(pct).toBe(130);
  });

  test('- button is disabled at minimum scale', async ({ page }) => {
    const minus = minusButton(page);
    for (let i = 0; i < 11; i++) {
      if (await minus.isDisabled()) break;
      await minus.click();
      await waitForSettle(page, 500);
    }

    await expect(minus).toBeDisabled();
    const pct = await currentPercent(page);
    expect(pct).toBe(80);

    // Restore default so subsequent tests are not affected
    await resetButton(page).click();
    await waitForSettle(page, 1_000);
  });

  test('clicking the slider track changes the percentage', async ({ page }) => {
    // Reset to 100% first for a known baseline
    const reset = resetButton(page);
    if (await reset.isEnabled()) {
      await reset.click();
      await waitForSettle(page, 1_000);
    }
    const baseline = await currentPercent(page);
    expect(baseline).toBe(100);

    const slider = fontSizeControlLocator(page);
    await expect(slider).toBeVisible({ timeout: 5_000 });
    const box = await slider.boundingBox();
    expect(box).not.toBeNull();

    // Click at ~80% of the track width to increase the value
    const targetX = box!.x + box!.width * 0.8;
    const targetY = box!.y + box!.height / 2;
    await page.mouse.click(targetX, targetY);
    await waitForSettle(page, 1_000);

    const after = await currentPercent(page);
    expect(after).toBeGreaterThan(baseline);

    // Restore default
    await resetButton(page).click();
    await waitForSettle(page, 1_000);
  });
});
