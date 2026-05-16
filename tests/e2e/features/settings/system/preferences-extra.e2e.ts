/**
 * System Preferences E2E — supplementary cases.
 *
 * Covers: saveUploadToWorkspace toggle, cronNotification sub-switch,
 * startOnBoot (skip when unsupported), and Japanese language round-trip.
 * All operations via UI — zero invokeBridge, zero mock.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings, waitForSettle, waitForClassChange } from '../../../helpers/navigation';
import { takeScreenshot } from '../../../helpers/screenshots';
import { ARCO_SWITCH } from '../../../helpers/selectors';

test.describe('System Preferences — Extra', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'system');
    await waitForSettle(page);
  });

  // TC-PREF-05: Save-upload-to-workspace toggle
  test('TC-PREF-05: should toggle saveUploadToWorkspace switch', async ({ page }) => {
    const allSwitches = page.locator(`.divide-y ${ARCO_SWITCH}`);
    const saveSwitch = allSwitches.nth(2);
    await expect(saveSwitch).toBeVisible();

    const wasChecked = await saveSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    await saveSwitch.click();
    await waitForClassChange(saveSwitch);

    const isCheckedAfter = await saveSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(isCheckedAfter).toBe(!wasChecked);
    await takeScreenshot(page, 'system-preferences/tc-pref-05/01-toggled.png');

    await saveSwitch.click();
    await waitForClassChange(saveSwitch);
    const restored = await saveSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(restored).toBe(wasChecked);
  });

  // TC-PREF-06: Cron-notification sub-switch inside Collapse
  test('TC-PREF-06: should toggle cronNotification switch when notifications are on', async ({ page }) => {
    const collapseHeader = page.locator('.arco-collapse-item-header');
    await expect(collapseHeader).toBeVisible();
    const notifSwitch = collapseHeader.locator(ARCO_SWITCH);

    const notifWasOn = await notifSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    if (!notifWasOn) {
      await notifSwitch.click();
      await waitForClassChange(notifSwitch);
    }

    const collapseContent = page.locator('.arco-collapse-item-content');
    await expect(collapseContent).toBeVisible();

    const cronSwitch = collapseContent.locator(ARCO_SWITCH);
    await expect(cronSwitch).toBeVisible();

    const cronWas = await cronSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    await cronSwitch.click();
    await waitForClassChange(cronSwitch);

    const cronAfter = await cronSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(cronAfter).toBe(!cronWas);
    await takeScreenshot(page, 'system-preferences/tc-pref-06/01-cron-toggled.png');

    await cronSwitch.click();
    await waitForClassChange(cronSwitch);
    const cronRestored = await cronSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(cronRestored).toBe(cronWas);

    if (!notifWasOn) {
      await notifSwitch.click();
      await waitForClassChange(notifSwitch);
    }
  });

  // TC-PREF-07: Start-on-boot (skip when unsupported in dev)
  test('TC-PREF-07: should toggle startOnBoot or skip if disabled', async ({ page }) => {
    const allSwitches = page.locator(`.divide-y ${ARCO_SWITCH}`);
    const bootSwitch = allSwitches.nth(0);
    await expect(bootSwitch).toBeVisible();

    const isDisabled = await bootSwitch.evaluate(
      (el: HTMLButtonElement) => el.disabled || el.classList.contains('arco-switch-disabled')
    );
    test.skip(isDisabled, 'startOnBoot not supported in dev mode');

    const wasChecked = await bootSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    await bootSwitch.click();
    await waitForClassChange(bootSwitch);

    const isCheckedAfter = await bootSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(isCheckedAfter).toBe(!wasChecked);
    await takeScreenshot(page, 'system-preferences/tc-pref-07/01-boot-toggled.png');

    await bootSwitch.click();
    await waitForClassChange(bootSwitch);
    const restored = await bootSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(restored).toBe(wasChecked);
  });

  // TC-PREF-08: Language round-trip — switch to Japanese then back to Chinese
  test('TC-PREF-08: should switch language to Japanese and back to Chinese', async ({ page }) => {
    const selectTrigger = page.locator('.aion-select .arco-select-view').first();
    await expect(selectTrigger).toBeVisible();

    await selectTrigger.click();
    const japaneseOption = page.locator('.arco-select-option:has-text("日本語")');
    await expect(japaneseOption).toBeVisible();
    await japaneseOption.click();

    await page.waitForFunction(
      () => {
        const t = document.body.textContent ?? '';
        return t.includes('言語') || t.includes('システム');
      },
      { timeout: 5_000 }
    );
    await takeScreenshot(page, 'system-preferences/tc-pref-08/01-japanese.png');

    const jpText = await selectTrigger.textContent();
    expect(jpText).toContain('日本語');

    await selectTrigger.click();
    const chineseOption = page.locator('.arco-select-option:has-text("简体中文")');
    await expect(chineseOption).toBeVisible();
    await chineseOption.click();

    await page.waitForFunction(() => document.body.textContent?.includes('语言'), { timeout: 5_000 });
    await takeScreenshot(page, 'system-preferences/tc-pref-08/02-restored-chinese.png');

    const restoredText = await selectTrigger.textContent();
    expect(restoredText).toContain('简体中文');
  });
});
