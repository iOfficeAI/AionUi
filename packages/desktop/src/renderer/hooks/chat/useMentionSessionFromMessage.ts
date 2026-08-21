/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { sessionMention } from '@/common/adapter/ipcBridge';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { emitter } from '@/renderer/utils/emitter';
import { Message } from '@arco-design/web-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCrossSessionMessageEnabled } from './useCrossSessionMessageEnabled';

/**
 * Mention a conversation the user clicked on an earlier message.
 *
 * Exists because a target that was hard to find once should not have to be found
 * again. The chips and the delivery badge carry the conversation ID, which also
 * side-steps the ambiguity the picker cannot resolve for a user who has twenty
 * conversations sharing a name.
 *
 * Validated on click rather than at send time. A `@@` reference is atomic: a
 * target that has since been deleted or joined a team fails the WHOLE message at
 * the send boundary, which would land after the user had already written it. One
 * lookup through the mentionable route covers every way this can be unavailable,
 * because that route applies the picker's own filters and the sender-side guard:
 * the feature switch being off and the current conversation being team-owned both
 * come back as errors, and an ineligible target comes back as an empty page. That
 * is also why the ID is resolved rather than trusted — the reply carries the name
 * the conversation had when the message was sent, and an agent may have renamed it
 * since, so the lookup's name is the one that gets inserted.
 */
export function useMentionSessionFromMessage(): {
  /** False when the affordance should not be offered at all. */
  available: boolean;
  pending: boolean;
  mention: (target: { id: string; name: string }) => void;
} {
  const { t } = useTranslation();
  const conversationContext = useConversationContextSafe();
  const { enabled } = useCrossSessionMessageEnabled();
  const [pending, setPending] = useState(false);
  const currentConversationId = conversationContext?.conversation_id;

  const mention = useCallback(
    (target: { id: string; name: string }) => {
      if (!currentConversationId || pending) {
        return;
      }
      setPending(true);
      void sessionMention.list
        .invoke({ current_conversation_id: currentConversationId, id: target.id, limit: 1 })
        .then((page) => {
          const resolved = page?.items?.[0];
          if (!resolved) {
            // Deleted, joined a team, or is the conversation we are already in.
            Message.warning(
              t('conversation.crossSession.mentionUnavailable', {
                defaultValue: 'That conversation can no longer be mentioned.',
              })
            );
            return;
          }
          emitter.emit('sendbox.mention.session', { id: resolved.id, name: resolved.name }, currentConversationId);
        })
        .catch(() => {
          // A 403 from the switch being off or from a team-owned sender lands
          // here; the copy stays generic rather than guessing which.
          Message.warning(
            t('conversation.crossSession.mentionFailed', {
              defaultValue: 'Could not mention that conversation.',
            })
          );
        })
        .finally(() => {
          setPending(false);
        });
    },
    [currentConversationId, pending, t]
  );

  return {
    // Team-owned senders cannot be detected from here — the conversation context
    // carries no team flag — so that case is reported by the lookup instead of
    // hidden. The switch is known locally, so an off switch hides the affordance
    // rather than offering a click that only ever fails.
    available: enabled && Boolean(currentConversationId),
    pending,
    mention,
  };
}
