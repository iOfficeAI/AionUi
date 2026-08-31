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

/**
 * Max length of a conversation name embedded in a turn-completed notification.
 * The name sits at the front of the body, so anything longer is truncated with
 * a trailing ellipsis (keep the beginning, where the title's meaning is). Kept
 * as a constant so it is easy to tune in one place.
 */
export const CONVERSATION_NAME_MAX_LENGTH = 20;

/**
 * Trim a conversation name and cap it at `maxLength`, appending an ellipsis when
 * it overflows. Keeps the leading characters (front-loaded titles read best).
 */
export const truncateConversationName = (name: string, maxLength: number = CONVERSATION_NAME_MAX_LENGTH): string => {
  const trimmed = name.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
};

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
  /**
   * Build the notification body for a given kind. `conversationId` is provided
   * so the turn-completed body can name the originating conversation; the
   * confirmation body ignores it.
   */
  bodyFor: (kind: NotificationKind, conversationId?: string) => string;
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
      deps.show({
        body: deps.bodyFor('confirmation', message.conversation_id),
        conversationId: message.conversation_id,
        kind: 'confirmation',
      });
      return;
    }

    if (message.type === 'finish') {
      if (message.turn_id && message.turn_id === lastNotifiedTurnId) return;
      if (!deps.shouldShow()) return;
      lastNotifiedTurnId = message.turn_id ?? null;
      deps.show({
        body: deps.bodyFor('turnCompleted', message.conversation_id),
        conversationId: message.conversation_id,
        kind: 'turnCompleted',
      });
    }
  };

  return { onStreamMessage };
};
