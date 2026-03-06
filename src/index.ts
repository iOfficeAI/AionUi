/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import './utils/configureChromium';
import { app, BrowserWindow, Menu, nativeImage, powerMonitor, screen, Tray } from 'electron';
import fixPath from 'fix-path';
import * as fs from 'fs';
import * as path from 'path';
import { initMainAdapterWithWindow } from './adapter/main';
import { ipcBridge } from './common';
import { ProcessConfig } from './process/initStorage';
import { initializeProcess } from './process';
import { loadShellEnvironmentAsync, mergePaths } from './process/utils/shellEnv';
import { initializeAcpDetector } from './process/bridge';
import { registerWindowMaximizeListeners } from './process/bridge/windowControlsBridge';
import { onCloseToTrayChanged, onLanguageChanged } from './process/bridge/systemSettingsBridge';
import WorkerManage from './process/WorkerManage';
import { setupApplicationMenu } from './utils/appMenu';
import { startWebServer } from './webserver';
import { SERVER_CONFIG } from './webserver/config/constants';
import { applyZoomToWindow } from './process/utils/zoom';
import i18n from '@process/i18n';
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

// Flag to distinguish intentional quit from unexpected exit in WebUI mode
let isExplicitQuit = false;

let mainWindow: BrowserWindow;
let tray: Tray | null = null;
let isQuitting = false;
let closeToTrayEnabled = false;

/**
 * 获取托盘图标 / Get tray icon
 * macOS 使用 Template 图标以适配深色/浅色菜单栏
 * macOS uses Template image to adapt to dark/light menu bar
 */
const getTrayIcon = (): Electron.NativeImage => {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
  const icon = nativeImage.createFromPath(path.join(resourcesPath, 'app.png'));
  if (process.platform === 'darwin') {
    // macOS: 使用 16x16 的彩色应用图标 / Use 16x16 colored app icon
    return icon.resize({ width: 16, height: 16 });
  }
  // Windows/Linux: 使用 32x32 PNG 图标确保清晰可见 / Use 32x32 PNG icon for clear visibility
  return icon.resize({ width: 32, height: 32 });
};

/**
 * 构建托盘右键菜单 / Build tray context menu
 */
const buildTrayContextMenu = (): Electron.Menu => {
  return Menu.buildFromTemplate([
    {
      label: i18n.t('tray.showWindow'),
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: i18n.t('tray.quit'),
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
};

/**
 * 创建系统托盘 / Create system tray
 */
const createOrUpdateTray = (): void => {
  if (tray) {
    return;
  }
  try {
    const icon = getTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('AionUi');
    tray.setContextMenu(buildTrayContextMenu());

    // 双击托盘图标显示窗口（Windows/Linux）/ Double-click tray icon to show window (Windows/Linux)
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.error('[Tray] Failed to create tray:', err);
  }
};

/**
 * 刷新托盘右键菜单文案（语言切换时调用）/ Refresh tray context menu labels (called on language change)
 */
const refreshTrayMenu = (): void => {
  if (tray) {
    tray.setContextMenu(buildTrayContextMenu());
  }
};

/**
 * 销毁系统托盘 / Destroy system tray
 */
const destroyTray = (): void => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
};

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

  // Listen to DevTools state changes and notify Renderer
  mainWindow.webContents.on('devtools-opened', () => {
    ipcBridge.application.devToolsStateChanged.emit({ isOpen: true });
  });

  mainWindow.webContents.on('devtools-closed', () => {
    ipcBridge.application.devToolsStateChanged.emit({ isOpen: false });
  });

  // 关闭拦截：当启用"关闭到托盘"时，隐藏窗口而非关闭
  // Close interception: hide window instead of closing when "close to tray" is enabled
  mainWindow.on('close', (event) => {
    if (closeToTrayEnabled && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
};

// Menu.setApplicationMenu(null);

ipcBridge.application.isDevToolsOpened.provider(() => {
  if (mainWindow) {
    return Promise.resolve(mainWindow.webContents.isDevToolsOpened());
  }
  return Promise.resolve(false);
});

ipcBridge.application.openDevTools.provider(() => {
  if (mainWindow) {
    const wasOpen = mainWindow.webContents.isDevToolsOpened();

    if (wasOpen) {
      mainWindow.webContents.closeDevTools();
      // Close is synchronous, return immediately
      return Promise.resolve(false);
    } else {
      // Open is async, wait for the event
      return new Promise((resolve) => {
        const onOpened = () => {
          mainWindow.webContents.off('devtools-opened', onOpened);
          resolve(true);
        };

        mainWindow.webContents.once('devtools-opened', onOpened);
        mainWindow.webContents.openDevTools();

        // Fallback timeout in case event doesn't fire
        setTimeout(() => {
          mainWindow.webContents.off('devtools-opened', onOpened);
          const isNowOpen = mainWindow.webContents.isDevToolsOpened();
          resolve(isNowOpen);
        }, 500);
      });
    }
  }
  return Promise.resolve(false);
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

    // Keep the process alive in WebUI mode by preventing default quit behavior.
    // On Linux headless (systemd), Electron may attempt to quit when no windows exist.
    app.on('will-quit', (event) => {
      // Only prevent quit if this is an unexpected exit (server still running).
      // Explicit app.exit() calls bypass will-quit, so they are unaffected.
      if (!isExplicitQuit) {
        event.preventDefault();
        console.warn('[WebUI] Prevented unexpected quit — server is still running');
      }
    });
  } else {
    // Initialize ACP detector BEFORE creating the window to prevent a race
    // condition where the renderer fetches getAvailableAgents before detection
    // finishes, caching an empty result via SWR.
    await initializeAcpDetector();

    createWindow();

    // 初始化关闭到托盘设置 / Initialize close-to-tray setting
    try {
      const savedCloseToTray = await ProcessConfig.get('system.closeToTray');
      closeToTrayEnabled = savedCloseToTray ?? false;
      if (closeToTrayEnabled) {
        createOrUpdateTray();
      }
    } catch {
      // Ignore storage read errors, default to false
    }

    // 监听设置变更（通过 bridge 库）/ Listen for setting changes (via bridge library)
    onCloseToTrayChanged((enabled) => {
      closeToTrayEnabled = enabled;
      if (enabled) {
        createOrUpdateTray();
      } else {
        destroyTray();
      }
    });

    // 监听语言变更，刷新托盘菜单文案 / Listen for language changes to refresh tray menu labels
    onLanguageChanged(() => {
      refreshTrayMenu();
    });

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

  // WebUI mode also needs ACP detection for remote agent access
  if (isWebUIMode) {
    await initializeAcpDetector();
  }

  if (!isResetPasswordMode) {
    // Preload shell environment and apply it to process.env so workers forked
    // later inherit the complete PATH (nvm, npm globals, .zshrc paths, etc.)
    // This ensures custom skills that depend on globally installed tools work correctly.
    void loadShellEnvironmentAsync().then((shellEnv) => {
      if (shellEnv.PATH) {
        process.env.PATH = mergePaths(process.env.PATH, shellEnv.PATH);
      }
      // Apply other shell env vars (SSL certs, auth tokens) that may be missing
      for (const [key, value] of Object.entries(shellEnv)) {
        if (key !== 'PATH' && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }

  // Verify CDP is ready and log status
  const { cdpPort, verifyCdpReady } = await import('./utils/configureChromium');
  if (cdpPort) {
    const cdpReady = await verifyCdpReady(cdpPort);
    if (cdpReady) {
      console.log(`[CDP] Remote debugging server ready at http://127.0.0.1:${cdpPort}`);
      console.log(`[CDP] MCP chrome-devtools: npx chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:${cdpPort}`);
    } else {
      console.warn(`[CDP] Warning: Remote debugging port ${cdpPort} not responding`);
    }
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
  // 当关闭到托盘启用时，不退出应用 / Don't quit when close-to-tray is enabled
  if (closeToTrayEnabled) {
    return;
  }
  // In WebUI mode, don't quit when windows are closed since we're running a web server
  if (!isWebUIMode && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!isWebUIMode && app.isReady()) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 从托盘恢复隐藏的窗口 / Restore hidden window from tray
      mainWindow.show();
      mainWindow.focus();
      if (process.platform === 'darwin' && app.dock) {
        void app.dock.show();
      }
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  isExplicitQuit = true;
  destroyTray();
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
