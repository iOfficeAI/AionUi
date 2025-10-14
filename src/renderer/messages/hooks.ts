/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { composeMessage } from '@/common/chatLib';
import { ipcBridge } from '@/common';
import { useEffect } from 'react';
import { createContext } from '../utils/createContext';

const [useMessageList, MessageListProvider, useUpdateMessageList] = createContext([] as TMessage[]);

const [useChatKey, ChatKeyProvider] = createContext('');

const beforeUpdateMessageListStack: Array<(list: TMessage[]) => TMessage[]> = [];

export const useAddOrUpdateMessage = () => {
  const update = useUpdateMessageList();
  return (message: TMessage, add = false, persist = true) => {
    // Log for debugging
    if (message.type === 'text' && message.msg_id) {
      const textMessage = message as any;
      const contentPreview = textMessage?.content?.content?.substring?.(0, 50) || '';
      console.log(`[Frontend] addOrUpdateMessage called: msg_id=${message.msg_id}, content_preview="${contentPreview}", add=${add}, persist=${persist}`);
    }

    // Always update UI state
    update((list) => {
      let newList = add ? list.concat(message) : composeMessage(message, list).slice();
      while (beforeUpdateMessageListStack.length) {
        newList = beforeUpdateMessageListStack.shift()(newList);
      }
      return newList;
    });

    // Persist to database via IPC only if persist flag is true
    // For Codex delta messages: persist=false (only UI update, backend handles final message persistence)
    // For other messages: persist=true (normal flow)
    if (persist && message && message.conversation_id) {
      void ipcBridge.database.addOrUpdateMessage.invoke({
        conversation_id: message.conversation_id,
        message: message,
      });
    }
  };
};

export const useMessageLstCache = (key: string) => {
  const update = useUpdateMessageList();
  useEffect(() => {
    if (!key) return;
    void ipcBridge.database.getConversationMessages
      .invoke({
        conversation_id: key,
        page: 0,
        pageSize: 10000, // Load all messages (up to 10k per conversation)
      })
      .then((messages) => {
        if (messages && Array.isArray(messages)) {
          update(() => messages);
        }
      })
      .catch((error) => {
        console.error('[useMessageLstCache] Failed to load messages from database:', error);
      });
  }, [key]);
};

export const beforeUpdateMessageList = (fn: (list: TMessage[]) => TMessage[]) => {
  beforeUpdateMessageListStack.push(fn);
  return () => {
    beforeUpdateMessageListStack.splice(beforeUpdateMessageListStack.indexOf(fn), 1);
  };
};
export { ChatKeyProvider, MessageListProvider, useChatKey, useMessageList, useUpdateMessageList };
