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

export type NotificationKind = 'confirmation' | 'turnCompleted';

export type NotificationPayload = {
  body: string;
  conversationId?: string;
  kind: NotificationKind;
};

export type BrowserNotificationDeps = {
  /**
   * Whether a notification may be shown right now. The WebUI path derives this
   * from the browser gate (`shouldShowNotification`); the desktop path uses its
   * own condition (window focus is checked in the main process). Injecting the
   * predicate keeps this controller — and its turn-finish detection / dedup —
   * shared across both paths.
   */
  shouldShow: () => boolean;
  show: (payload: NotificationPayload) => void;
  bodyFor: (kind: NotificationKind) => string;
};

/**
 * Shape of a conversation response-stream message (`message.stream`). Both the
 * turn-finish and permission-request signals ride this single channel, keyed
 * by `type` — there is no separate `confirmation.add` / `turn.completed`
 * channel in a real conversation.
 */
export type StreamMessage = {
  type?: string;
  conversation_id?: string;
  turn_id?: string;
};

// Stream `type` values that represent an agent asking the user to confirm a
// permission. ACP emits `acp_permission`; aionrs emits both `acp_permission`
// and `permission`.
const PERMISSION_TYPES = new Set(['acp_permission', 'permission']);

export const createBrowserNotificationController = (deps: BrowserNotificationDeps) => {
  // Track the last turn we actually notified for, so repeated finish events
  // for the same turn don't fire duplicate notifications.
  let lastNotifiedTurnId: string | null = null;

  const onStreamMessage = (message: StreamMessage): void => {
    if (!message?.type) return;

    if (PERMISSION_TYPES.has(message.type)) {
      if (!deps.shouldShow()) return;
      deps.show({ body: deps.bodyFor('confirmation'), conversationId: message.conversation_id, kind: 'confirmation' });
      return;
    }

    if (message.type === 'finish') {
      if (message.turn_id && message.turn_id === lastNotifiedTurnId) return;
      if (!deps.shouldShow()) return;
      lastNotifiedTurnId = message.turn_id ?? null;
      deps.show({
        body: deps.bodyFor('turnCompleted'),
        conversationId: message.conversation_id,
        kind: 'turnCompleted',
      });
    }
  };

  return { onStreamMessage };
};
