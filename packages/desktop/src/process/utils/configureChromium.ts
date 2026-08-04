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
// Agent browser control (CDP) — user-facing on/off switch and its persisted config.
//
// This block no longer allocates a port. The single-target bridge (cdpBridge.ts) binds an
// OS-assigned ephemeral port via listen(0) and backfills it here through setActiveCdpPort,
// so there is exactly one port concept in the codebase: the one you can actually connect to.
//
// The 9230-9250 reservation and the ~/.aionui-cdp-registry.json instance registry were
// removed with Chromium's application-wide remote-debugging-port switch. Once that switch
// was gone nothing listened on that range, so the registry tracked a service that did not
// exist, multi-instance avoidance was avoiding phantoms, and — worst of all — the settings
// page displayed the reserved number as "the current CDP port" and built copy-pasteable MCP
// config from it, handing users an address that could never connect.
//
// Do not move the bridge onto a fixed port to bring that bookkeeping back: the ephemeral
// port is the only real barrier against same-user local processes, because the token leaks
// through the unauthenticated discovery endpoint (see the threat model note in cdpBridge.ts).
//
// Configuration file: userData/cdp.config.json
// - enabled: boolean - whether agent browser control is enabled (default: on)
// - port: number - legacy preferred-port field, retained for config compatibility
//
// Override via AIONUI_CDP_PORT env variable. Set to "0" or "false" to disable.
// ---------------------------------------------------------------------------

const CDP_CONFIG_FILE = 'cdp.config.json';

/** CDP configuration stored in userData directory */
export interface CdpConfig {
  /** Whether CDP is enabled (default: true in dev mode, false in production) */
  enabled?: boolean;
  /**
   * 历史字段：以前用来挑保留端口。通道改用 listen(0) 之后不再读它，
   * 但保留在类型里，这样老配置文件不会因为多一个未知键而出问题。
   *
   * Legacy field that used to pick a reserved port. Unread since the bridge moved to
   * listen(0), but kept in the type so existing config files do not trip over an
   * unrecognised key.
   */
  port?: number;
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
  /** Whether the app is running in development mode */
  isDevMode: boolean;
}

/**
 * 顺手删掉遗留的实例注册表文件。
 *
 * 这个文件（~/.aionui-cdp-registry.json）以前记录「每个实例占了哪个 CDP 端口」。相关逻辑
 * 已随应用级 remote-debugging-port 一起删除，但升级上来的机器上文件还在，里面是一堆早已
 * 无效的 pid/端口。留着只会让人以为还有这套机制，所以清掉。best-effort，失败无所谓。
 *
 * Remove the leftover instance-registry file. ~/.aionui-cdp-registry.json used to record
 * which CDP port each instance had taken; that logic went away with the application-wide
 * remote-debugging-port switch, but upgraded machines still have the file sitting there full
 * of long-dead pids and ports. Leaving it implies the mechanism still exists, so clean it up.
 * Best-effort: failure is harmless.
 */
function removeLegacyCdpRegistryFile(): void {
  try {
    const legacyRegistry = path.join(os.homedir(), '.aionui-cdp-registry.json');
    if (fs.existsSync(legacyRegistry)) {
      fs.unlinkSync(legacyRegistry);
    }
  } catch {
    // Nothing depends on this succeeding.
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
 * Determine if CDP should be enabled at startup.
 * Priority: env variable > config file > default (enabled).
 *
 * 默认开启（含正式版）：应用内浏览器要让 Agent 操作，就必须有这条通道，否则
 * 「装好即可用」不成立。通道只绑 127.0.0.1，不对外暴露；用户仍可在设置里关掉，
 * 关掉后 Agent 就无法操作浏览器（此时 MCP 启动器会拒绝启动，不会偷偷开一个
 * 用户看不见的 Chrome）。
 *
 * AIONUI_CDP_PORT 现在只当开关用（"0"/"false" 关闭，其它非空值开启）。它的数值不再
 * 决定端口 —— 通道走 listen(0)，端口由系统分配。名字保留是为了不破坏既有脚本和 E2E 夹具。
 *
 * Enabled by default, production included: the in-app browser cannot be driven by the agent
 * without this bridge, so "works out of the box" would otherwise fail. The bridge binds to
 * 127.0.0.1 only and is never externally reachable. Users can still turn it off in settings,
 * after which the agent simply cannot drive the browser (the MCP launcher refuses to start
 * rather than quietly opening a Chrome the user cannot see).
 *
 * AIONUI_CDP_PORT now acts purely as a switch ("0"/"false" disables, any other non-empty
 * value enables). Its numeric value no longer selects a port — the bridge uses listen(0) and
 * the OS assigns one. The name is kept so existing scripts and E2E fixtures keep working.
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
 * 通道的实际监听端口，由 cdpBridge 启动后回填；未启用/未起来时为 null。
 *
 * 刻意不再在这里预留 9230-9250 段的端口号。移除 remote-debugging-port 之后那个号段
 * 没有任何进程监听，findAvailablePort/registerInstance 追踪的是一个不存在的服务：
 * 多实例避让失去意义，而设置页把它显示成「当前 CDP 端口」、还据此生成可复制的 MCP 配置，
 * 等于给用户一个连不上的地址。通道走 listen(0)（这也是本机唯一真实屏障，见 cdpBridge.ts
 * 的威胁模型说明），所以真实端口只可能在桥起来之后才知道 —— 由它回填这里，全局只保留
 * 一个端口概念。
 *
 * The bridge's real listening port, backfilled by cdpBridge once it starts; null while agent
 * browser control is off or the bridge has not come up.
 *
 * Deliberately no longer reserves a port from the 9230-9250 range here. With
 * remote-debugging-port gone nothing listens on that range, so findAvailablePort /
 * registerInstance were tracking a service that does not exist: multi-instance avoidance
 * became meaningless, while the settings page displayed it as "the current CDP port" and
 * generated copy-pasteable MCP config from it — handing the user an address that cannot be
 * reached. The bridge uses listen(0) (also the only real local barrier — see the threat model
 * note in cdpBridge.ts), so the real port is only knowable after it starts. It backfills this
 * value, leaving exactly one port concept in the codebase.
 */
export let cdpPort: number | null = null;

/** Called by cdpBridge once it is listening, so status/UI report the reachable port. */
export function setActiveCdpPort(port: number | null): void {
  cdpPort = port;
}

/** Whether CDP was enabled at startup (requires restart to change). */
export let cdpStartupEnabled: boolean = false;

// Load config and initialize CDP at startup
const cdpConfig = loadCdpConfig();
cdpStartupEnabled = shouldEnableCdp(cdpConfig);

if (cdpStartupEnabled) {
  /**
   * 刻意不再调用 appendSwitch('remote-debugging-port', ...)。
   *
   * Chromium 那个开关是应用级的，没有 per-target ACL：一开就把每个 WebContents 都
   * 暴露出去，包括挂着 preload 桥的主窗口，而且不需要任何认证。本机任意进程连上去就能
   * 驱动整个应用。
   *
   * 改由 cdpBridge 只暴露侧边浏览器那一个 webContents。端口与 env 的写入都移到桥启动处
   * （见 index.ts），这里只负责判断「用户是否开启了这个能力」。
   *
   * Deliberately no longer calls appendSwitch('remote-debugging-port', ...). That switch is
   * application-wide with no per-target ACL: it exposes every WebContents — including the
   * main window with its preload bridge — with no authentication, so any local process can
   * drive the whole app. cdpBridge exposes only the in-app browser webview instead. Port
   * allocation and env publication now live where the bridge starts (see index.ts); this
   * block only decides whether the user enabled the capability at all.
   */
  console.log('[CDP] Agent browser control enabled (single-target bridge)');
} else {
  console.log('[CDP] Agent browser control disabled');
}

// 无论开关状态如何都清一次：关掉这个能力的用户同样不该留着那个失效文件。
// Runs regardless of the switch: users who turned the capability off should not be left
// with the stale file either.
removeLegacyCdpRegistryFile();

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
 * Get current CDP status for display in UI.
 */
export function getCdpStatus(): CdpStatus {
  const config = loadCdpConfig();
  return {
    /**
     * enabled 表示「通道真的起来了、连得上」，所以看 cdpPort 而不是配置：
     * 配置开着但桥启动失败时，UI 不该说它是启用的。
     *
     * `enabled` means the bridge is actually up and reachable, so it reads cdpPort rather
     * than the config: with the setting on but bridge startup failed, the UI must not claim
     * the capability is active.
     */
    enabled: cdpPort !== null,
    port: cdpPort,
    startupEnabled: cdpStartupEnabled,
    configEnabled: config.enabled ?? cdpStartupEnabled,
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
