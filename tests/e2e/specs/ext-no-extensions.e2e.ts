import { test, expect, type ElectronApplication, type Page, _electron as electron } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getChannelPluginStatus, goToSettings, invokeBridge, settingsSiderItemById } from '../helpers';

const emptyExtensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-no-extensions-'));
const stateSandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-no-extensions-state-'));
const extensionStatesFile = path.join(stateSandboxDir, 'extension-states.json');

function isDevToolsWindow(page: Page): boolean {
  return page.url().startsWith('devtools://');
}

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
  const existingMainWindow = electronApp.windows().find((win) => !isDevToolsWindow(win));
  if (existingMainWindow) {
    await existingMainWindow.waitForLoadState('domcontentloaded');
    return existingMainWindow;
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const win = await electronApp.waitForEvent('window', { timeout: 1_000 }).catch(() => null);
    if (win && !isDevToolsWindow(win)) {
      await win.waitForLoadState('domcontentloaded');
      return win;
    }
  }

  throw new Error('Failed to resolve main renderer window for no-extension E2E app.');
}

async function launchAppWithoutExtensions(): Promise<ElectronApplication> {
  const projectRoot = path.resolve(__dirname, '../../..');
  const launchArgs = ['.'];
  if (process.platform === 'linux' && process.env.CI) {
    launchArgs.push('--no-sandbox');
  }

  return electron.launch({
    args: launchArgs,
    cwd: projectRoot,
    env: {
      ...process.env,
      AIONUI_EXTENSIONS_PATH: emptyExtensionsDir,
      AIONUI_EXTENSION_STATES_FILE: extensionStatesFile,
      AIONUI_DISABLE_AUTO_UPDATE: '1',
      AIONUI_DISABLE_DEVTOOLS: '1',
      AIONUI_E2E_TEST: '1',
      AIONUI_CDP_PORT: '0',
      NODE_ENV: 'development',
    },
    timeout: 60_000,
  });
}

test.describe.serial('Extension: Empty Directory / No Extensions', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    electronApp = await launchAppWithoutExtensions();
    page = await resolveMainWindow(electronApp);
  });

  test.afterAll(async () => {
    await electronApp?.close().catch(() => {});
    fs.rmSync(stateSandboxDir, { recursive: true, force: true });
    fs.rmSync(emptyExtensionsDir, { recursive: true, force: true });
  });

  test('loads with zero extension contributions', async () => {
    const [
      loadedExtensions,
      acpAdapters,
      mcpServers,
      assistants,
      agents,
      skills,
      themes,
      settingsTabs,
      webuiContributions,
    ] = await Promise.all([
      invokeBridge(page, 'extensions.get-loaded-extensions'),
      invokeBridge(page, 'extensions.get-acp-adapters'),
      invokeBridge(page, 'extensions.get-mcp-servers'),
      invokeBridge(page, 'extensions.get-assistants'),
      invokeBridge(page, 'extensions.get-agents'),
      invokeBridge(page, 'extensions.get-skills'),
      invokeBridge(page, 'extensions.get-themes'),
      invokeBridge(page, 'extensions.get-settings-tabs'),
      invokeBridge(page, 'extensions.get-webui-contributions'),
    ]);

    expect(loadedExtensions).toEqual([]);
    expect(acpAdapters).toEqual([]);
    expect(mcpServers).toEqual([]);
    expect(assistants).toEqual([]);
    expect(agents).toEqual([]);
    expect(skills).toEqual([]);
    expect(themes).toEqual([]);
    expect(settingsTabs).toEqual([]);
    expect(webuiContributions).toEqual([]);
  });

  test('keeps builtin settings and channels available without extension tabs or plugins', async () => {
    await goToSettings(page, 'about');
    await expect(page.locator(settingsSiderItemById('about'))).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-settings-path^="ext/"]')).toHaveCount(0);

    const statuses = await getChannelPluginStatus(page);
    const channelTypes = statuses.map((item) => item.type);

    expect(channelTypes).toEqual(expect.arrayContaining(['telegram', 'lark', 'dingtalk']));
    expect(channelTypes).not.toContain('e2e-test-channel');
    expect(channelTypes).not.toContain('ext-feishu');
  });
});
