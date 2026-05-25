/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Platform detection utilities
 * 平台检测工具函数
 */

/**
 * Check if running in Electron desktop environment
 * 检测是否运行在 Electron 桌面环境
 */
export const isElectronDesktop = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
};

/**
 * Check if running on macOS
 * 检测是否运行在 macOS
 */
export const isMacOS = (): boolean => {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
};

/**
 * Check if running on Windows
 * 检测是否运行在 Windows
 */
export const isWindows = (): boolean => {
  return typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent);
};

/**
 * Check if running on Linux
 * 检测是否运行在 Linux
 */
export const isLinux = (): boolean => {
  return typeof navigator !== 'undefined' && /linux/i.test(navigator.userAgent);
};

const ASSET_PROTOCOL_PREFIX = 'aion-asset://asset/';

/**
 * Resolve an extension asset URL for the current environment.
 *
 * URL format: `aion-asset://asset/{extensionName}/{relativePathWithinExtension}`.
 * - Electron (dev or packaged): keep `aion-asset://` — the custom protocol handler
 *   in the main process serves the file via ExtensionRegistry.
 * - Browser (WebUI): rewrite to `/api/ext-asset/{extensionName}/{relPath}`, served
 *   by the webserver route that performs the same whitelist + escape checks.
 *
 * 将扩展资源 URL 转换为当前环境可用的地址
 */
export const resolveExtensionAssetUrl = (url: string | undefined): string | undefined => {
  if (!url) return url;

  if (isElectronDesktop()) return url;

  if (url.startsWith(ASSET_PROTOCOL_PREFIX)) {
    // aion-asset://asset/{ext}/{relPath...} — re-emit as /api/ext-asset/{ext}/{relPath}
    // Both sides are already %-encoded per segment, so pass through verbatim.
    return `/api/ext-asset/${url.slice(ASSET_PROTOCOL_PREFIX.length)}`;
  }

  return url;
};

/**
 * Open external URL in the appropriate context
 * - Electron: uses shell.openExternal via IPC (opens on local machine)
 * - WebUI: uses window.open in client browser (opens on remote client)
 *
 * 在适当的环境中打开外部链接
 * - Electron: 通过 IPC 调用 shell.openExternal（在本地机器打开）
 * - WebUI: 使用 window.open 在客户端浏览器打开（在远程客户端打开）
 */
export const openExternalUrl = async (url: string): Promise<void> => {
  if (!url) return;

  if (isElectronDesktop()) {
    const { ipcBridge } = await import('@/common');
    await ipcBridge.shell.openExternal.invoke(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};
