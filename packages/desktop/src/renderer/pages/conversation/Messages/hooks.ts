/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageText, TMessage } from '@/common/chat/chatLib';
import {
  composeMessage,
  mergeAcpToolCallContent,
  mergeTextMessageContent,
  preferTextMessageVersion,
} from '@/common/chat/chatLib';
import { useCallback, useEffect, useRef } from 'react';
import { createContext } from '@renderer/utils/ui/createContext';

const [useMessageList, MessageListProvider, useUpdateMessageList] = createContext([] as TMessage[]);

const [useChatKey, ChatKeyProvider] = createContext('');

const beforeUpdateMessageListStack: Array<(list: TMessage[]) => TMessage[]> = [];

// 消息索引缓存类型定义
// Message index cache type definitions
type MessageIndex = {
  msgIdIndex: Map<string, number>; // msg_id -> index
  call_idIndex: Map<string, number>; // tool_call.call_id -> index
  tool_call_idIndex: Map<string, number>; // acp_tool_call.update.tool_call_id -> index
  permission_call_idIndex: Map<string, number>; // permission/acp_permission content.call_id -> index
};

// Extract the unique call_id from a permission/acp_permission message.
// OpenCode and ACP backends emit permission events that share the same
// per-turn msg_id but each have a unique `call_id` in their content. Keying
// permission cards by `call_id` instead of `msg_id` is what stops parallel
// permission requests from clobbering each other in the message list.
function permissionCallId(msg: TMessage): string | undefined {
  if (msg.type === 'permission') {
    return (msg.content as { call_id?: string } | undefined)?.call_id;
  }
  if (msg.type === 'acp_permission') {
    const content = msg.content as { tool_call?: { tool_call_id?: string }; call_id?: string } | undefined;
    return content?.tool_call?.tool_call_id || content?.call_id;
  }
  return undefined;
}

// 使用 WeakMap 缓存索引，当列表被 GC 时自动清理
// Use WeakMap to cache index, auto-cleanup when list is GC'd
const indexCache = new WeakMap<TMessage[], MessageIndex>();

// 构建消息索引
// Build message index
function buildMessageIndex(list: TMessage[]): MessageIndex {
  const msgIdIndex = new Map<string, number>();
  const call_idIndex = new Map<string, number>();
  const tool_call_idIndex = new Map<string, number>();
  const permission_call_idIndex = new Map<string, number>();

  for (let i = 0; i < list.length; i++) {
    const msg = list[i];
    if (msg.msg_id) {
      if (msg.type === 'thinking') {
        msgIdIndex.set(`thinking:${msg.msg_id}`, i);
      } else {
        msgIdIndex.set(msg.msg_id, i);
      }
    }
    if (msg.type === 'tool_call' && msg.content?.call_id) {
      call_idIndex.set(msg.content.call_id, i);
    }
    if (msg.type === 'acp_tool_call' && msg.content?.update?.tool_call_id) {
      tool_call_idIndex.set(msg.content.update.tool_call_id, i);
    }
    const permCallId = permissionCallId(msg);
    if (permCallId) {
      permission_call_idIndex.set(permCallId, i);
    }
  }

  return { msgIdIndex, call_idIndex, tool_call_idIndex, permission_call_idIndex };
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
  if (!list?.length) {
    // Update index when adding first message
    if (message.msg_id) {
      index.msgIdIndex.set(message.msg_id, 0);
    }
    return [message];
  }

  // 对于 tool_group 类型，使用原始的 composeMessage（因为涉及内部数组匹配）
  // For tool_group type, use original composeMessage (involves inner array matching)
  // After composeMessage, the returned list may have different length/ordering,
  // so we must invalidate the index to prevent stale lookups in subsequent calls.
  if (message.type === 'tool_group') {
    const result = composeMessage(message, list);
    if (result !== list) {
      // Rebuild index maps from the new list to keep them in sync
      const rebuilt = buildMessageIndex(result);
      index.msgIdIndex = rebuilt.msgIdIndex;
      index.call_idIndex = rebuilt.call_idIndex;
      index.tool_call_idIndex = rebuilt.tool_call_idIndex;
      index.permission_call_idIndex = rebuilt.permission_call_idIndex;
    }
    return result;
  }

  // tool_call: 使用 call_idIndex 快速查找
  // tool_call: use call_idIndex for fast lookup
  if (message.type === 'tool_call' && message.content?.call_id) {
    const existingIdx = index.call_idIndex.get(message.content.call_id);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'tool_call') {
        const newList = list.slice();
        const merged = { ...existingMsg.content, ...message.content };
        newList[existingIdx] = { ...existingMsg, content: merged };
        return newList;
      }
    }
    // 未找到，添加新消息并更新索引
    const newIdx = list.length;
    index.call_idIndex.set(message.content.call_id, newIdx);
    if (message.msg_id) index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // acp_tool_call: use tool_call_idIndex for fast lookup
  if (message.type === 'acp_tool_call' && message.content?.update?.tool_call_id) {
    const existingIdx = index.tool_call_idIndex.get(message.content.update.tool_call_id);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'acp_tool_call') {
        const newList = list.slice();
        const merged = mergeAcpToolCallContent(existingMsg.content, message.content);
        newList[existingIdx] = { ...existingMsg, content: merged };
        return newList;
      }
    }
    // 未找到，添加新消息并更新索引
    const newIdx = list.length;
    index.tool_call_idIndex.set(message.content.update.tool_call_id, newIdx);
    if (message.msg_id) index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // text message: use msgIdIndex for fast lookup (handles interleaved messages)
  // text 消息: 使用 msgIdIndex 快速查找（处理消息交错的情况）
  if (message.type === 'text' && message.msg_id) {
    const existingIdx = index.msgIdIndex.get(message.msg_id);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'text') {
        // User messages (right position) are complete — skip if already exists to prevent duplicates
        if (message.position === 'right') {
          return list;
        }
        // Complete teammate messages are not streaming chunks — skip if already exists
        if ((message.content as { teammateMessage?: boolean })?.teammateMessage) {
          return list;
        }
        // AI streaming messages (left position) — append by default, replace when explicitly signaled
        const newList = list.slice();
        newList[existingIdx] = {
          ...existingMsg,
          content: mergeTextMessageContent(existingMsg.content, message.content),
        };
        return newList;
      }
    }
    // Not found in index, add as new message
    const newIdx = list.length;
    index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // thinking message: accumulate content chunks by msg_id (same logic as composeMessage)
  // Uses "thinking:${msg_id}" key to avoid collision with text messages sharing the same msg_id
  if (message.type === 'thinking' && message.msg_id) {
    const thinkingKey = `thinking:${message.msg_id}`;
    const existingIdx = index.msgIdIndex.get(thinkingKey);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'thinking') {
        const newList = list.slice();
        if (message.content.status === 'done') {
          newList[existingIdx] = {
            ...existingMsg,
            content: {
              ...existingMsg.content,
              status: 'done' as const,
              duration: message.content.duration,
            },
          };
        } else {
          newList[existingIdx] = {
            ...existingMsg,
            content: {
              ...existingMsg.content,
              content: existingMsg.content.content + message.content.content,
              subject: message.content.subject || existingMsg.content.subject,
            },
          };
        }
        return newList;
      }
    }
    // First thinking message — add and index
    const newIdx = list.length;
    index.msgIdIndex.set(thinkingKey, newIdx);
    return list.concat(message);
  }

  // plan message: update content and move to end of list
  if (message.type === 'plan' && message.msg_id) {
    const existingIdx = index.msgIdIndex.get(message.msg_id);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      const newList = list.slice();
      newList.splice(existingIdx, 1);
      const updated = { ...existingMsg, ...message, content: message.content } as TMessage;
      newList.push(updated);
      // Rebuild index after splice
      const rebuilt = buildMessageIndex(newList);
      index.msgIdIndex = rebuilt.msgIdIndex;
      index.call_idIndex = rebuilt.call_idIndex;
      index.tool_call_idIndex = rebuilt.tool_call_idIndex;
      index.permission_call_idIndex = rebuilt.permission_call_idIndex;
      return newList;
    }
    const newIdx = list.length;
    index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // permission / acp_permission: key by call_id, not msg_id.
  // OpenCode and ACP backends emit *all* parallel permission requests inside
  // one assistant turn, so every event arrives carrying the same per-turn
  // msg_id but with a distinct call_id in its content. If we keyed on msg_id
  // (the fallback below), four parallel "Run a command on your machine?" cards
  // would collapse into a single slot, with only the latest request rendering.
  // See agent.rs's permission.asked / RemoteShellApprover paths for how the
  // backend mints call_ids: each is a fresh `shell-{uuid}` or opencode
  // request id, so a call_id-keyed index gives every card its own slot.
  if (message.type === 'permission' || message.type === 'acp_permission') {
    const callId = permissionCallId(message);
    if (callId) {
      const existingIdx = index.permission_call_idIndex.get(callId);
      if (existingIdx !== undefined && existingIdx < list.length) {
        const existingMsg = list[existingIdx];
        if (existingMsg.type === message.type) {
          const newList = list.slice();
          newList[existingIdx] = {
            ...existingMsg,
            ...message,
            content: message.content,
          } as TMessage;
          return newList;
        }
      }
      // Not yet in list — append as a brand-new card and remember its index
      // so a future update for the same call_id (e.g. status change) replaces
      // this slot instead of growing the list.
      const newIdx = list.length;
      index.permission_call_idIndex.set(callId, newIdx);
      if (message.msg_id) index.msgIdIndex.set(message.msg_id, newIdx);
      return list.concat(message);
    }
  }

  // agent_status / tips and other msg_id-based messages:
  // replace the existing item in place instead of appending duplicates.
  if (message.msg_id) {
    const existingIdx = index.msgIdIndex.get(message.msg_id);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      const newList = list.slice();
      newList[existingIdx] = {
        ...existingMsg,
        ...message,
        // Preserve the existing stable `id`. `transformMessage` mints a fresh
        // `uuid()` for `id` on every update; if we let it overwrite the
        // existing id, the React list key (keyed on `id`) changes each tick and
        // the component remounts — the cause of the F01 "stacking" sub-agent
        // cards on every progress event. `msg_id` is the real identity here.
        id: existingMsg.id,
        content: message.content,
      } as TMessage;
      return newList;
    }
  }

  // Other types: fallback to last message check
  // 其他类型: 回退到检查最后一条消息
  const last = list[list.length - 1];
  if (last.msg_id !== message.msg_id || last.type !== message.type) {
    // Add new message and update index
    const newIdx = list.length;
    if (message.msg_id) index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // Merge other message types with same msg_id
  const newList = list.slice();
  const lastIdx = newList.length - 1;
  newList[lastIdx] = { ...last, ...message };
  return newList;
}

export const useAddOrUpdateMessage = () => {
  const update = useUpdateMessageList();
  const pendingRef = useRef<Array<{ message: TMessage; add: boolean }>>([]);
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          if (msg.type === 'tool_call' && msg.content?.call_id) {
            index.call_idIndex.set(msg.content.call_id, newIdx);
          }
          if (msg.type === 'acp_tool_call' && msg.content?.update?.tool_call_id) {
            index.tool_call_idIndex.set(msg.content.update.tool_call_id, newIdx);
          }
          const permCallId = permissionCallId(msg);
          if (permCallId) {
            index.permission_call_idIndex.set(permCallId, newIdx);
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

  return useCallback(
    (message: TMessage, add = false) => {
      pendingRef.current.push({ message, add });
      if (rafRef.current === null) {
        rafRef.current = setTimeout(flush);
      }
    },
    [flush]
  );
};

export const useRemoveMessageByMsgId = () => {
  const update = useUpdateMessageList();

  return useCallback(
    (msgId: string) => {
      update((list) => list.filter((message) => message.msg_id !== msgId));
    },
    [update]
  );
};

/**
 * Normalize a message loaded from backend DB: if `content` is a JSON string,
 * parse it and map snake_case fields to camelCase for the renderer. If
 * `content` arrives as an already-parsed object (the backend's list endpoint
 * does this — see `crates/aionui-conversation/src/convert.rs`
 * `row_to_message_response`), still remap the few snake_case keys we care
 * about so the renderer reads the same shape regardless of route.
 */
function normalizeDbMessage(msg: TMessage): TMessage {
  if (msg.type !== 'text') return msg;
  const raw = msg.content as unknown;

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.content !== 'string') return msg;
      const model = parsed.model as { provider_id?: string; model_id?: string } | undefined;
      return {
        ...msg,
        content: {
          content: parsed.content as string,
          ...(parsed.teammate_message ? { teammateMessage: true } : {}),
          ...(parsed.sender_name ? { senderName: parsed.sender_name as string } : {}),
          ...(parsed.sender_backend ? { senderAgentType: parsed.sender_backend as string } : {}),
          ...(parsed.sender_conversation_id ? { senderConversationId: parsed.sender_conversation_id as string } : {}),
          ...(model?.provider_id && model?.model_id
            ? { model: { providerId: model.provider_id, modelId: model.model_id } }
            : {}),
        },
      };
    } catch {
      return msg;
    }
  }

  // Content already arrived as a parsed object (most common path from the
  // list endpoint). Only the model field needs snake→camel today; if a
  // payload also has snake_case `teammate_message` / `sender_*` keys those
  // would need similar remapping, but historically those have arrived
  // already-camelCased on this path.
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const model = obj.model as
      | { provider_id?: string; model_id?: string; providerId?: string; modelId?: string }
      | undefined;
    if (model) {
      const providerId = model.providerId ?? model.provider_id;
      const modelId = model.modelId ?? model.model_id;
      if (providerId && modelId) {
        if (model.providerId && model.modelId && !model.provider_id && !model.model_id) {
          return msg;
        }
        return {
          ...msg,
          content: {
            ...obj,
            model: { providerId, modelId },
          },
        } as TMessage;
      }
    }
  }

  return msg;
}

export const useMessageLstCache = (key: string) => {
  const update = useUpdateMessageList();
  const loadMessages = useCallback(async (): Promise<TMessage[]> => {
    const result = await ipcBridge.database.getConversationMessages.invoke({
      conversation_id: key,
      page: 0,
      page_size: 10000,
    });
    const messages = result?.items?.map(normalizeDbMessage);
    if (messages && Array.isArray(messages)) {
      update((currentList) => {
        if (!currentList.length) return messages;
        const sameConversation = currentList.filter((m) => m.conversation_id === key);
        if (!sameConversation.length) return messages;
        const dbIds = new Set(messages.map((m) => m.id));
        const dbMsgIds = new Set(messages.map((m) => m.msg_id).filter(Boolean));

        // Build a map of streaming messages by msg_id for content-length comparison.
        // During streaming, the DB may have an older snapshot (due to 2000ms save debounce),
        // so we keep whichever version has more content to avoid losing streamed data.
        const streamingByMsgId = new Map<string, IMessageText>();
        for (const m of sameConversation) {
          if (m.msg_id && m.type === 'text' && dbMsgIds.has(m.msg_id)) {
            streamingByMsgId.set(m.msg_id, m);
          }
        }

        // Replace DB messages with streaming versions when streaming has more content
        const mergedMessages = messages.map((dbMsg) => {
          if (!dbMsg.msg_id || dbMsg.type !== 'text') return dbMsg;
          const streamMsg = streamingByMsgId.get(dbMsg.msg_id);
          if (!streamMsg) return dbMsg;
          return preferTextMessageVersion(dbMsg, streamMsg);
        });

        const streamingOnly = sameConversation.filter((m) => !dbIds.has(m.id) && !(m.msg_id && dbMsgIds.has(m.msg_id)));
        if (!streamingOnly.length && !streamingByMsgId.size) return messages;
        return [...mergedMessages, ...streamingOnly];
      });
      return messages;
    }
    return [];
  }, [key, update]);

  useEffect(() => {
    if (!key) return;
    void loadMessages().catch((error) => {
      console.error('[useMessageLstCache] Failed to load messages from database:', error);
    });
  }, [key, loadMessages]);

  // Exposed so callers (e.g. Phase 4b backfill in RemoteChat) can force
  // a re-read once new rows have been written to the DB out-of-band.
  return loadMessages;
};

export const beforeUpdateMessageList = (fn: (list: TMessage[]) => TMessage[]) => {
  beforeUpdateMessageListStack.push(fn);
  return () => {
    beforeUpdateMessageListStack.splice(beforeUpdateMessageListStack.indexOf(fn), 1);
  };
};
export { ChatKeyProvider, MessageListProvider, useChatKey, useMessageList, useUpdateMessageList };

// Test-only exports. These let unit tests exercise the message-merging logic
// without spinning up React + the provider context; the logic itself is the
// single source of truth for how parallel events collapse into the chat list
// (especially permission-by-call_id), so testing it directly is the highest
// signal-to-noise way to lock its behaviour.
export const __test__ = {
  buildMessageIndex,
  composeMessageWithIndex,
  permissionCallId,
};
