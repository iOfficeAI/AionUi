import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const projectRoot = path.resolve(__dirname, '../../../..');
const expectedElectronVersion = (
  JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
    devDependencies: { electron: string };
  }
).devDependencies.electron.replace(/^[~^]/, '');

const launch = async (userDataPath: string, options: { crash?: boolean; safeMode?: boolean } = {}) => {
  const args = ['.'];
  if (options.safeMode) args.push('--safe-mode');
  const launchEnvironment = { ...process.env };
  delete launchEnvironment.ELECTRON_RUN_AS_NODE;
  const localBackendDirectory = path.resolve(projectRoot, '../AionCore/target/debug');
  const launchPath = fs.existsSync(path.join(localBackendDirectory, 'aioncore.exe'))
    ? [localBackendDirectory, launchEnvironment.PATH || ''].filter(Boolean).join(path.delimiter)
    : launchEnvironment.PATH;
  return electron.launch({
    args,
    cwd: projectRoot,
    env: {
      ...launchEnvironment,
      CSBU_WORKMATE_CDP_PORT: '0',
      CSBU_WORKMATE_DISABLE_AUTO_UPDATE: '1',
      CSBU_WORKMATE_DISABLE_DEVTOOLS: '1',
      CSBU_WORKMATE_E2E_NATIVE_CRASH: options.crash ? '1' : '',
      CSBU_WORKMATE_E2E_TEST: '1',
      CSBU_WORKMATE_E2E_USER_DATA_DIR: userDataPath,
      NODE_ENV: 'development',
      PATH: launchPath,
    },
    timeout: 60_000,
  });
};

const mainWindow = async (electronApp: ElectronApplication): Promise<Page> => {
  const page = electronApp.windows().find((window) => !window.url().startsWith('devtools://'));
  if (page) return page;
  return electronApp.waitForEvent('window', { timeout: 30_000 });
};

test.describe('native crash recovery', () => {
  test('recognizes a real Crashpad dump and supports a one-time safe-mode launch', async () => {
    test.setTimeout(180_000);
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'workmate-native-crash-e2e-'));
    let runningApp: ElectronApplication | null = null;

    try {
      runningApp = await launch(userDataPath, { crash: true });
      expect(await runningApp.evaluate(() => process.versions.electron)).toBe(expectedElectronVersion);
      const crashDumpsPath = await runningApp.evaluate(({ app }) => app.getPath('crashDumps'));
      await new Promise<void>((resolve) => runningApp?.process().once('exit', () => resolve()));
      runningApp = null;

      await expect
        .poll(
          () =>
            fs.existsSync(crashDumpsPath) &&
            fs.readdirSync(crashDumpsPath, { recursive: true }).some((entry) => String(entry).endsWith('.dmp')),
          { timeout: 15_000 }
        )
        .toBe(true);

      const statePath = path.join(userDataPath, 'crash-recovery-state.json');
      const persistedState = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        activeSession?: { cleanExitAt?: number; startedAt: number };
      };
      expect(persistedState.activeSession?.cleanExitAt).toBeUndefined();

      runningApp = await launch(userDataPath);
      const recoveryPage = await mainWindow(runningApp);
      const recoveryState = await recoveryPage.evaluate(() => {
        const electronAPI = (
          window as unknown as {
            electronAPI: {
              emit: (name: string, data: unknown) => Promise<unknown>;
              on: (callback: (payload: { value: string }) => void) => () => void;
            };
          }
        ).electronAPI;
        const requestId = 'e2e-crash-recovery-state';
        const callbackName = `subscribe.callback-app.crash-recovery.get-state${requestId}`;
        return new Promise<unknown>((resolve) => {
          const dispose = electronAPI.on(({ value }) => {
            const response = JSON.parse(value) as { name: string; data: unknown };
            if (response.name !== callbackName) return;
            dispose();
            resolve(response.data);
          });
          void electronAPI.emit('subscribe-app.crash-recovery.get-state', { id: requestId });
        });
      });
      expect(recoveryState).toMatchObject({ detected: true, reportId: expect.any(String) });
      await expect(recoveryPage.getByTestId('crash-recovery-safe-mode')).toBeVisible();
      await recoveryPage.getByTestId('crash-recovery-safe-mode').click();
      await runningApp.close();
      runningApp = null;

      runningApp = await launch(userDataPath, { safeMode: true });
      const safeModePage = await mainWindow(runningApp);
      await expect(safeModePage.getByTestId('brand-logo')).toBeVisible();
      await expect(safeModePage.getByTestId('crash-recovery-safe-mode')).toHaveCount(0);
      expect(await runningApp.evaluate(() => process.argv.includes('--safe-mode'))).toBe(true);
    } finally {
      if (runningApp) await runningApp.close().catch(() => undefined);
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });
});
