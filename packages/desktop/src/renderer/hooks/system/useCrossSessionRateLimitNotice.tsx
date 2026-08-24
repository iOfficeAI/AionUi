/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { SessionMessageRateLimitedPayload } from '@/common/adapter/ipcBridge';
import { useCrossSessionMessageEnabled } from '@/renderer/hooks/chat/useCrossSessionMessageEnabled';
import { resolveCurrentUserId } from '@/renderer/hooks/system/currentUserId';
import { getConversationRuntimeViewSnapshot } from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { Button, Message, Notification } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type { SessionMessageRateLimitedPayload };

export type RateLimitNotice = {
  message: string;
  conversationIdsToStop: string[];
};

/**
 * `BroadcastEventBus` fans out to EVERY connection, so payload filtering is the
 * only thing that stops one user's conversation names from surfacing in another
 * user's UI.
 */
export function shouldShowRateLimitNotice(
  payload: SessionMessageRateLimitedPayload,
  currentUserId: string | undefined
): boolean {
  if (!currentUserId) return false;
  return payload.user_id === currentUserId;
}

/**
 * Build the notice. Names both conversations and carries the two ids to stop —
 * and never a message body (spec §10).
 */
export function buildRateLimitNotice(
  payload: SessionMessageRateLimitedPayload,
  describe?: (from: string, to: string) => string
): RateLimitNotice {
  const from = payload.from_name || payload.from_conversation_id;
  const to = payload.to_name || payload.to_conversation_id;
  return {
    message: describe
      ? describe(from, to)
      : `Automatic messages between "${from}" and "${to}" are unusually frequent and may be looping.`,
    conversationIdsToStop: [payload.from_conversation_id, payload.to_conversation_id],
  };
}

/** Suppress repeat notices for the same pair inside this window. */
export const NOTICE_COOLDOWN_MS = 60_000;

const pairKey = (payload: SessionMessageRateLimitedPayload): string =>
  `${payload.from_conversation_id}->${payload.to_conversation_id}`;

/**
 * The REAL emergency stop.
 *
 * The settings switch is a long-term gate that takes "Settings → System → scroll
 * → toggle" to reach; too far away while the user is watching two agents talk
 * past each other. This fires the moment the rate gate trips, with the two
 * actions that actually end it.
 */
export function useCrossSessionRateLimitNotice(currentUserId?: string): void {
  const { t } = useTranslation();
  const { setEnabled } = useCrossSessionMessageEnabled();
  const lastShownRef = useRef<Map<string, number>>(new Map());
  // The caller cannot always supply an id: in the desktop app `AuthContext`
  // keeps `user` null on purpose, so `user?.id` is `undefined` and the payload
  // filter below would reject EVERY event — the warning was silently dead there.
  // Ask the backend who this client is instead of widening the filter, so the
  // per-user check stays a real check rather than a platform exception.
  const [resolvedUserId, setResolvedUserId] = useState(currentUserId);

  useEffect(() => {
    if (currentUserId) {
      setResolvedUserId(currentUserId);
      return;
    }
    let cancelled = false;
    void resolveCurrentUserId().then((id) => {
      if (!cancelled) setResolvedUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const stopConversations = useCallback(async (conversationIds: string[]) => {
    await Promise.all(
      conversationIds.map(async (conversation_id) => {
        // `cancel` needs the active turn id; the runtime view store is the same
        // source the send box's stop button reads.
        const activeTurnId = getConversationRuntimeViewSnapshot(conversation_id).activeTurnId;
        if (!activeTurnId) return;
        try {
          await ipcBridge.conversation.stop.invoke({ conversation_id, turn_id: activeTurnId });
        } catch {
          // Best effort: one side failing must not block the other.
        }
      })
    );
  }, []);

  const handlePayload = useCallback(
    (payload: SessionMessageRateLimitedPayload) => {
      if (!shouldShowRateLimitNotice(payload, resolvedUserId)) return;

      const key = pairKey(payload);
      const now = Date.now();
      const lastShown = lastShownRef.current.get(key) ?? 0;
      // Without this the notice itself becomes the spam it warns about.
      if (now - lastShown < NOTICE_COOLDOWN_MS) return;
      lastShownRef.current.set(key, now);

      const notice = buildRateLimitNotice(payload, (from, to) =>
        t('conversation.crossSession.rateLimited', {
          from,
          to,
          defaultValue: 'Automatic messages between "{{from}}" and "{{to}}" are unusually frequent and may be looping.',
        })
      );

      const notificationId = `cross-session-rate-limited-${key}`;
      Notification.warning({
        id: notificationId,
        title: t('conversation.crossSession.rateLimitedTitle', {
          defaultValue: 'Cross-conversation messages may be looping',
        }),
        content: notice.message,
        // No auto-dismiss: this needs a decision, not a glance.
        duration: 0,
        btn: (
          <span className='flex gap-8px'>
            <Button
              size='mini'
              onClick={() => {
                void stopConversations(notice.conversationIdsToStop);
                Notification.remove(notificationId);
              }}
            >
              {t('conversation.crossSession.stopBoth', { defaultValue: 'Stop both conversations' })}
            </Button>
            <Button
              size='mini'
              type='primary'
              status='warning'
              onClick={() => {
                void setEnabled(false).catch(() => {
                  Message.error(t('settings.crossSessionMessageUpdateFailed'));
                });
                Notification.remove(notificationId);
              }}
            >
              {t('conversation.crossSession.disableFeature', { defaultValue: 'Turn off cross-conversation messages' })}
            </Button>
          </span>
        ),
      });
    },
    [resolvedUserId, setEnabled, stopConversations, t]
  );

  useEffect(() => {
    const unsubscribe = ipcBridge.sessionMessage?.rateLimited?.on?.(handlePayload);
    return () => {
      unsubscribe?.();
    };
  }, [handlePayload]);
}
