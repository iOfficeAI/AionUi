/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import './utils/configureChromium';
import { app, BrowserWindow, nativeImage, powerMonitor, screen } from 'electron';
import fixPath from 'fix-path';
import * as fs from 'fs';
import * as path from 'path';
import { initMainAdapterWithWindow } from './adapter/main';
import { ipcBridge } from './common';
import { initializeProcess } from './process';
import { loadShellEnvironmentAsync } from './process/utils/shellEnv';
import { initializeAcpDetector } from './process/bridge';
import { registerWindowMaximizeListeners } from './process/bridge/windowControlsBridge';
import WorkerManage from './process/WorkerManage';
import { setupApplicationMenu } from './utils/appMenu';
import { startWebServer } from './webserver';
import { SERVER_CONFIG } from './webserver/config/constants';
import { applyZoomToWindow } from './process/utils/zoom';
// @ts-expect-error - electron-squirrel-startup doesn't have types
import electronSquirrelStartup from 'electron-squirrel-startup';

// ============ Deep Link Protocol ============
// Register aionui:// protocol scheme for external app integration (e.g., New API token quick-add)
const PROTOCOL_SCHEME = 'aionui';

/**
 * Parse an aionui:// URL into action and params.
 * Supports two formats:
 *   1. aionui://add-provider?baseUrl=xxx&apiKey=xxx
 *   2. aionui://provider/add?v=1&data=<base64 JSON>  (one-api / new-api style)
 */
const parseDeepLinkUrl = (url: string): { action: string; params: Record<string, string> } | null => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return null;

    // Build action from hostname + pathname, e.g. "provider/add" or "add-provider"
    const hostname = parsed.hostname || '';
    const pathname = parsed.pathname.replace(/^\/+/, '');
    const action = pathname ? `${hostname}/${pathname}` : hostname;

    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // If data param exists, decode base64 JSON and merge into params
    if (params.data) {
      try {
        const json = JSON.parse(Buffer.from(params.data, 'base64').toString('utf-8'));
        if (json && typeof json === 'object') {
          Object.assign(params, json);
        }
      } catch {
        // Ignore decode errors
      }
      // Remove raw base64 blob so it isn't forwarded to the renderer
      delete params.data;
    }

    return { action, params };
  } catch {
    return null;
  }
};

/** Pending deep-link URL received before the window was ready */
let pendingDeepLinkUrl: string | null = process.argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`)) || null;

/**
 * Send the deep-link payload to the renderer via IPC bridge.
 * If the window isn't ready yet, queue it.
 */
const handleDeepLinkUrl = (url: string) => {
  const parsed = parseDeepLinkUrl(url);
  if (!parsed) return;

  if (!mainWindow || mainWindow.isDestroyed()) {
    // Window not ready yet – last-write-wins: only the most recent deep link is kept,
    // which is intentional since the user can only act on one at a time.
    pendingDeepLinkUrl = url;
    return;
  }

  ipcBridge.deepLink.received.emit(parsed);
};

// ============ Single Instance Lock ============
// Acquire lock early so the second instance quits before doing unnecessary work.
// When a second instance starts (e.g. from protocol URL), it sends its data
// to the first instance via second-instance event, then quits.
const deepLinkFromArgv = process.argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
const gotTheLock = app.requestSingleInstanceLock({ deepLinkUrl: deepLinkFromArgv });
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, _workingDirectory, additionalData) => {
    // Prefer additionalData (reliable on all platforms), fallback to argv scan
    const deepLinkUrl = (additionalData as { deepLinkUrl?: string })?.deepLinkUrl || argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
    if (deepLinkUrl) {
      handleDeepLinkUrl(deepLinkUrl);
    }
    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// 修复 macOS 和 Linux 下 GUI 应用的 PATH 环境变量,使其与命令行一致
if (process.platform === 'darwin' || process.platform === 'linux') {
  fixPath();

  // Supplement nvm paths that fix-path might miss (nvm is often only in .zshrc, not .zshenv)
  const nvmDir = process.env.NVM_DIR || path.join(process.env.HOME || '', '.nvm');
  const nvmVersionsDir = path.join(nvmDir, 'versions', 'node');
  if (fs.existsSync(nvmVersionsDir)) {
    try {
      const versions = fs.readdirSync(nvmVersionsDir);
      const nvmPaths = versions.map((v) => path.join(nvmVersionsDir, v, 'bin')).filter((p) => fs.existsSync(p));
      if (nvmPaths.length > 0) {
        const currentPath = process.env.PATH || '';
        const missingPaths = nvmPaths.filter((p) => !currentPath.includes(p));
        if (missingPaths.length > 0) {
          process.env.PATH = [...missingPaths, currentPath].join(path.delimiter);
        }
      }
    } catch {
      // Ignore errors when reading nvm directory
    }
  }
}

// Handle Squirrel startup events (Windows installer)
if (electronSquirrelStartup) {
  app.quit();
}

// 主进程全局错误处理器
// Global error handlers for main process
// 捕获未处理的同步异常，防止显示 Electron 默认错误对话框
// Catch uncaught synchronous exceptions to prevent Electron's default error dialog
process.on('uncaughtException', (_error) => {
  // 在生产环境中，可以将错误记录到文件或上报到错误追踪服务
  // In production, errors can be logged to file or sent to error tracking service
  if (process.env.NODE_ENV !== 'development') {
    // TODO: Add error logging or reporting
  }
});

// 捕获未处理的 Promise 拒绝，避免应用崩溃
// Catch unhandled Promise rejections to prevent app crashes
process.on('unhandledRejection', (_reason, _promise) => {
  // 可以在这里添加错误上报逻辑
  // Error reporting logic can be added here
});

const hasSwitch = (flag: string) => process.argv.includes(`--${flag}`) || app.commandLine.hasSwitch(flag);
const getSwitchValue = (flag: string): string | undefined => {
  const withEqualsPrefix = `--${flag}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(withEqualsPrefix));
  if (equalsArg) {
    return equalsArg.slice(withEqualsPrefix.length);
  }

  const argIndex = process.argv.indexOf(`--${flag}`);
  if (argIndex !== -1) {
    const nextArg = process.argv[argIndex + 1];
    if (nextArg && !nextArg.startsWith('--')) {
      return nextArg;
    }
  }

  const cliValue = app.commandLine.getSwitchValue(flag);
  return cliValue || undefined;
};
const hasCommand = (cmd: string) => process.argv.includes(cmd);

const WEBUI_CONFIG_FILE = 'webui.config.json';

type WebUIUserConfig = {
  port?: number | string;
  allowRemote?: boolean;
};

const parsePortValue = (value: unknown, _sourceLabel: string): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const portNumber = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(portNumber) || portNumber < 1 || portNumber > 65535) {
    return null;
  }
  return portNumber;
};

const loadUserWebUIConfig = (): { config: WebUIUserConfig; path: string | null; exists: boolean } => {
  try {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, WEBUI_CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
      return { config: {}, path: configPath, exists: false };
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { config: {}, path: configPath, exists: false };
    }
    return { config: parsed as WebUIUserConfig, path: configPath, exists: true };
  } catch (error) {
    return { config: {}, path: null, exists: false };
  }
};

const resolveWebUIPort = (config: WebUIUserConfig): number => {
  const cliPort = parsePortValue(getSwitchValue('port') ?? getSwitchValue('webui-port'), 'CLI (--port)');
  if (cliPort) return cliPort;

  const envPort = parsePortValue(process.env.AIONUI_PORT ?? process.env.PORT, 'environment variable (AIONUI_PORT/PORT)');
  if (envPort) return envPort;

  const configPort = parsePortValue(config.port, 'webui.config.json');
  if (configPort) return configPort;

  return SERVER_CONFIG.DEFAULT_PORT;
};

const parseBooleanEnv = (value?: string): boolean | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const resolveRemoteAccess = (config: WebUIUserConfig): boolean => {
  const envRemote = parseBooleanEnv(process.env.AIONUI_ALLOW_REMOTE || process.env.AIONUI_REMOTE);
  const hostHint = process.env.AIONUI_HOST?.trim();
  const hostRequestsRemote = hostHint ? ['0.0.0.0', '::', '::0'].includes(hostHint) : false;
  const configRemote = config.allowRemote === true;

  return isRemoteMode || hostRequestsRemote || envRemote === true || configRemote;
};

const isWebUIMode = hasSwitch('webui');
const isRemoteMode = hasSwitch('remote');
const isResetPasswordMode = hasCommand('--resetpass');

let mainWindow: BrowserWindow;

const createWindow = (): void => {
  // Get primary display size
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Set window size to 80% (4/5) of screen size for better visibility on high-resolution displays
  const windowWidth = Math.floor(screenWidth * 0.8);
  const windowHeight = Math.floor(screenHeight * 0.8);

  // Get app icon for development mode (Windows/Linux need icon in BrowserWindow)
  // In production, icons are set via forge.config.ts packagerConfig
  let devIcon: Electron.NativeImage | undefined;
  if (!app.isPackaged) {
    try {
      // Windows: app.ico (no dev version), Linux: app_dev.png (with padding)
      const iconFile = process.platform === 'win32' ? 'app.ico' : 'app_dev.png';
      const iconPath = path.join(process.cwd(), 'resources', iconFile);
      if (fs.existsSync(iconPath)) {
        devIcon = nativeImage.createFromPath(iconPath);
        if (devIcon.isEmpty()) devIcon = undefined;
      }
    } catch {
      // Ignore icon loading errors in development
    }
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    show: false, // Hide until CSS is loaded to prevent FOUC
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    // Set icon for Windows/Linux in development mode
    ...(devIcon && process.platform !== 'darwin' ? { icon: devIcon } : {}),
    // Custom titlebar configuration / 自定义标题栏配置
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 10, y: 10 },
        }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      webviewTag: true, // 启用 webview 标签用于 HTML 预览 / Enable webview tag for HTML preview
    },
  });

  // Show window after page and CSS are fully loaded to prevent FOUC
  const showWindow = () => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  };
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(showWindow, 200);
  });
  // Fallback: show window after 3s even if did-finish-load doesn't fire
  setTimeout(showWindow, 3000);

  initMainAdapterWithWindow(mainWindow);
  setupApplicationMenu();
  void applyZoomToWindow(mainWindow);
  registerWindowMaximizeListeners(mainWindow);

  // Initialize auto-updater service
  // 初始化自动更新服务
  Promise.all([import('./process/services/autoUpdaterService'), import('./process/bridge/updateBridge')])
    .then(([{ autoUpdaterService }, { createAutoUpdateStatusBroadcast }]) => {
      // Create status broadcast callback that emits via ipcBridge (pure emitter, no window binding)
      const statusBroadcast = createAutoUpdateStatusBroadcast();
      autoUpdaterService.initialize(statusBroadcast);
      // Check for updates after 3 seconds delay
      // 3秒后检查更新
      setTimeout(() => {
        void autoUpdaterService.checkForUpdatesAndNotify();
      }, 3000);
    })
    .catch((error) => {
      console.error('[App] Failed to initialize autoUpdaterService:', error);
    });

  // and load the index.html of the app.
  // electron-vite: In development, use ELECTRON_RENDERER_URL for HMR
  // In production, load the built HTML file
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((_error) => {
      // Error loading main window URL
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')).catch((_error) => {
      // Error loading main window file
    });
  }

  // 只在开发环境自动打开 DevTools / Only auto-open DevTools in development
  // 使用 app.isPackaged 判断更可靠，打包后的应用不会自动打开 DevTools
  // Using app.isPackaged is more reliable, packaged apps won't auto-open DevTools
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
};

// Menu.setApplicationMenu(null);

ipcBridge.application.openDevTools.provider(() => {
  if (mainWindow) {
    mainWindow.webContents.openDevTools();
  }
  return Promise.resolve();
});

const handleAppReady = async (): Promise<void> => {
  // Set dock icon in development mode on macOS
  // In production, the icon is set via forge.config.ts packagerConfig.icon
  if (process.platform === 'darwin' && !app.isPackaged && app.dock) {
    try {
      const iconPath = path.join(process.cwd(), 'resources', 'app_dev.png');
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          app.dock.setIcon(icon);
        }
      }
    } catch {
      // Ignore dock icon errors in development
    }
  }

  try {
    await initializeProcess();
  } catch (error) {
    console.error('Failed to initialize process:', error);
    app.exit(1);
    return;
  }

  if (isResetPasswordMode) {
    // Handle password reset without creating window
    try {
      // Get username argument, filtering out flags (--xxx)
      // 获取用户名参数，过滤掉标志（--xxx）
      const resetPasswordIndex = process.argv.indexOf('--resetpass');
      const argsAfterCommand = process.argv.slice(resetPasswordIndex + 1);
      const username = argsAfterCommand.find((arg) => !arg.startsWith('--')) || 'admin';

      // Import resetpass logic
      const { resetPasswordCLI } = await import('./utils/resetPasswordCLI');
      await resetPasswordCLI(username);

      app.quit();
    } catch (error) {
      app.exit(1);
    }
  } else if (isWebUIMode) {
    const userConfigInfo = loadUserWebUIConfig();
    if (userConfigInfo.exists && userConfigInfo.path) {
      // Config file loaded from user directory
    }
    const resolvedPort = resolveWebUIPort(userConfigInfo.config);
    const allowRemote = resolveRemoteAccess(userConfigInfo.config);
    await startWebServer(resolvedPort, allowRemote);
  } else {
    createWindow();

    // Flush pending deep-link URL (received before window was ready)
    if (pendingDeepLinkUrl) {
      const url = pendingDeepLinkUrl;
      pendingDeepLinkUrl = null;
      // Wait for renderer to be ready before sending
      mainWindow.webContents.once('did-finish-load', () => {
        handleDeepLinkUrl(url);
      });
    }
  }

  // 启动时初始化ACP检测器 (skip in --resetpass mode)
  if (!isResetPasswordMode) {
    await initializeAcpDetector();
    // Preload shell environment in background for faster ACP connections
    void loadShellEnvironmentAsync();
  }

  // Listen for system resume (wake from sleep/hibernate) to recover missed cron jobs
  powerMonitor.on('resume', () => {
    console.log('[App] System resumed from sleep, triggering cron recovery');
    import('@process/services/cron/CronService')
      .then(({ cronService }) => {
        void cronService.handleSystemResume();
      })
      .catch((error) => {
        console.error('[App] Failed to handle system resume for cron:', error);
      });
  });
};

// ============ Protocol Registration ============
// Register aionui:// as the default protocol client
if (process.defaultApp) {
  // Dev mode: need to pass execPath explicitly
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

// macOS: handle aionui:// URLs via the open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLinkUrl(url);
  // Focus existing window so user sees the result
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Ensure we don't miss the ready event when running in CLI/WebUI mode
void app
  .whenReady()
  .then(handleAppReady)
  .catch((_error) => {
    // App initialization failed
    app.quit();
  });

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // In WebUI mode, don't quit when windows are closed since we're running a web server
  if (!isWebUIMode && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!isWebUIMode && app.isReady() && BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  // 在应用退出前清理工作进程
  WorkerManage.clear();

  // Shutdown Channel subsystem
  try {
    const { getChannelManager } = await import('@/channels');
    await getChannelManager().shutdown();
  } catch (error) {
    console.error('[App] Failed to shutdown ChannelManager:', error);
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
