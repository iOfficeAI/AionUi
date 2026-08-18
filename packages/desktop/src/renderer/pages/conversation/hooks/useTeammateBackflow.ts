/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeTextMessageContent, type TMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { useMergeLiveMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { useCallback, useRef } from 'react';

/**
 * Dedup guard for teammate backflow messages. Returns true when the id has not
 * been seen yet (recording it as a side effect); messages without an id always
 * pass so plain forwards are never dropped.
 */
export function acceptTeammateMessageId(seen: Set<string>, msgId: string | undefined): boolean {
  if (!msgId) {
    return true;
  }
  if (seen.has(msgId)) {
    return false;
  }
  seen.add(msgId);
  return true;
}

/**
 * Normalize a teammate backflow message before merging into the live list.
 * Text content is normalized (string JSON payloads become rich content);
 * other message types pass through untouched.
 */
export function normalizeTeammateMessage(message: TMessage): TMessage {
  return message.type === 'text' ? { ...message, content: normalizeTextMessageContent(message.content) } : message;
}

/**
 * Handle `teammate_message` stream events for a single conversation: filters by
 * conversation id, dedups by msg_id, normalizes, and merges into the live list.
 * Shared by the ACP and aionrs platform hooks so both stay a one-line call.
 */
export function useTeammateBackflow(conversationId: string): (message: IResponseMessage) => void {
  const mergeLiveMessage = useMergeLiveMessage();
  const processedMsgIdsRef = useRef(new Set<string>());

  return useCallback(
    (message: IResponseMessage) => {
      const tmMsg = message.data as TMessage;
      if (!tmMsg || tmMsg.conversation_id !== conversationId) {
        return;
      }
      if (!acceptTeammateMessageId(processedMsgIdsRef.current, tmMsg.msg_id)) {
        return;
      }
      mergeLiveMessage(normalizeTeammateMessage(tmMsg));
    },
    [conversationId, mergeLiveMessage]
  );
}
