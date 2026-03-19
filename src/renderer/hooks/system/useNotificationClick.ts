/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';

/**
 * Hook to listen for notification click events from main process.
 * Navigates to the corresponding conversation page when a notification is clicked.
 */
export const useNotificationClick = () => {
  const navigate = useNavigate();

  const handler = useCallback(
    (payload: { conversationId?: string }) => {
      console.log('[useNotificationClick] Received notification click:', payload);
      if (payload.conversationId) {
        // Navigate to the conversation page / 导航到会话页面
        console.log('[useNotificationClick] Navigating to conversation:', payload.conversationId);
        void navigate(`/conversation/${payload.conversationId}`);
      } else {
        console.warn('[useNotificationClick] No conversationId in payload');
      }
    },
    [navigate]
  );

  useEffect(() => {
    console.log('[useNotificationClick] Registering notification click handler');
    return ipcBridge.notification.clicked.on(handler);
  }, [handler]);
};
