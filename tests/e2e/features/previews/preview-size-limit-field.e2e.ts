/**
 * The preview size limit field accepts a decimal.
 *
 * This exists because the field looked like it worked and did not. Arco's
 * `InputNumber` skips its internal "user is typing" state whenever a `value` prop is
 * present, then re-renders the *parsed number* instead of the characters entered. `1.`
 * is not a number, so the dot vanished on the keystroke that produced it and `1.5`
 * arrived as `15` — a limit fifteen times what the user asked for, with no error.
 *
 * Typed one character at a time on purpose. `fill()` sets the value in one shot and
 * passed even while the bug was live, so a test written that way would have certified
 * the broken build.
 */
import { expect, test } from '../../fixtures';
import { goToGuid } from '../../helpers';

/** The field lives under settings → system, which is not the landing section. */
async function openSystemSettings(page: import('@playwright/test').Page) {
  await goToGuid(page);
  await page.evaluate(() => window.location.assign('#/settings'));
  // 'System' / 「系统」 — both spellings, so the file does not silently test one locale.
  await page
    .getByText(/^(系统|System)$/)
    .first()
    .click();
  await expect(page.getByText(/预览大小上限|Preview Size Limit/i).first()).toBeVisible({ timeout: 20_000 });
  // The section has three numeric fields; this one is last.
  return page.locator('.arco-input-number input').last();
}

async function commit(page: import('@playwright/test').Page) {
  // The value is normalized and persisted on blur, not per keystroke.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(500);
}

test.describe('Settings — preview size limit', () => {
  test('typing a decimal keeps the decimal', async ({ page }) => {
    test.setTimeout(120_000);
    const input = await openSystemSettings(page);

    await input.click();
    await input.fill('');
    for (const key of ['1', 'Period', '5']) {
      await page.keyboard.press(key);
    }

    // The dot has to still be there *before* blur: this is the state the bug destroyed.
    await expect(input).toHaveValue('1.5');
    await commit(page);
    await expect(input).toHaveValue('1.5');
  });

  test('values outside the accepted range are pulled back into it', async ({ page }) => {
    test.setTimeout(120_000);
    const input = await openSystemSettings(page);

    // Below the minimum, including a fraction below it — a limit of 0 would gate off
    // every file through a field that never says so.
    for (const tooSmall of ['0', '-5', '0.2']) {
      await input.click();
      await input.fill(tooSmall);
      await commit(page);
      await expect(input).toHaveValue('1');
    }

    await input.click();
    await input.fill('999');
    await commit(page);
    await expect(input).toHaveValue('100');

    // An emptied field means "unset" and must fall back to the default, not to 0.
    await input.click();
    await input.fill('');
    await commit(page);
    await expect(input).toHaveValue('1');
  });
});
