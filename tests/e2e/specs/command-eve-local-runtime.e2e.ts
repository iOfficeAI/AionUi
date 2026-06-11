/**
 * Command EVE Local Runtime – Electron bridge proof.
 *
 * Verifies the desktop app renders the local Runtime truth surface from the
 * packaged Command EVE runtime manifest without exposing model mutation.
 */
import { test, expect } from '../fixtures';

test.describe('Command EVE Local Runtime', () => {
  test.setTimeout(120_000);

  test('renders local Gemma runtime tiers and loopback provider truth', async ({ page }, testInfo) => {
    await page.waitForSelector('body', { state: 'visible' });

    await page.evaluate(() => {
      window.location.hash = '#/runtime';
    });

    await expect(page.getByText('Local Runtime').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Read-only').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('hermes-agent 0.16.0').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('http://127.0.0.1:11434').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('http://127.0.0.1:25811').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('gemma4:e4b').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('gemma4:12b').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('gemma4:31b').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Hermes Kanban').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Module bereit|modules ready/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Modell-Warm-up').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Warm-up|warm-up|Modellwechsel|model switching/ })).toHaveCount(0);

    const screenshotPath = 'tests/e2e/results/command-eve-local-runtime.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('command-eve-local-runtime', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });
});
