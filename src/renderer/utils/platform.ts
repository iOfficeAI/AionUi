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

/**
 * Resolve an extension asset URL for the current environment.
 * - In Electron desktop: `aion-asset://` protocol works natively, returned as-is.
 * - In a regular browser (WebUI): converts `aion-asset://asset/{path}` to
 *   `/api/ext-asset?path={encodedPath}` which is served by the Express server.
 *
 * 将扩展资源 URL 转换为当前环境可用的地址
 */
export const resolveExtensionAssetUrl = (url: string | undefined): string | undefined => {
  if (!url) return url;
  if (!url.startsWith('aion-asset://asset/')) return url;
  if (isElectronDesktop()) return url; // native protocol works in Electron renderer
  const absPath = url.slice('aion-asset://asset/'.length);
  return `/api/ext-asset?path=${encodeURIComponent(absPath)}`;
};
