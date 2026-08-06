/**
 * Theme Switching E2E Tests
 *
 * Verifies that toggling light/dark theme via the ThemeSwitcher
 * updates the `data-theme` attribute on `<html>`.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings } from '../../../helpers/navigation';

test.describe('Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'display');
  });

  test('switches from current theme to the other and back', async ({ page }) => {
    const lightCard = page.getByTestId('theme-card-light');
    const darkCard = page.getByTestId('theme-card-dark');
    await expect(lightCard).toBeVisible();
    await expect(darkCard).toBeVisible();

    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(initialTheme).toBeTruthy();

    const targetTheme = initialTheme === 'light' ? 'dark' : 'light';
    const targetButton = targetTheme === 'dark' ? darkCard : lightCard;
    await targetButton.click();

    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      targetTheme,
      { timeout: 5_000 }
    );

    const newTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(newTheme).toBe(targetTheme);

    const revertButton = initialTheme === 'dark' ? darkCard : lightCard;
    await revertButton.click();

    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      initialTheme,
      { timeout: 5_000 }
    );

    const restoredTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(restoredTheme).toBe(initialTheme);
  });

  test('quick toggle updates its action immediately and can switch back', async ({ page }) => {
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();

    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const initialLabel = await toggle.getAttribute('aria-label');
    const targetTheme = initialTheme === 'light' ? 'dark' : 'light';

    await toggle.click();
    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      targetTheme,
      { timeout: 5_000 }
    );
    await expect(toggle).not.toHaveAttribute('aria-label', initialLabel ?? '');

    await toggle.click();
    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      initialTheme,
      { timeout: 5_000 }
    );
    await expect(toggle).toHaveAttribute('aria-label', initialLabel ?? '');
  });

  test('dark button sets data-theme to dark', async ({ page }) => {
    const darkButton = page.getByTestId('theme-card-dark');
    await expect(darkButton).toBeVisible();
    await darkButton.click();

    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', {
      timeout: 5_000,
    });

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');

    const arcoTheme = await page.evaluate(() => document.body.getAttribute('arco-theme'));
    expect(arcoTheme).toBe('dark');
  });

  test('light button sets data-theme to light', async ({ page }) => {
    const lightButton = page.getByTestId('theme-card-light');
    await expect(lightButton).toBeVisible();
    await lightButton.click();

    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', {
      timeout: 5_000,
    });

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('light');

    const arcoTheme = await page.evaluate(() => document.body.getAttribute('arco-theme'));
    expect(arcoTheme).toBe('light');
  });

  test('theme cards reflect the active selection', async ({ page }) => {
    const lightCard = page.getByTestId('theme-card-light');
    const darkCard = page.getByTestId('theme-card-dark');
    await lightCard.click();

    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', {
      timeout: 5_000,
    });

    await expect(lightCard).toHaveAttribute('data-active', 'true');
    await expect(darkCard).toHaveAttribute('data-active', 'false');

    await darkCard.click();

    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', {
      timeout: 5_000,
    });

    await expect(darkCard).toHaveAttribute('data-active', 'true');
    await expect(lightCard).toHaveAttribute('data-active', 'false');

    // Restore to light
    await lightCard.click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', {
      timeout: 5_000,
    });
  });
});
