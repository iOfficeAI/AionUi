/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { conversation } from '@/common/ipcBridge';
import type { TMessage } from '@/common/chatLib';
import { composeMessage } from '@/common/chatLib';
import { ChatMessageStorage } from '@/common/storage';
import { useEffect, useState } from 'react';
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
          update(() => cache);
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

// Shared interface for confirmation data
export interface ConfirmationData {
  confirmKey: string;
  msg_id: string;
  conversation_id: string;
  callId: string;
}

/**
 * Common hook to handle message confirmation for both tool groups and codex permissions
 * 用于处理工具组和codex权限的消息确认的通用钩子
 */
export const useConfirmationHandler = () => {
  const handleConfirmation = async (data: ConfirmationData): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await conversation.confirmMessage.invoke(data);
      return { success: true, error: undefined };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  return { handleConfirmation };
};

/**
 * Hook to generate stable permission ID based on tool call characteristics
 * 钩子根据工具调用特征生成稳定的权限ID
 */
export const usePermissionIdGenerator = () => {
  const generateGlobalPermissionId = (toolCall?: { kind?: string; title?: string; rawInput?: { command?: string | string[] } }) => {
    // 基于权限类型生成稳定的ID，而不是具体的命令内容
    // 这样相同类型的权限请求会有相同的ID
    const features = [toolCall?.kind || 'permission', toolCall?.title || ''];

    const featureString = features.filter(Boolean).join('|');

    // 生成稳定的哈希
    let hash = 0;
    for (let i = 0; i < featureString.length; i++) {
      const char = featureString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 32位整数
    }

    const permissionId = `codex_perm_${Math.abs(hash)}`;

    return permissionId;
  };

  return { generateGlobalPermissionId };
};

/**
 * Hook to get appropriate icon based on tool kind
 */
export const useToolIcon = () => {
  const getToolIcon = (kind?: string): string => {
    const kindIcons: Record<string, string> = {
      edit: '✏️',
      read: '📖',
      fetch: '🌐',
      execute: '⚡',
    };

    return kindIcons[kind || 'execute'] || '⚡';
  };

  return { getToolIcon };
};

/**
 * Hook to manage permission storage keys
 */
export const usePermissionStorageKeys = (permissionId: string) => {
  const storageKey = `codex_global_permission_choice_${permissionId}`;
  const responseKey = `codex_global_permission_responded_${permissionId}`;

  return { storageKey, responseKey };
};

/**
 * Hook to handle local storage state for permissions
 */
export const usePermissionState = (storageKey: string, responseKey: string) => {
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const [hasResponded, setHasResponded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(responseKey) === 'true';
    } catch {
      return false;
    }
  });

  return { selected, setSelected, hasResponded, setHasResponded };
};

/**
 * Hook to clean up old permission storage entries (older than 7 days)
 */
export const usePermissionStorageCleanup = () => {
  const cleanupOldPermissionStorage = () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('codex_permission_choice_') || key.startsWith('codex_permission_responded_')) {
        const timestamp = localStorage.getItem(`${key}_timestamp`);
        if (timestamp && parseInt(timestamp, 10) < sevenDaysAgo) {
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}_timestamp`);
        }
      }
    });
  };

  return { cleanupOldPermissionStorage };
};

export { ChatKeyProvider, MessageListProvider, useChatKey, useMessageList, useUpdateMessageList };
