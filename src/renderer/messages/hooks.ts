/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { composeMessage } from '@/common/chatLib';
import { ChatMessageStorage } from '@/common/storage';
import { useEffect } from 'react';
import { createContext } from '../utils/createContext';

const [useMessageList, MessageListProvider, useUpdateMessageList] = createContext([] as TMessage[]);

const [useChatKey, ChatKeyProvider, useUpdateChatKey] = createContext('');

const beforeUpdateMessageListStack: Array<(list: TMessage[]) => TMessage[]> = [];

export const useAddOrUpdateMessage = () => {
  const update = useUpdateMessageList();
  return (message: TMessage, add = false) => {
    update((list) => {
      let newList = add ? list.concat(message) : composeMessage(message, list).slice();
      while (beforeUpdateMessageListStack.length) {
        newList = beforeUpdateMessageListStack.shift()(newList);
      }
      return newList;
    });
  };
};

export const useMessageLstCache = (key: string) => {
  const update = useUpdateMessageList();

  useEffect(() => {
    if (!key) return;
    ChatMessageStorage.get(key).then((cache) => {
      if (cache) {
        if (Array.isArray(cache)) {
          update((currentList) => {
            // If there are already messages in the list (from initial message),
            // merge them with cache instead of replacing
            if (currentList && currentList.length > 0) {
              // Check if cache has newer messages we don't have
              const currentIds = new Set(currentList.map((m) => m.id));
              const newMessages = cache.filter((m) => !currentIds.has(m.id));
              return [...cache, ...currentList.filter((m) => !cache.some((c) => c.id === m.id))];
            }
            // Sort messages by createdAt to ensure correct order
            return cache.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          });
        }
      }
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
