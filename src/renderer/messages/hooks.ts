/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { composeMessage } from '@/common/chatLib';
import { useCallback, useEffect, useRef } from 'react';
import { createContext } from '../utils/createContext';

const [useMessageList, MessageListProvider, useUpdateMessageList] = createContext([] as TMessage[]);

const [useChatKey, ChatKeyProvider] = createContext('');

const beforeUpdateMessageListStack: Array<(list: TMessage[]) => TMessage[]> = [];

// 消息索引缓存类型定义
// Message index cache type definitions
interface MessageIndex {
  msgIdIndex: Map<string, number>; // msg_id -> index
  callIdIndex: Map<string, number>; // tool_call.callId -> index
  toolCallIdIndex: Map<string, number>; // codex_tool_call.toolCallId / acp_tool_call.toolCallId -> index
}

// 使用 WeakMap 缓存索引，当列表被 GC 时自动清理
// Use WeakMap to cache index, auto-cleanup when list is GC'd
const indexCache = new WeakMap<TMessage[], MessageIndex>();

// 构建消息索引
// Build message index
function buildMessageIndex(list: TMessage[]): MessageIndex {
  const msgIdIndex = new Map<string, number>();
  const callIdIndex = new Map<string, number>();
  const toolCallIdIndex = new Map<string, number>();

  for (let i = 0; i < list.length; i++) {
    const msg = list[i];
    if (msg.msg_id) msgIdIndex.set(msg.msg_id, i);
    if (msg.type === 'tool_call' && msg.content?.callId) {
      callIdIndex.set(msg.content.callId, i);
    }
    if (msg.type === 'codex_tool_call' && msg.content?.toolCallId) {
      toolCallIdIndex.set(msg.content.toolCallId, i);
    }
    if (msg.type === 'acp_tool_call' && msg.content?.update?.toolCallId) {
      toolCallIdIndex.set(msg.content.update.toolCallId, i);
    }
  }

  return { msgIdIndex, callIdIndex, toolCallIdIndex };
}

// 获取或构建索引（带缓存）
// Get or build index with caching
function getOrBuildIndex(list: TMessage[]): MessageIndex {
  let cached = indexCache.get(list);
  if (!cached) {
    cached = buildMessageIndex(list);
    indexCache.set(list, cached);
  }
  return cached;
}

// 使用索引优化的消息合并函数
// Index-optimized message compose function
function composeMessageWithIndex(message: TMessage, list: TMessage[], index: MessageIndex): TMessage[] {
  if (!message) return list || [];
  if (!list?.length) return [message];

  // 对于 tool_group 类型，使用原始的 composeMessage（因为涉及内部数组匹配）
  // For tool_group type, use original composeMessage (involves inner array matching)
  if (message.type === 'tool_group') {
    return composeMessage(message, list);
  }

  // tool_call: 使用 callIdIndex 快速查找
  // tool_call: use callIdIndex for fast lookup
  if (message.type === 'tool_call' && message.content?.callId) {
    const existingIdx = index.callIdIndex.get(message.content.callId);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'tool_call') {
        const newList = list.slice();
        const merged = { ...existingMsg.content, ...message.content };
        newList[existingIdx] = { ...existingMsg, content: merged };
        return newList;
      }
    }
    // 未找到，添加新消息
    list.push(message);
    return list;
  }

  // codex_tool_call: 使用 toolCallIdIndex 快速查找
  // codex_tool_call: use toolCallIdIndex for fast lookup
  if (message.type === 'codex_tool_call' && message.content?.toolCallId) {
    const existingIdx = index.toolCallIdIndex.get(message.content.toolCallId);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'codex_tool_call') {
        const newList = list.slice();
        const merged = { ...existingMsg.content, ...message.content };
        newList[existingIdx] = { ...existingMsg, content: merged };
        return newList;
      }
    }
    list.push(message);
    return list;
  }

  // acp_tool_call: 使用 toolCallIdIndex 快速查找
  // acp_tool_call: use toolCallIdIndex for fast lookup
  if (message.type === 'acp_tool_call' && message.content?.update?.toolCallId) {
    const existingIdx = index.toolCallIdIndex.get(message.content.update.toolCallId);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'acp_tool_call') {
        const newList = list.slice();
        const merged = { ...existingMsg.content, ...message.content };
        newList[existingIdx] = { ...existingMsg, content: merged };
        return newList;
      }
    }
    list.push(message);
    return list;
  }

  // 其他类型: 使用 msgIdIndex + 原始逻辑
  // Other types: use msgIdIndex + original logic
  const last = list[list.length - 1];
  if (last.msg_id !== message.msg_id || last.type !== message.type) {
    return list.concat(message);
  }

  // 合并 text 消息
  // Merge text messages - create new array to trigger React re-render
  const newList = list.slice();
  const lastIdx = newList.length - 1;
  if (message.type === 'text' && last.type === 'text') {
    // Create new message object with merged content
    newList[lastIdx] = {
      ...last,
      content: {
        ...last.content,
        content: last.content.content + message.content.content,
      },
    };
  } else {
    newList[lastIdx] = { ...last, ...message };
  }
  return newList;
}

export const useAddOrUpdateMessage = () => {
  const update = useUpdateMessageList();
  const pendingRef = useRef<Array<{ message: TMessage; add: boolean }>>([]);
  const rafRef = useRef<any | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;

    const pending = pendingRef.current;
    if (!pending.length) return;
    pendingRef.current = [];
    update((list) => {
      // 获取或构建索引用于快速查找 (O(1) instead of O(n))
      // Get or build index for fast lookup
      const index = getOrBuildIndex(list);
      let newList = list;

      for (const item of pending) {
        if (item.add) {
          // 新增消息，更新索引
          // New message, update index
          const msg = item.message;
          const newIdx = newList.length;
          if (msg.msg_id) index.msgIdIndex.set(msg.msg_id, newIdx);
          if (msg.type === 'tool_call' && msg.content?.callId) {
            index.callIdIndex.set(msg.content.callId, newIdx);
          }
          if (msg.type === 'codex_tool_call' && msg.content?.toolCallId) {
            index.toolCallIdIndex.set(msg.content.toolCallId, newIdx);
          }
          if (msg.type === 'acp_tool_call' && msg.content?.update?.toolCallId) {
            index.toolCallIdIndex.set(msg.content.update.toolCallId, newIdx);
          }
          newList = newList.concat(msg);
        } else {
          // 使用索引优化的消息合并
          // Use index-optimized message compose
          newList = composeMessageWithIndex(item.message, newList, index);
        }

        while (beforeUpdateMessageListStack.length) {
          newList = beforeUpdateMessageListStack.shift()!(newList);
        }
      }
      return newList;
    });

    rafRef.current = setTimeout(flush);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        clearTimeout(rafRef.current);
      }
    };
  }, []);

  return (message: TMessage, add = false) => {
    pendingRef.current.push({ message, add });
    if (rafRef.current === null) {
      rafRef.current = setTimeout(flush);
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
