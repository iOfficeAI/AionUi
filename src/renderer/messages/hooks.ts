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

export const useAddOrUpdateMessage = () => {
  const update = useUpdateMessageList();
  return (message: TMessage, add = false) => {
    update((list) => {
      return add ? list.concat(message) : composeMessage(message, list).slice();
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
          update(() => cache);
        }
      }
    });
  }, [key]);
};

export { ChatKeyProvider, MessageListProvider, useChatKey, useMessageList };
