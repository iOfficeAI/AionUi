/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';

/**
 * Subscribes to `ipcBridge.devBrowser.openInternal` and navigates to the DevBrowser
 * page when an agent tool (`aionui_open_internal_browser`) asks for it.
 *
 * Mounted at app layout level so the listener is active regardless of which route
 * the user is currently viewing.
 */
export function useDevBrowserBridge(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = ipcBridge.devBrowser.openInternal.on(({ conversationId, url }) => {
      if (!url) return;
      const params = new URLSearchParams();
      if (conversationId) params.set('from', conversationId);
      params.set('url', url);
      void navigate(`/devbrowser?${params.toString()}`);
    });
    return unsubscribe;
  }, [navigate]);
}
