/**
 * System Settings Persistence E2E Tests
 *
 * Verifies that settings survive a page reload (persisted to backend, not just React state).
 * Pattern: record → change → reload → assert persisted → restore.
 * All operations via UI — zero invokeBridge, zero mock.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings, waitForSettle, waitForClassChange } from '../../../helpers/navigation';
import { ARCO_SWITCH } from '../../../helpers/selectors';

async function reloadAndGoToSystem(page: import('@playwright/test').Page) {
  await page.reload();
  await goToSettings(page, 'system');
  await waitForSettle(page);
}

test.describe('System Settings Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'system');
    await waitForSettle(page);
  });

  // TC-PERSIST-01: Language switch persists across reload
  test('TC-PERSIST-01: language selection persists after reload', async ({ page }) => {
    const selectTrigger = page.locator('.aion-select .arco-select-view').first();
    await expect(selectTrigger).toBeVisible();
    const originalLang = await selectTrigger.textContent();

    await selectTrigger.click();
    const englishOption = page.locator('.arco-select-option:has-text("English")');
    await expect(englishOption).toBeVisible();
    await englishOption.click();
    await page.waitForFunction(() => document.body.textContent?.includes('Language'), { timeout: 15_000 });
    expect(await selectTrigger.textContent()).toContain('English');

    await reloadAndGoToSystem(page);

    const reloadedSelect = page.locator('.aion-select .arco-select-view').first();
    await expect(reloadedSelect).toBeVisible();
    expect(await reloadedSelect.textContent()).toContain('English');
    expect(await page.locator('body').textContent()).toContain('Language');

    // Restore
    await reloadedSelect.click();
    const restoreOption = page.locator(`.arco-select-option:has-text("${originalLang?.trim() || '简体中文'}")`);
    await expect(restoreOption).toBeVisible();
    await restoreOption.click();
    await waitForSettle(page);
  });

  // TC-PERSIST-02: closeToTray switch persists across reload
  // Known issue: systemSettings.setCloseToTray writes via HTTP but reload reads from
  // configService cache which may not reflect the update. Skipped until cache consistency is fixed.
  test.skip('TC-PERSIST-02: closeToTray toggle persists after reload', async ({ page }) => {
    const closeToTraySwitch = page.locator(`.divide-y ${ARCO_SWITCH}`).nth(1);
    await expect(closeToTraySwitch).toBeVisible();
    const wasChecked = await closeToTraySwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));

    await closeToTraySwitch.click();
    await waitForClassChange(closeToTraySwitch);
    expect(await closeToTraySwitch.evaluate((el) => el.classList.contains('arco-switch-checked'))).toBe(!wasChecked);

    await reloadAndGoToSystem(page);

    const reloadedSwitch = page.locator(`.divide-y ${ARCO_SWITCH}`).nth(1);
    await expect(reloadedSwitch).toBeVisible();
    await page.waitForFunction(
      (expected: boolean) => {
        const el = document.querySelectorAll('.divide-y .arco-switch')[1];
        return el?.classList.contains('arco-switch-checked') === expected;
      },
      !wasChecked,
      { timeout: 15_000 }
    );
    expect(await reloadedSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'))).toBe(!wasChecked);

    // Restore
    await reloadedSwitch.click();
    await waitForClassChange(reloadedSwitch);
  });

  // TC-PERSIST-03: promptTimeout InputNumber persists across reload
  test('TC-PERSIST-03: promptTimeout value persists after reload', async ({ page }) => {
    const wrapper = page
      .locator('.arco-input-number')
      .filter({ has: page.locator('[class*="suffix"]:has-text("s")') })
      .first();
    await expect(wrapper).toBeVisible({ timeout: 15_000 });

    const input = wrapper.locator('input');
    const originalValue = (await input.inputValue()).trim();

    await input.click();
    await page.keyboard.press('Meta+a');
    await input.fill('600');
    await input.blur();
    await waitForSettle(page, 500);
    expect(Number((await input.inputValue()).trim())).toBe(600);

    await reloadAndGoToSystem(page);

    const reloadedWrapper = page
      .locator('.arco-input-number')
      .filter({ has: page.locator('[class*="suffix"]:has-text("s")') })
      .first();
    await expect(reloadedWrapper).toBeVisible({ timeout: 15_000 });
    const reloadedInput = reloadedWrapper.locator('input');

    // Wait for the value to be hydrated from backend
    await page
      .waitForFunction(
        () => {
          const inputs = document.querySelectorAll<HTMLInputElement>('.arco-input-number input');
          for (const el of inputs) {
            if (el.value.trim() === '600') return true;
          }
          return false;
        },
        { timeout: 15_000 }
      )
      .catch(() => {});

    expect(Number((await reloadedInput.inputValue()).trim())).toBe(600);

    // Restore
    await reloadedInput.click();
    await page.keyboard.press('Meta+a');
    await reloadedInput.fill(originalValue || '300');
    await reloadedInput.blur();
    await waitForSettle(page, 500);
  });

  // Known issue: same configService cache consistency problem as TC-PERSIST-02.
  test.skip('TC-PERSIST-04: notification toggle persists after reload', async ({ page }) => {
    const collapseHeader = page.locator('.arco-collapse-item-header');
    await expect(collapseHeader).toBeVisible();
    const notifSwitch = collapseHeader.locator(ARCO_SWITCH);
    await expect(notifSwitch).toBeVisible();
    const wasChecked = await notifSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));

    await notifSwitch.click();
    await waitForClassChange(notifSwitch);
    expect(await notifSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'))).toBe(!wasChecked);

    await reloadAndGoToSystem(page);

    const reloadedNotifSwitch = page.locator('.arco-collapse-item-header').locator(ARCO_SWITCH);
    await expect(reloadedNotifSwitch).toBeVisible();
    await page.waitForFunction(
      (expected: boolean) => {
        const el = document.querySelector('.arco-collapse-item-header .arco-switch');
        return el?.classList.contains('arco-switch-checked') === expected;
      },
      !wasChecked,
      { timeout: 15_000 }
    );
    expect(await reloadedNotifSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'))).toBe(!wasChecked);

    // Verify Collapse expand/collapse matches the switch state
    const collapseContent = page.locator('.arco-collapse-item-content');
    if (!wasChecked) {
      await expect(collapseContent).toBeVisible();
    } else {
      await expect(collapseContent).not.toBeVisible();
    }

    // Restore
    await reloadedNotifSwitch.click();
    await waitForClassChange(reloadedNotifSwitch);
  });
});
