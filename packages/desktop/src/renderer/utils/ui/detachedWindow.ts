/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isWebUiBrowserMode } from '@/common/adapter/httpBridge';
import { buildDetachedConversationUrl } from '@/common/platform/detachedWindow';

const DETACHED_WINDOW_WIDTH = 1000;
const DETACHED_WINDOW_HEIGHT = 800;

type BrowserPopup = Pick<Window, 'closed' | 'focus'>;

export type DetachedWindowActionDependencies = {
  isWebUiBrowserMode: () => boolean;
  getCurrentUrl: () => string;
  openBrowserWindow: (url: string, target: string, features: string) => BrowserPopup | null;
  openElectronWindow: (
    conversationId: string
  ) => Promise<{ success: true } | { success: false; reason: 'window_open_failed' }>;
  focusElectronWindow: (conversationId: string) => Promise<boolean>;
  closeBrowserWindow: () => void;
  isBrowserWindowClosed: () => boolean;
  closeElectronWindow: () => Promise<void>;
};

export type DetachedWindowOpenFailure = 'popupBlocked' | 'windowOpenFailed';

export class DetachedWindowOpenError extends Error {
  constructor(public readonly reason: DetachedWindowOpenFailure) {
    super(reason);
    this.name = 'DetachedWindowOpenError';
  }
}

export type DetachedWindowActions = {
  openConversation: (conversationId: string) => Promise<void>;
  focusConversation: (conversationId: string) => Promise<boolean>;
  closeCurrentWindow: () => Promise<boolean>;
};

const popupTarget = (conversationId: string): string => `aionui-conversation-${encodeURIComponent(conversationId)}`;

/** Create platform actions with injectable edges for the browser-mode branch. */
export const createDetachedWindowActions = (dependencies: DetachedWindowActionDependencies): DetachedWindowActions => {
  const browserWindows = new Map<string, BrowserPopup>();

  const focusBrowserConversation = (conversationId: string): boolean => {
    const popup = browserWindows.get(conversationId);
    if (!popup) return false;
    if (popup.closed) {
      browserWindows.delete(conversationId);
      return false;
    }
    popup.focus();
    return true;
  };

  const openConversation = async (conversationId: string): Promise<void> => {
    if (!dependencies.isWebUiBrowserMode()) {
      const result = await dependencies.openElectronWindow(conversationId);
      if (!result.success) throw new DetachedWindowOpenError('windowOpenFailed');
      return;
    }
    if (focusBrowserConversation(conversationId)) return;

    const url = buildDetachedConversationUrl(dependencies.getCurrentUrl(), conversationId);
    const popup = dependencies.openBrowserWindow(
      url,
      popupTarget(conversationId),
      `popup=yes,width=${DETACHED_WINDOW_WIDTH},height=${DETACHED_WINDOW_HEIGHT}`
    );
    if (!popup) throw new DetachedWindowOpenError('popupBlocked');
    browserWindows.set(conversationId, popup);
  };

  const focusConversation = async (conversationId: string): Promise<boolean> => {
    if (dependencies.isWebUiBrowserMode()) return focusBrowserConversation(conversationId);
    return dependencies.focusElectronWindow(conversationId);
  };

  const closeCurrentWindow = async (): Promise<boolean> => {
    if (dependencies.isWebUiBrowserMode()) {
      dependencies.closeBrowserWindow();
      return dependencies.isBrowserWindowClosed();
    }
    await dependencies.closeElectronWindow();
    return true;
  };

  return { openConversation, focusConversation, closeCurrentWindow };
};

export const detachedWindowActions = createDetachedWindowActions({
  isWebUiBrowserMode,
  getCurrentUrl: () => window.location.href,
  openBrowserWindow: (url, target, features) => window.open(url, target, features),
  openElectronWindow: (conversationId) => ipcBridge.detachedWindow.open.invoke({ conversation_id: conversationId }),
  focusElectronWindow: (conversationId) => ipcBridge.detachedWindow.focus.invoke({ conversation_id: conversationId }),
  closeBrowserWindow: () => window.close(),
  isBrowserWindowClosed: () => window.closed,
  closeElectronWindow: () => ipcBridge.windowControls.close.invoke({ web_contents_id: null }),
});
