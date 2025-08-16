/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { composeMessage } from '@/common/chatLib';
import { ChatMessageStorage, TChatConversation } from '@/common/storage';
import { useCallback, useEffect } from 'react';
import { createContext } from '../utils/createContext';

const [useMessageList, MessageListProvider, useUpdateMessageList] = createContext([] as TMessage[]);

const [useChatKey, ChatKeyProvider, useUpdateChatKey] = createContext('');

// 每个会话中 用户当前输入的尚未发送的 prompt 状态
const [useConversationPromptDraft, ConversationPromptDraftProvider, useUpdateConversationPromptDraft] = createContext<Record<TChatConversation['id'], string>>({});

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

// #region 更新管理会话中用户的 prompt

const useUpdateChatPromptDraftByKey = (key: string) => {
  const update = useUpdateConversationPromptDraft();
  return useCallback(
    (prompt: string) => {
      update((draft) => {
        return { ...draft, [key]: prompt };
      });
    },
    [key, update]
  );
};

const useChatPromptDraftByKey = (key: string): string | undefined => {
  // TODO 开启 ts 的索引严格模式
  return useConversationPromptDraft()[key];
};

export { ConversationPromptDraftProvider, useChatPromptDraftByKey, useConversationPromptDraft, useUpdateChatPromptDraftByKey };

// #endregion
