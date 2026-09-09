/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { isDetachedWindowSearch } from '@/common/platform/detachedWindow';
import { useLocation } from 'react-router-dom';
import { detachedWindowActions } from '@/renderer/utils/ui/detachedWindow';

/**
 * Hook to listen for notification click events from main process.
 * Navigates to the corresponding conversation page when a notification is clicked.
 */
export const useNotificationClick = (detachedWindow = false) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isDetached = detachedWindow || isDetachedWindowSearch(location.search);

  const handler = useCallback(
    (payload: { conversation_id?: string }) => {
      console.log('[useNotificationClick] Received notification click:', payload);
      if (isDetached) return;
      if (payload.conversation_id) {
        const conversationId = payload.conversation_id;
        void detachedWindowActions
          .focusConversation(conversationId)
          .catch(() => false)
          .then((focused) => {
            if (focused) return;
            console.log('[useNotificationClick] Navigating to conversation:', conversationId);
            void navigate(`/conversation/${conversationId}`);
          });
      } else {
        console.warn('[useNotificationClick] No conversation_id in payload');
      }
    },
    [isDetached, navigate]
  );

  useEffect(() => {
    console.log('[useNotificationClick] Registering notification click handler');
    return ipcBridge.notification.clicked.on(handler);
  }, [handler]);
};
