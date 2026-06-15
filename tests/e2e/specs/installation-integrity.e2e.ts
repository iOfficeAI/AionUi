/**
 * Installation integrity failures happen before the normal app shell is ready,
 * so this spec launches its own Electron instance with a debug startup-failure
 * injection instead of using the shared app fixture.
 */
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import path from 'path';

declare global {
  interface Window {
    __installationIntegrityReportCount?: number;
    __lastInstallationIntegrityReportMessage?: string;
  }
}

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
  const existingMainWindow = electronApp.windows().find((win) => !win.url().startsWith('devtools://'));
  if (existingMainWindow) {
    await existingMainWindow.waitForLoadState('domcontentloaded');
    return existingMainWindow;
  }

  const page = await electronApp.waitForEvent('window', { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded');
  return page;
}

test.describe('Installation integrity failure dialog', () => {
  test('shows diagnostics actions and records a user report', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const electronApp = await electron.launch({
      args: ['.'],
      cwd: projectRoot,
      env: {
        ...process.env,
        AIONUI_DEBUG_BACKEND_STARTUP_FAILURE: 'backend_incomplete_installation',
        AIONUI_DISABLE_AUTO_UPDATE: '1',
        AIONUI_DISABLE_DEVTOOLS: '1',
        AIONUI_E2E_TEST: '1',
        AIONUI_CDP_PORT: '0',
        NODE_ENV: 'development',
      },
      timeout: 60_000,
    });

    try {
      const page = await resolveMainWindow(electronApp);

      await expect(page.getByTestId('installation-integrity-dialog')).toBeVisible();
      await expect(page.getByTestId('installation-integrity-description')).toContainText(/AionUi/);
      await expect(page.getByTestId('installation-integrity-report')).toBeVisible();
      await expect(page.getByTestId('installation-integrity-download')).toBeVisible();

      await page.getByTestId('installation-integrity-report').click();

      const reportButton = page.getByTestId('installation-integrity-report');
      await expect(reportButton).toBeDisabled();
      await expect(reportButton).toContainText(/Diagnostics sent|诊断报告已发送/);

      await expect
        .poll(() =>
          page.evaluate(() => ({
            count: window.__installationIntegrityReportCount ?? 0,
            message: window.__lastInstallationIntegrityReportMessage ?? '',
          }))
        )
        .toEqual({
          count: 1,
          message: 'installation-integrity-user-report',
        });
    } finally {
      await electronApp.close();
    }
  });
});
