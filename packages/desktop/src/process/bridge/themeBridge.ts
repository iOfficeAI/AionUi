/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 主题桥接模块
 * Theme Bridge Module
 *
 * 主进程作为哑中继：缓存渲染进程发布的已解析 Theme 对象，
 * 并通过 changed 事件将其广播给所有窗口。
 * Main process acts as a dumb relay: caches the resolved Theme published by a
 * renderer via setActive, and re-broadcasts it to all windows via changed.
 */

import { ipcBridge } from '@/common';
import type { Theme } from '@/common/theme/types';

let cachedTheme: Theme | null = null;
type ThemeListener = (t: Theme) => void;
const listeners = new Set<ThemeListener>();

export function getCachedTheme(): Theme | null {
  return cachedTheme;
}

export function onThemeChanged(listener: ThemeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 初始化主题桥接
 * Initialize theme bridge
 *
 * 注册 IPC 处理器以缓存并转发主题变更
 * Register IPC handlers to cache and relay theme changes
 */
export function initThemeBridge(): void {
  // Renderer publishes a resolved theme → cache it and re-broadcast to all windows.
  ipcBridge.theme.setActive.provider(async (resolved: Theme) => {
    cachedTheme = resolved;
    ipcBridge.theme.changed.emit(resolved);
    listeners.forEach((l) => l(resolved));
  });

  // A freshly-loaded window (e.g. pet) pulls the current theme on load.
  ipcBridge.theme.requestCurrent.provider(async () => cachedTheme);
}
