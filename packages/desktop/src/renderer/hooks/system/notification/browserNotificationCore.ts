/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Framework-free core for WebUI browser notifications: pure gating and a
 * controller that turns conversation events into notification payloads.
 * Kept free of React / DOM globals so it is unit-testable in the node project.
 */

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

export type NotificationGate = {
  isElectron: boolean;
  hasNotificationApi: boolean;
  isSecureContext: boolean;
  permission: NotificationPermissionState;
  settingEnabled: boolean;
  documentHidden: boolean;
};

export const shouldShowNotification = (gate: NotificationGate): boolean =>
  !gate.isElectron &&
  gate.hasNotificationApi &&
  gate.isSecureContext &&
  gate.permission === 'granted' &&
  gate.settingEnabled &&
  gate.documentHidden;

export type NotificationPayload = {
  body: string;
  conversationId?: string;
};

export type BrowserNotificationDeps = {
  readGate: () => NotificationGate;
  show: (payload: NotificationPayload) => void;
  bodyFor: (kind: 'confirmation' | 'turnCompleted') => string;
};

export const createBrowserNotificationController = (deps: BrowserNotificationDeps) => {
  // Track the last turn we actually notified for, so repeated finished events
  // for the same turn don't fire duplicate notifications.
  let lastNotifiedTurnId: string | null = null;

  const onConfirmation = (event: { conversation_id?: string }): void => {
    if (!shouldShowNotification(deps.readGate())) return;
    deps.show({ body: deps.bodyFor('confirmation'), conversationId: event.conversation_id });
  };

  const onTurnCompleted = (event: { status?: string; session_id?: string; turn_id?: string }): void => {
    if (event.status !== 'finished') return;
    if (event.turn_id && event.turn_id === lastNotifiedTurnId) return;
    if (!shouldShowNotification(deps.readGate())) return;
    lastNotifiedTurnId = event.turn_id ?? null;
    deps.show({ body: deps.bodyFor('turnCompleted'), conversationId: event.session_id });
  };

  return { onConfirmation, onTurnCompleted };
};
