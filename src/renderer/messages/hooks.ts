/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { composeMessage } from '@/common/chatLib';
import { ipcBridge } from '@/common';
import { useCallback, useEffect, useRef } from 'react';
import { createContext } from '../utils/createContext';

const [useMessageList, MessageListProvider, useUpdateMessageList] = createContext([] as TMessage[]);

const [useChatKey, ChatKeyProvider] = createContext('');

const beforeUpdateMessageListStack: Array<(list: TMessage[]) => TMessage[]> = [];

export const useAddOrUpdateMessage = () => {
  const update = useUpdateMessageList();
  const pendingRef = useRef<Array<{ message: TMessage; add: boolean }>>([]);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const pending = pendingRef.current;
    if (!pending.length) return;
    pendingRef.current = [];
    update((list) => {
      let newList = list;
      for (const item of pending) {
        newList = item.add ? newList.concat(item.message) : composeMessage(item.message, newList).slice();
        while (beforeUpdateMessageListStack.length) {
          newList = beforeUpdateMessageListStack.shift()(newList);
        }
      }
      return newList;
    });
  }, [update]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return (message: TMessage, add = false) => {
    pendingRef.current.push({ message, add });
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flush);
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
