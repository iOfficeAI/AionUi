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

const shouldKeepAssetProtocolInElectron = (): boolean => {
  if (!isElectronDesktop() || typeof window === 'undefined') return false;
  const protocol = window.location.protocol;
  return protocol === 'http:' || protocol === 'https:';
};

const getAssetAbsolutePath = (url: string): string | undefined => {
  if (!url.startsWith(ASSET_PROTOCOL_PREFIX)) return undefined;

  let absPath = decodeURIComponent(url.slice(ASSET_PROTOCOL_PREFIX.length));
  if (/^\/[A-Za-z]:/.test(absPath)) {
    absPath = absPath.slice(1);
  }
  return absPath;
};

const toFileUrl = (absPath: string): string => {
  const normalized = absPath.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }
  return `file://${encodeURI(normalized)}`;
};

/**
 * Resolve an extension asset URL for the current environment.
 * - In Electron dev / any HTTP(S)-served renderer: keep `aion-asset://` because direct `file://` is blocked.
 * - In Electron packaged / local-protocol renderers: convert `aion-asset://asset/{path}` to `file://` for reliable image loading.
 * - In a regular browser (WebUI): convert `aion-asset://asset/{path}` to `/api/ext-asset?path={encodedPath}`.
 *
 * 将扩展资源 URL 转换为当前环境可用的地址
 */
export const resolveExtensionAssetUrl = (url: string | undefined): string | undefined => {
  if (!url) return url;

  const absPath = getAssetAbsolutePath(url);

  if (isElectronDesktop()) {
    if (absPath && !shouldKeepAssetProtocolInElectron()) {
      return toFileUrl(absPath);
    }
    return url;
  }

  if (absPath) {
    return `/api/ext-asset?path=${encodeURIComponent(absPath)}`;
  }

  // WebUI: file:///{absPath} -> /api/ext-asset
  if (url.startsWith('file://')) {
    let filePath = decodeURIComponent(url.replace(/^file:\/\/\/?/, ''));
    // On Windows, file:///C:/path → C:/path (strip leading / before drive letter)
    if (/^\/[A-Za-z]:/.test(filePath)) {
      filePath = filePath.slice(1);
    }
    return `/api/ext-asset?path=${encodeURIComponent(filePath)}`;
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
