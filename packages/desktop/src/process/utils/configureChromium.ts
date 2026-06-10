/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, dialog } from 'electron';
import http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { getDevAppName } from '@/common/platform';
import { applyGpuRecoveryFlags } from './gpuRecovery';

// ============ Environment Separation ============
// Set app name before any getPath() call so userData is isolated from production.

// Portable mode: detected via PORTABLE marker file next to the executable.
// On first launch the user chooses where to store data:
//   - USB  drive → ./data/   (portable, takes data anywhere)
//   - This computer → system default AppData
// Choice is persisted in data-location next to PORTABLE.
export let portableChoicePending: { exeDir: string; choiceFile: string } | null = null;

if (!app.isPackaged) {
  const devAppName = getDevAppName();
  app.setName(devAppName);
  const appSupportDir = path.dirname(app.getPath('userData'));
  app.setPath('userData', path.join(appSupportDir, devAppName));
} else {
  let exeDir = path.dirname(app.getPath('exe'));
  if (process.platform === 'darwin' && exeDir.endsWith('Contents/MacOS')) {
    exeDir = path.dirname(path.dirname(path.dirname(exeDir)));
  }
  const portableMarker = path.join(exeDir, 'PORTABLE');
  if (fs.existsSync(portableMarker)) {
    const choiceFile = path.join(exeDir, 'data-location');
    const useUSB = (() => {
      if (fs.existsSync(choiceFile)) {
        try {
          const choice = JSON.parse(fs.readFileSync(choiceFile, 'utf-8'));
          return choice.location !== 'computer';
        } catch {
          /* corrupt → ask again */
        }
      }
      // No choice yet → default to USB, ask on first launch
      return true;
    })();

    if (useUSB) {
      const portableDataDir = path.join(exeDir, 'data');
      if (!fs.existsSync(portableDataDir)) {
        fs.mkdirSync(portableDataDir, { recursive: true });
      }
      const portableLogsDir = path.join(portableDataDir, 'logs');
      if (!fs.existsSync(portableLogsDir)) {
        fs.mkdirSync(portableLogsDir, { recursive: true });
      }
      app.setPath('userData', portableDataDir);
      app.setPath('logs', portableLogsDir);
    }

    // Defer storage choice dialog until app is ready
    if (!fs.existsSync(choiceFile)) {
      portableChoicePending = { exeDir, choiceFile };
    }
  }
}

/**
 * Whether this is the first time the app has been launched in this data directory.
 * Used to trigger the CLI auto-installation on first login instead of waiting for
 * manual intervention.
 */
export function isFirstRun(): boolean {
  try {
    const userData = app.getPath('userData');
    const marker = path.join(userData, '.first-run-done');
    return !fs.existsSync(marker);
  } catch {
    return false;
  }
}

export function markFirstRunDone(): void {
  try {
    const userData = app.getPath('userData');
    const marker = path.join(userData, '.first-run-done');
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
  } catch {
    /* best-effort */
  }
}

export async function showPortableStorageChoice(): Promise<void> {
  if (!portableChoicePending) return;
  const { exeDir, choiceFile } = portableChoicePending;
  portableChoicePending = null;

  const zh = app.getLocale().startsWith('zh');

  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'POUNDING',
    message: zh ? '请选择数据存储位置' : 'Where would you like to store your data?',
    detail: zh ? '包含聊天记录、设置、缓存等' : 'Includes chat history, settings, and cache.',
    buttons: zh ? ['这台电脑', 'U盘'] : ['This Computer', 'USB Drive'],
    defaultId: 1,
    cancelId: 0,
  });

  const choice = response === 1 ? 'usb' : 'computer';
  fs.writeFileSync(choiceFile, JSON.stringify({ location: choice }), 'utf-8');

  if (choice === 'computer') {
    dialog.showMessageBox({
      type: 'info',
      title: 'POUNDING',
      message: zh ? '下次启动生效' : 'The change will take effect on the next launch.',
      buttons: ['OK'],
    });
  }
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
// Registry file: ~/.pounding-cdp-registry.json
// ---------------------------------------------------------------------------

export const DEFAULT_CDP_PORT = 9230;
export const CDP_PORT_RANGE_START = 9230;
export const CDP_PORT_RANGE_END = 9250;
const CDP_REGISTRY_FILE = path.join(os.homedir(), '.pounding-cdp-registry.json');
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
    `[CDP] Port ${preferredPort} is occupied by another POUNDING instance, scanning range ${CDP_PORT_RANGE_START}-${CDP_PORT_RANGE_END}`
  );

  for (let p = CDP_PORT_RANGE_START; p <= CDP_PORT_RANGE_END; p++) {
    if (!usedPorts.has(p)) {
      console.log(`[CDP] Found available port from registry: ${p}`);
      return p;
    }
  }

  console.warn(
    `[CDP] All ports in range ${CDP_PORT_RANGE_START}-${CDP_PORT_RANGE_END} are used by active POUNDING instances, trying ${preferredPort}`
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
  const envVal = process.env.POUNDING_CDP_PORT;
  if (envVal === '0' || envVal === 'false') return null;
  if (envVal) {
    const parsed = Number(envVal);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return undefined;
}

/**
 * Determine if CDP should be enabled at startup.
 * Priority: env variable > config file > default (dev mode: true, production: false)
 */
function shouldEnableCdp(config: CdpConfig): boolean {
  const envVal = process.env.POUNDING_CDP_PORT;
  if (envVal === '0' || envVal === 'false') return false;
  if (envVal) return true;

  if (app.isPackaged) {
    return false;
  }

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
  app.commandLine.appendSwitch('remote-debugging-port', String(port));
  cdpPort = port;
  registerInstance(port);

  // Log CDP initialization
  console.log('[CDP] Chrome DevTools Protocol enabled');
  console.log(`[CDP] Remote debugging port: ${port}`);
  console.log(`[CDP] DevTools URL: http://127.0.0.1:${port}`);
  console.log('[CDP] MCP chrome-devtools connection: --browser-url=http://127.0.0.1:' + port);

  // Clean up registry on exit - handle multiple exit signals
  const cleanup = () => unregisterInstance();
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  // Handle Windows specific signals
  if (process.platform === 'win32') {
    process.on('SIGBREAK', cleanup);
  }
} else {
  console.log('[CDP] Chrome DevTools Protocol disabled');
}

/**
 * Verify CDP remote debugging is actually accessible after app starts.
 * Retries several times with delay to account for startup time.
 */
export async function verifyCdpReady(port: number, maxRetries = 5, retryDelay = 800): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 2000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(res.statusCode === 200 && data.length > 0));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    if (i < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, retryDelay));
    }
  }
  return false;
}

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
