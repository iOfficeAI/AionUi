/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 窗口控制桥接模块
 * Window Controls Bridge Module
 *
 * 负责处理窗口的最小化、最大化、关闭等控制操作
 * Handles window minimize, maximize, close and other control operations
 */

import { BrowserWindow } from 'electron';
import { ipcBridge } from '@/common';
import { getCloseToTrayEnabled, getIsQuitting } from '@process/utils/tray';
import { getDetachedWindowRegistry } from '@process/services/detachedWindowRegistry';

/**
 * Resolve the window targeted by title-bar controls.
 * Prefer the focused window; fall back to the first live window so Linux
 * frameless close still works when focus is momentarily lost.
 */
function resolveControlWindow(webContentsId: number | null): BrowserWindow | null {
  if (webContentsId !== null) {
    const senderWindow = BrowserWindow.getAllWindows().find(
      (window) => !window.isDestroyed() && window.webContents.id === webContentsId
    );
    if (senderWindow) return senderWindow;
    return null;
  }
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    return focused;
  }
  const fallback = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
  return fallback ?? null;
}

/**
 * 为指定窗口注册最大化状态监听器
 * Register maximize state listeners for a specific window
 *
 * @param window - 要监听的 BrowserWindow 实例 / BrowserWindow instance to listen to
 */
export function registerWindowMaximizeListeners(window: BrowserWindow): void {
  // The emit is a broadcast to every renderer, so it carries the id of the
  // window it is about; a renderer that is not that window ignores it.
  const web_contents_id = window.webContents.id;

  // 当窗口最大化时通知渲染进程 / Notify renderer when window is maximized
  window.on('maximize', () => {
    ipcBridge.windowControls.maximizedChanged.emit({ is_maximized: true, web_contents_id });
  });

  // 当窗口取消最大化时通知渲染进程 / Notify renderer when window is unmaximized
  window.on('unmaximize', () => {
    ipcBridge.windowControls.maximizedChanged.emit({ is_maximized: false, web_contents_id });
  });
}

/**
 * 初始化窗口控制桥接
 * Initialize window controls bridge
 *
 * 注册 IPC 处理器以响应来自渲染进程的窗口控制请求
 * Register IPC handlers to respond to window control requests from renderer process
 */
export function initWindowControlsBridge(): void {
  ipcBridge.detachedWindow.open.provider(({ conversation_id }) => {
    try {
      getDetachedWindowRegistry().openConversation(conversation_id);
      return Promise.resolve({ success: true as const });
    } catch (error) {
      console.error('[AionUi] Failed to create detached conversation window:', error);
      return Promise.resolve({ success: false as const, reason: 'window_open_failed' as const });
    }
  });

  ipcBridge.detachedWindow.focus.provider(({ conversation_id }) =>
    Promise.resolve(getDetachedWindowRegistry().focusConversation(conversation_id))
  );

  // 最小化窗口 / Minimize window
  ipcBridge.windowControls.minimize.provider(({ web_contents_id }) => {
    const window = resolveControlWindow(web_contents_id);
    if (window) {
      window.minimize();
    }
    return Promise.resolve();
  });

  // 最大化窗口 / Maximize window
  ipcBridge.windowControls.maximize.provider(({ web_contents_id }) => {
    const window = resolveControlWindow(web_contents_id);
    if (window) {
      window.maximize();
    }
    return Promise.resolve();
  });

  // 取消最大化窗口 / Unmaximize window
  ipcBridge.windowControls.unmaximize.provider(({ web_contents_id }) => {
    const window = resolveControlWindow(web_contents_id);
    if (window) {
      window.unmaximize();
    }
    return Promise.resolve();
  });

  // 关闭窗口 / Close window
  // Custom title-bar close (Linux frameless, etc.) goes through this IPC path.
  // Honor close-to-tray here so we hide instead of destroying the window —
  // relying only on the BrowserWindow 'close' interceptor is not enough on
  // all Linux desktop environments when the close originates from renderer IPC.
  ipcBridge.windowControls.close.provider(({ web_contents_id }) => {
    const window = resolveControlWindow(web_contents_id);
    if (!window) {
      return Promise.resolve();
    }
    if (!getDetachedWindowRegistry().isDetachedWindow(window) && getCloseToTrayEnabled() && !getIsQuitting()) {
      window.hide();
    } else {
      window.close();
    }
    return Promise.resolve();
  });

  // 获取窗口是否最大化状态 / Get window maximized state
  ipcBridge.windowControls.isMaximized.provider(({ web_contents_id }) => {
    const window = resolveControlWindow(web_contents_id);
    return Promise.resolve(window?.isMaximized() ?? false);
  });

  // 为所有已存在的窗口注册监听器 / Register listeners for all existing windows
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach((window) => {
    registerWindowMaximizeListeners(window);
  });
}
