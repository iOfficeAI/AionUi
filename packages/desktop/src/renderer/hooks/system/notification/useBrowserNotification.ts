/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { createBrowserNotificationController, type NotificationPermissionState } from './browserNotificationCore';

/**
 * WebUI-only: show a browser notification when an agent requests a
 * confirmation or finishes a turn, while the tab is hidden. No-op in
 * Electron, in non-secure contexts, or where the Notification API is absent.
 */
export const useBrowserNotification = (): void => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (isElectronDesktop()) return;
    if (typeof window === 'undefined' || !('Notification' in window) || !window.isSecureContext) return;

    const confirmationEmitter = ipcBridge.conversation.confirmation.add;
    const turnCompletedEmitter = ipcBridge.conversation.turnCompleted;
    if (!confirmationEmitter || !turnCompletedEmitter) return;

    const controller = createBrowserNotificationController({
      readGate: () => ({
        isElectron: isElectronDesktop(),
        hasNotificationApi: 'Notification' in window,
        isSecureContext: window.isSecureContext,
        permission: Notification.permission as NotificationPermissionState,
        settingEnabled: configService.get('system.notificationEnabled') !== false,
        documentHidden: document.hidden,
      }),
      bodyFor: (kind) =>
        kind === 'confirmation'
          ? t('settings.browserNotification.bodyConfirmation')
          : t('settings.browserNotification.bodyTurnCompleted'),
      show: ({ body, conversationId }) => {
        try {
          const notification = new Notification('AionUi', { body });
          notification.onclick = () => {
            window.focus();
            if (conversationId) void navigate(`/conversation/${conversationId}`);
            notification.close();
          };
        } catch (error) {
          console.error('[useBrowserNotification] Failed to show notification:', error);
        }
      },
    });

    const disposeConfirmation = confirmationEmitter.on(controller.onConfirmation);
    const disposeTurnCompleted = turnCompletedEmitter.on(controller.onTurnCompleted);
    return () => {
      disposeConfirmation();
      disposeTurnCompleted();
    };
  }, [navigate, t]);
};
