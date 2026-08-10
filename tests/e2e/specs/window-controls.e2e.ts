/**
 * Window Controls – custom titlebar minimize/maximize/close buttons.
 *
 * These buttons render on Windows/Linux (frameless window) and drive the
 * BrowserWindow through zero-argument bridge invokes (window-controls:*).
 *
 * Regression coverage for v2.1.36: zero-arg invokes send `data: undefined`,
 * which JSON serialization drops from the IPC payload. The bridge's subscribe
 * guard rejected requests without a `data` key, so all window-control clicks
 * were silently ignored (Sentry ELECTRON-3JZ).
 */
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers/bridge';

test.describe('Window Controls', () => {
  test('zero-arg window-controls invoke crosses real IPC and resolves', async ({ page }) => {
    // isMaximized is a zero-arg invoke on the same channel family as
    // minimize/maximize/close, but side-effect free — safe to call headless.
    const isMaximized = await invokeBridge<boolean>(page, 'window-controls:is-maximized', undefined, 10_000);
    expect(typeof isMaximized).toBe('boolean');
  });

  test('maximize and unmaximize round-trip through the bridge', async ({ page, electronApp }) => {
    await invokeBridge<void>(page, 'window-controls:maximize', undefined, 10_000);
    // Poll the real BrowserWindow state from the main process.
    await expect
      .poll(
        () =>
          electronApp.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
            return win?.isMaximized() ?? false;
          }),
        { timeout: 10_000 }
      )
      .toBe(true);

    await invokeBridge<void>(page, 'window-controls:unmaximize', undefined, 10_000);
    await expect
      .poll(
        () =>
          electronApp.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
            return win?.isMaximized() ?? true;
          }),
        { timeout: 10_000 }
      )
      .toBe(false);
  });
});
