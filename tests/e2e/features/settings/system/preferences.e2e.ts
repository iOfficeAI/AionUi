/**
 * System Preferences E2E Tests
 *
 * Covers: language switching, close-to-tray toggle, notification toggle,
 * auto-preview Office files toggle.
 * All operations via UI — zero invokeBridge, zero mock.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings, waitForSettle, waitForClassChange } from '../../../helpers/navigation';
import { takeScreenshot } from '../../../helpers/screenshots';
import { ARCO_SWITCH } from '../../../helpers/selectors';

test.describe('System Preferences', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'system');
    await waitForSettle(page);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-PREF-01: Language switching
  // ──────────────────────────────────────────────────────────────────────────

  test('TC-PREF-01: should switch language to English and back to Chinese', async ({ page }) => {
    await takeScreenshot(page, 'system-preferences/tc-pref-01/01-initial.png');

    const selectTrigger = page.locator('.aion-select .arco-select-view').first();
    await expect(selectTrigger).toBeVisible();

    await takeScreenshot(page, 'system-preferences/tc-pref-01/02-before-switch.png');

    await selectTrigger.click();

    const englishOption = page.locator('.arco-select-option:has-text("English")');
    await expect(englishOption).toBeVisible();
    await takeScreenshot(page, 'system-preferences/tc-pref-01/03-dropdown-open.png');

    await englishOption.click();
    await page.waitForFunction(() => document.body.textContent?.includes('Language'), { timeout: 5_000 });

    await takeScreenshot(page, 'system-preferences/tc-pref-01/04-after-english.png');

    const updatedText = await selectTrigger.textContent();
    expect(updatedText).toContain('English');

    const settingsTextEn = await page.locator('body').textContent();
    expect(settingsTextEn).toContain('Language');

    await selectTrigger.click();

    const chineseOption = page.locator('.arco-select-option:has-text("简体中文")');
    await expect(chineseOption).toBeVisible();
    await chineseOption.click();
    await page.waitForFunction(() => document.body.textContent?.includes('语言'), { timeout: 5_000 });

    await takeScreenshot(page, 'system-preferences/tc-pref-01/05-restored-chinese.png');

    const restoredText = await selectTrigger.textContent();
    expect(restoredText).toContain('简体中文');

    const settingsTextZh = await page.locator('body').textContent();
    expect(settingsTextZh).toContain('语言');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-PREF-02: Close-to-tray toggle
  // ──────────────────────────────────────────────────────────────────────────

  test('TC-PREF-02: should toggle close-to-tray switch', async ({ page }) => {
    await takeScreenshot(page, 'system-preferences/tc-pref-02/01-initial.png');

    const allSwitches = page.locator(`.divide-y ${ARCO_SWITCH}`);
    const closeToTraySwitch = allSwitches.nth(1);
    await expect(closeToTraySwitch).toBeVisible();

    const wasChecked = await closeToTraySwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    await takeScreenshot(page, 'system-preferences/tc-pref-02/02-before-toggle.png');

    await closeToTraySwitch.click();
    await waitForClassChange(closeToTraySwitch);

    const isCheckedAfter = await closeToTraySwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(isCheckedAfter).toBe(!wasChecked);
    await takeScreenshot(page, 'system-preferences/tc-pref-02/03-after-toggle.png');

    await closeToTraySwitch.click();
    await waitForClassChange(closeToTraySwitch);

    const isRestoredCheck = await closeToTraySwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(isRestoredCheck).toBe(wasChecked);
    await takeScreenshot(page, 'system-preferences/tc-pref-02/04-restored.png');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-PREF-03: Notification toggle
  // ──────────────────────────────────────────────────────────────────────────

  test('TC-PREF-03: should toggle notification switch via collapse header', async ({ page }) => {
    await takeScreenshot(page, 'system-preferences/tc-pref-03/01-initial.png');

    const collapseHeader = page.locator('.arco-collapse-item-header');
    await expect(collapseHeader).toBeVisible();

    const notificationSwitch = collapseHeader.locator(ARCO_SWITCH);
    await expect(notificationSwitch).toBeVisible();

    const wasChecked = await notificationSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    await takeScreenshot(page, 'system-preferences/tc-pref-03/02-before-toggle.png');

    await notificationSwitch.click();
    await waitForClassChange(notificationSwitch);

    const isCheckedAfter = await notificationSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(isCheckedAfter).toBe(!wasChecked);
    await takeScreenshot(page, 'system-preferences/tc-pref-03/03-after-toggle.png');

    if (isCheckedAfter) {
      const collapseContent = page.locator('.arco-collapse-item-content');
      await expect(collapseContent).toBeVisible();
    }

    await notificationSwitch.click();
    await waitForClassChange(notificationSwitch);

    const isRestoredCheck = await notificationSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(isRestoredCheck).toBe(wasChecked);
    await takeScreenshot(page, 'system-preferences/tc-pref-03/04-restored.png');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-PREF-04: Auto-preview Office files toggle
  // ──────────────────────────────────────────────────────────────────────────

  test('TC-PREF-04: should toggle auto-preview Office files switch', async ({ page }) => {
    await takeScreenshot(page, 'system-preferences/tc-pref-04/01-initial.png');

    const allSwitches = page.locator(`.divide-y ${ARCO_SWITCH}`);

    const switchCount = await allSwitches.count();
    expect(switchCount).toBeGreaterThanOrEqual(4);

    const officeSwitch = allSwitches.nth(switchCount - 1);
    await expect(officeSwitch).toBeVisible();

    const wasChecked = await officeSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    await takeScreenshot(page, 'system-preferences/tc-pref-04/02-before-toggle.png');

    await officeSwitch.click();
    await waitForClassChange(officeSwitch);

    const isCheckedAfter = await officeSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(isCheckedAfter).toBe(!wasChecked);
    await takeScreenshot(page, 'system-preferences/tc-pref-04/03-after-toggle.png');

    await officeSwitch.click();
    await waitForClassChange(officeSwitch);

    const isRestoredCheck = await officeSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    expect(isRestoredCheck).toBe(wasChecked);
    await takeScreenshot(page, 'system-preferences/tc-pref-04/04-restored.png');
  });
});
