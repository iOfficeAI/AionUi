/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { getDevAppName } from '@/common/platform';
import { applyGpuRecoveryFlags } from './gpuRecovery';

// ============ E2E test isolation ============
// When running under E2E with an explicit sandbox dir, redirect userData there
// BEFORE any getPath() call so the whole data tree (config, aioncore DB, logs)
// lives in a disposable directory. This keeps tests off the developer's real
// database — critical because AionCore refuses to boot when a shared DB fails
// migration. Guarded by AIONUI_E2E_TEST so it never affects dev/production.
// 仅 E2E：把 userData 指向一次性沙箱目录，避免测试读写真实数据库。
const e2eUserDataDir = process.env.AIONUI_E2E_TEST === '1' ? process.env.AIONUI_E2E_USER_DATA_DIR : undefined;
if (e2eUserDataDir && e2eUserDataDir.trim() !== '') {
  fs.mkdirSync(e2eUserDataDir, { recursive: true });
  app.setPath('userData', e2eUserDataDir);
}

// ============ Environment Separation ============
// Set app name before any getPath() call so userData is isolated from production.
// Note: getPlatformServices() auto-registration also applies this as a safety net
// in case Rollup loads initStorage's chunk before this module runs.
// 开发模式下设置独立 app 名称，userData 目录将与正式版隔离，允许同时运行
// E2E 沙箱已显式设置 userData 时跳过，避免被 dev app 名覆盖。
if (!app.isPackaged && !e2eUserDataDir) {
  const devAppName = getDevAppName();
  app.setName(devAppName);
  // In Electron 28+, setName alone no longer updates userData path on macOS.
  // Explicitly override userData to the dev directory.
  const appSupportDir = path.dirname(app.getPath('userData'));
  app.setPath('userData', path.join(appSupportDir, devAppName));
}

// app.disableHardwareAcceleration() must run before app is ready.
applyGpuRecoveryFlags();

// Configure Chromium command-line flags for WebUI and CLI modes
// 为 WebUI 和 CLI 模式配置 Chromium 命令行参数

const isWebUI = process.argv.some((arg) => arg === '--webui');
const isResetPassword = process.argv.includes('--resetpass');

// Only configure flags for WebUI and --resetpass modes
// 仅为 WebUI 和重置密码模式配置参数
if (isWebUI || isResetPassword) {
  // In WebUI/reset-password mode on Linux, force headless Ozone backend.
  // This mode should never depend on X11/Wayland availability.
  // 在 Linux 的 WebUI/重置密码模式下，强制使用 headless Ozone 后端，
  // 避免因 DISPLAY 变量存在但显示服务不可用导致平台初始化失败。
  // Note: Do NOT use --headless (browser automation mode that causes auto-exit).
  // Instead, use --ozone-platform=headless which provides a proper display backend
  // without requiring a display server, keeping the Electron process alive.
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('ozone-platform', 'headless');
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
  }

  // For root user, disable sandbox to prevent crash
  // 对于 root 用户，禁用沙箱以防止崩溃
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    app.commandLine.appendSwitch('no-sandbox');
  }
}

// ---------------------------------------------------------------------------
// Chrome DevTools Protocol (CDP) — enable remote debugging
// so chrome-devtools-mcp and other CDP clients can connect to this Electron app.
//
// Default port: 9230 (avoids conflict with common CDP ports).
// Override via AIONUI_CDP_PORT env variable. Set to "0" to disable.
//
// Configuration file: userData/cdp.config.json
// - enabled: boolean - whether CDP is enabled (default: true in dev mode, false in production)
// - port: number - preferred port (will find available port if occupied)
//
// Multi-instance support: a file-based registry tracks all active instances
// so each one gets a unique port and MCP tools can discover them all.
// Registry file: ~/.aionui-cdp-registry.json
// ---------------------------------------------------------------------------

export const DEFAULT_CDP_PORT = 9230;
export const CDP_PORT_RANGE_START = 9230;
export const CDP_PORT_RANGE_END = 9250;
const CDP_REGISTRY_FILE = path.join(os.homedir(), '.aionui-cdp-registry.json');
const CDP_CONFIG_FILE = 'cdp.config.json';

/** CDP configuration stored in userData directory */
export interface CdpConfig {
  /** Whether CDP is enabled (default: true in dev mode, false in production) */
  enabled?: boolean;
  /** Preferred port number (default: 9230) */
  port?: number;
}

/** CDP registry entry for multi-instance tracking */
interface CdpRegistryEntry {
  pid: number;
  port: number;
  cwd: string;
  startTime: number;
}

/** CDP status information exposed to renderer */
export interface CdpStatus {
  /** Whether CDP is currently enabled */
  enabled: boolean;
  /** Current CDP port (null if disabled or not started) */
  port: number | null;
  /** Whether CDP was enabled at startup (requires restart to change) */
  startupEnabled: boolean;
  /** Whether CDP is enabled in the persisted config file (may differ from runtime) */
  configEnabled: boolean;
  /** All active CDP instances from registry */
  instances: CdpRegistryEntry[];
  /** Whether the app is running in development mode */
  isDevMode: boolean;
}

/** Read the CDP registry file, returning an empty array on any error. */
function readRegistry(): CdpRegistryEntry[] {
  try {
    if (!fs.existsSync(CDP_REGISTRY_FILE)) return [];
    const raw = fs.readFileSync(CDP_REGISTRY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Write the CDP registry file atomically. */
function writeRegistry(entries: CdpRegistryEntry[]): void {
  try {
    fs.writeFileSync(CDP_REGISTRY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch {
    // Non-critical — log but don't crash
    console.warn('[CDP] Failed to write CDP registry file');
  }
}

/** Check if a process is still alive by sending signal 0. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Remove dead-process entries from the registry and return live ones. */
function pruneRegistry(): CdpRegistryEntry[] {
  const entries = readRegistry();
  const alive = entries.filter((e) => isProcessAlive(e.pid));
  if (alive.length !== entries.length) {
    writeRegistry(alive);
  }
  return alive;
}

/** Find the first available port not occupied by a live registry entry. */
function findAvailablePort(preferredPort: number): number {
  const liveEntries = pruneRegistry();
  const usedPorts = new Set(liveEntries.map((e) => e.port));

  if (!usedPorts.has(preferredPort)) {
    return preferredPort;
  }

  console.log(
    `[CDP] Port ${preferredPort} is occupied by another AionUi instance, scanning range ${CDP_PORT_RANGE_START}-${CDP_PORT_RANGE_END}`
  );

  for (let p = CDP_PORT_RANGE_START; p <= CDP_PORT_RANGE_END; p++) {
    if (!usedPorts.has(p)) {
      console.log(`[CDP] Found available port from registry: ${p}`);
      return p;
    }
  }

  console.warn(
    `[CDP] All ports in range ${CDP_PORT_RANGE_START}-${CDP_PORT_RANGE_END} are used by active AionUi instances, trying ${preferredPort}`
  );
  return preferredPort;
}

/** Register the current process in the CDP registry. */
function registerInstance(port: number): void {
  const entries = pruneRegistry();
  // Remove any stale entry for our own PID (e.g. from a previous crash)
  const filtered = entries.filter((e) => e.pid !== process.pid);
  filtered.push({
    pid: process.pid,
    port,
    cwd: process.cwd(),
    startTime: Date.now(),
  });
  writeRegistry(filtered);
}

/** Remove the current process from the CDP registry. */
export function unregisterInstance(): void {
  try {
    const entries = readRegistry();
    const filtered = entries.filter((e) => e.pid !== process.pid);
    writeRegistry(filtered);
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Load CDP configuration from userData directory.
 * This must be called before app.ready, so we use synchronous file operations.
 */
function loadCdpConfig(): CdpConfig {
  try {
    // Try to get userData path - this works even before app.ready
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, CDP_CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
      return {};
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as CdpConfig;
    }
  } catch {
    // Ignore errors when loading config
  }
  return {};
}

/**
 * Save CDP configuration to userData directory.
 */
export function saveCdpConfig(config: CdpConfig): void {
  try {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, CDP_CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[CDP] Failed to save CDP config:', error);
  }
}

/**
 * Resolve CDP port from environment variable.
 * Returns null if explicitly disabled via env.
 */
function resolveCdpPortFromEnv(): number | null | undefined {
  const envVal = process.env.AIONUI_CDP_PORT;
  if (envVal === '0' || envVal === 'false') return null;
  if (envVal) {
    const parsed = Number(envVal);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return undefined;
}

/**
 * Determine if CDP should be enabled at startup.
 * Priority: env variable > config file > default (enabled).
 *
 * 默认开启（含正式版）：应用内浏览器要让 Agent 操作，就必须有 CDP 端口，否则
 * 「装好即可用」不成立。端口只绑 127.0.0.1，不对外暴露；用户仍可在设置里关掉，
 * 关掉后 Agent 就无法操作浏览器（此时 MCP 启动器会拒绝启动，不会偷偷开一个
 * 用户看不见的 Chrome）。
 *
 * Enabled by default, production included: the in-app browser cannot be driven by
 * the agent without a CDP port, so "works out of the box" would otherwise fail.
 * The port binds to 127.0.0.1 only and is never externally reachable. Users can
 * still turn it off in settings, after which the agent simply cannot drive the
 * browser (the MCP launcher refuses to start rather than quietly opening a Chrome
 * the user cannot see).
 */
function shouldEnableCdp(config: CdpConfig): boolean {
  const envVal = process.env.AIONUI_CDP_PORT;
  if (envVal === '0' || envVal === 'false') return false;
  if (envVal) return true;

  if (config.enabled !== undefined) {
    return config.enabled;
  }

  return true;
}

/**
 * Determine preferred CDP port.
 * Priority: env variable > config file > default (9230)
 */
function getPreferredPort(config: CdpConfig): number {
  // Environment variable takes highest priority
  const envPort = resolveCdpPortFromEnv();
  if (envPort !== null && envPort !== undefined) {
    return envPort;
  }

  // Config file setting
  if (config.port && Number.isFinite(config.port) && config.port > 0) {
    return config.port;
  }

  return DEFAULT_CDP_PORT;
}

/** The active CDP port, or null if remote debugging is disabled. */
export let cdpPort: number | null = null;

/** Whether CDP was enabled at startup (requires restart to change). */
export let cdpStartupEnabled: boolean = false;

// Load config and initialize CDP at startup
const cdpConfig = loadCdpConfig();
cdpStartupEnabled = shouldEnableCdp(cdpConfig);

if (cdpStartupEnabled) {
  const preferredPort = getPreferredPort(cdpConfig);
  const port = findAvailablePort(preferredPort);
  /**
   * 刻意不再调用 appendSwitch('remote-debugging-port', ...)。
   *
   * Chromium 那个开关是应用级的，没有 per-target ACL：一开就把每个 WebContents 都
   * 暴露出去，包括挂着 preload 桥的主窗口，而且不需要任何认证。本机任意进程连上去就能
   * 驱动整个应用。
   *
   * 改由 cdpBridge 只暴露侧边浏览器那一个 webContents，并且要求口令。这里保留端口号
   * 与实例注册，是为了「同一台机器上多开实例互不打扰」这套既有逻辑继续成立，也让设置
   * 里的端口显示不变。
   *
   * Deliberately no longer calls appendSwitch('remote-debugging-port', ...). That switch
   * is application-wide with no per-target ACL: it exposes every WebContents — including
   * the main window with its preload bridge — with no authentication, so any local
   * process can drive the whole app. cdpBridge exposes only the in-app browser webview
   * and requires a token instead. The port number and instance registration are kept so
   * the existing multi-instance bookkeeping and the settings display keep working.
   */
  cdpPort = port;
  registerInstance(port);

  /**
   * 把实际端口写回自己的 process.env。
   *
   * 这是端口传给 Agent 的关键一环：aioncore 是 Electron 主进程的子进程（继承
   * process.env），内置浏览器 MCP 又是 aioncore 的子进程，于是端口顺着继承链一路
   * 传到最里层，不需要把它写进任何配置或数据库记录。多开实例时每个进程树各自继承
   * 自己的端口，天然不会串。
   *
   * 刻意用与 AIONUI_CDP_PORT 不同的变量名：那个是「用户输入」，优先级高于配置文件。
   * 如果把实际端口写回同一个名字，用户在设置里关掉 CDP 再点应用内重启，
   * app.relaunch() 继承的 env 里带着端口，子进程会把它当成用户要求开启，
   * 于是刚写下的「关闭」被自己悄悄覆盖。两个用途必须分开。
   *
   * Write the resolved port back into our own process.env. This is how the port
   * reaches the agent: aioncore is a child of the Electron main process (and
   * inherits process.env), and the built-in browser MCP is a child of aioncore, so
   * the port travels down the inheritance chain with nothing written to config or
   * the database. With several instances running, each process tree inherits its
   * own port, so they cannot cross over.
   *
   * Deliberately a *different* name from AIONUI_CDP_PORT, which is user input and
   * outranks the config file. Writing the live port back into that same name would
   * mean: user disables CDP in settings, clicks in-app restart, app.relaunch()
   * inherits the env, and the child reads the inherited port as "the user asked for
   * CDP" — silently overriding the setting just saved. The two meanings must stay
   * separate.
   */
  process.env.AIONUI_CDP_ACTIVE_PORT = String(port);

  // Log CDP initialization
  console.log('[CDP] Agent browser control enabled (single-target bridge)');
  console.log(`[CDP] Reserved port: ${port}`);

  // Clean up registry on exit - handle multiple exit signals
  const cleanup = () => unregisterInstance();
  process.on('exit', cleanup);
  /**
   * 注册 SIGINT/SIGTERM 处理器会顶掉 Node 默认的「收到信号就退出」行为，
   * 所以清理完必须自己退，否则 Ctrl-C 只会清理注册表、应用继续跑着不退出。
   *
   * Registering a SIGINT/SIGTERM handler replaces Node's default terminate-on-signal
   * behaviour, so the process must exit itself afterwards — otherwise Ctrl-C prunes
   * the registry and leaves the app running.
   */
  const cleanupAndExit = (signal: NodeJS.Signals) => {
    cleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);
  // Handle Windows specific signals
  if (process.platform === 'win32') {
    process.on('SIGBREAK', cleanupAndExit);
  }
} else {
  console.log('[CDP] Chrome DevTools Protocol disabled');
}

/**
 * verifyCdpReady 已随 remote-debugging-port 一并移除。
 *
 * 它探测的是 Chromium 那个应用级端口的 /json/version；现在没有进程在那个端口上监听，
 * 留着只会让启动日志报一个必然失败的警告。单目标通道的就绪与否由 startCdpBridge()
 * 的返回值直接体现，不需要再探测。
 *
 * verifyCdpReady was removed together with remote-debugging-port. It probed
 * /json/version on Chromium's application-wide port, where nothing listens any more, so
 * keeping it would only emit a warning that can never succeed. Bridge readiness is now
 * evident from startCdpBridge()'s return value, with no probing required.
 */

/**
 * Get all live CDP instances from the registry.
 * Prunes dead entries automatically.
 */
export function getActiveCdpInstances(): CdpRegistryEntry[] {
  return pruneRegistry();
}

/**
 * Get current CDP status for display in UI.
 */
export function getCdpStatus(): CdpStatus {
  const config = loadCdpConfig();
  return {
    enabled: cdpPort !== null,
    port: cdpPort,
    startupEnabled: cdpStartupEnabled,
    configEnabled: config.enabled ?? cdpStartupEnabled,
    instances: getActiveCdpInstances(),
    isDevMode: !app.isPackaged,
  };
}

/**
 * Update CDP configuration and save to disk.
 * Note: Changing the enabled state requires app restart to take effect.
 */
export function updateCdpConfig(newConfig: Partial<CdpConfig>): CdpConfig {
  const currentConfig = loadCdpConfig();
  const updatedConfig = { ...currentConfig, ...newConfig };
  saveCdpConfig(updatedConfig);
  return updatedConfig;
}
