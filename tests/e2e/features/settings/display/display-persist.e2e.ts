/**
 * Display Settings Persistence E2E Tests
 *
 * Verifies that display settings survive a page reload — i.e. they are
 * persisted to the store, not just held in component state.
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

async function reloadAndGoToDisplay(page: import('@playwright/test').Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: 15_000 });
  await goToSettings(page, 'display');
  await waitForSettle(page);
}

test.describe('Display settings persistence across reload', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'display');
    await waitForSettle(page);
  });

  test('theme persists after reload', async ({ page }) => {
    const themeGroup = page.locator('[role="radiogroup"]');
    await themeGroup.waitFor({ state: 'visible', timeout: 10_000 });

    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(initialTheme).toBeTruthy();

    const targetTheme = initialTheme === 'light' ? 'dark' : 'light';
    const targetButton = themeGroup.locator('[role="radio"][aria-checked="false"]');
    await targetButton.click();

    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      targetTheme,
      { timeout: 5_000 }
    );

    await reloadAndGoToDisplay(page);

    const afterReload = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(afterReload).toBe(targetTheme);

    // Restore original theme
    const revertGroup = page.locator('[role="radiogroup"]');
    await revertGroup.waitFor({ state: 'visible', timeout: 10_000 });
    const revertButton = revertGroup.locator('[role="radio"][aria-checked="false"]');
    await revertButton.click();
    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      initialTheme,
      { timeout: 5_000 }
    );
  });

  test('zoom scale persists after reload', async ({ page }) => {
    const label = percentLabel(page);
    await expect(label).toBeVisible({ timeout: 5_000 });

    const baseline = await currentPercent(page);

    const plus = plusButton(page);
    if (await plus.isDisabled()) {
      test.skip(true, 'zoom already at max — cannot increase');
      return;
    }
    await plus.click();
    await waitForSettle(page, 1_000);

    const afterClick = await currentPercent(page);
    expect(afterClick).toBeGreaterThan(baseline);

    await reloadAndGoToDisplay(page);

    const afterReload = await currentPercent(page);
    expect(afterReload).toBe(afterClick);

    // Restore via reset button
    const reset = resetButton(page);
    await expect(reset).toBeVisible({ timeout: 5_000 });
    if (await reset.isEnabled()) {
      await reset.click();
      await waitForSettle(page, 1_000);
    }
  });

  test('CSS theme selection persists after reload', async ({ page }) => {
    const cards = page.locator('.grid > div.cursor-pointer');
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });

    const cardCount = await cards.count();
    if (cardCount < 2) {
      test.skip(true, 'fewer than 2 CSS theme presets — cannot switch');
      return;
    }

    // Find current active card index
    let activeIndex = -1;
    for (let i = 0; i < cardCount; i++) {
      const cls = await cards.nth(i).getAttribute('class');
      if (cls?.includes('border-[var(--color-primary)]')) {
        activeIndex = i;
        break;
      }
    }

    const targetIndex = activeIndex <= 0 ? 1 : 0;
    const targetCard = cards.nth(targetIndex);
    await targetCard.click();

    await page.locator('.arco-message-success').first().waitFor({ state: 'visible', timeout: 5_000 });

    // Confirm selection took effect before reload
    await page.waitForFunction(
      (idx) => {
        const card = document.querySelectorAll('.grid > div.cursor-pointer')[idx];
        return card?.className.includes('border-[var(--color-primary)]');
      },
      targetIndex,
      { timeout: 5_000 }
    );

    await reloadAndGoToDisplay(page);

    // Verify the same card is still active after reload
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });
    const afterReloadCls = await cards.nth(targetIndex).getAttribute('class');
    expect(afterReloadCls).toContain('border-[var(--color-primary)]');

    // Restore original active theme
    if (activeIndex >= 0) {
      await cards.nth(activeIndex).click();
      await page
        .locator('.arco-message-success')
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {});
    }
  });
});
