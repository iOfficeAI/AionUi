/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized task completion notification hook.
 * Mounted in layout.tsx (always alive), listens for finish events from ALL conversations.
 * Supports notifications for both user-initiated and cron tasks (configurable).
 */

import { useEffect, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/ipcBridge';
import { getPendingUserMessage, clearPendingUserMessage } from './notificationState';

const truncateText = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

const formatNotificationBody = (userMessage: string, aiReply: string): string => {
  const truncatedUser = truncateText(userMessage, 8);
  const truncatedReply = aiReply ? truncateText(aiReply, 12) : '';
  if (truncatedReply) {
    return `${truncatedUser}\n${truncatedReply}`;
  }
  return truncatedUser;
};

// Message types that indicate the agent task is still running
const TASK_ACTIVE_TYPES = new Set(['start', 'thought', 'content', 'tool_group', 'acp_permission', 'codex_permission']);

export const useTaskCompletionNotification = () => {
  // Per-conversation notification timers
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Per-conversation accumulated AI replies
  const aiRepliesRef = useRef<Map<string, string>>(new Map());
  // Cron notification enabled setting
  const [cronNotificationEnabled, setCronNotificationEnabled] = useState(false);

  // Fetch cron notification setting on mount
  useEffect(() => {
    ipcBridge.systemSettings
      .getCronNotificationEnabled.invoke()
      .then((enabled) => {
        setCronNotificationEnabled(enabled);
      })
      .catch(() => {
        // Default to disabled on error
        setCronNotificationEnabled(false);
      });
  }, []);

  useEffect(() => {
    const handleMessage = (message: IResponseMessage) => {
      const conversationId = message.conversation_id;
      const type = message.type;

      // Cancel pending notification timer on task-active messages
      if (TASK_ACTIVE_TYPES.has(type)) {
        const timer = timersRef.current.get(conversationId);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(conversationId);
        }
      }

      // Reset AI reply accumulation on new turn
      if (type === 'start') {
        aiRepliesRef.current.delete(conversationId);
      }

      // Accumulate AI reply from content events
      if (type === 'content') {
        const contentData = message.data as { content?: string } | undefined;
        if (contentData?.content) {
          const existing = aiRepliesRef.current.get(conversationId) || '';
          aiRepliesRef.current.set(conversationId, existing + contentData.content);
        }
      }

      // Schedule notification on finish
      if (type === 'finish') {
        const userMessage = getPendingUserMessage(conversationId);

        // Check if this is a user-initiated task or a cron task
        const isUserTask = !!userMessage;
        const isCronTask = !isUserTask;

        // For cron tasks, only notify if setting is enabled
        if (isCronTask && !cronNotificationEnabled) {
          return;
        }

        const timer = setTimeout(async () => {
          timersRef.current.delete(conversationId);
          const aiReply = aiRepliesRef.current.get(conversationId) || '';

          let body: string;
          let title: string;

          if (isUserTask) {
            // User-initiated task
            body = formatNotificationBody(userMessage, aiReply);
            title = '任务完成';
            clearPendingUserMessage(conversationId);
          } else {
            // Cron task - get conversation title for better notification
            let conversationTitle = '定时任务';
            try {
              const conv = await ipcBridge.conversation.get.invoke({ id: conversationId });
              if (conv?.name) {
                conversationTitle = conv.name;
              }
            } catch (err) {
              // Failed to get conversation title, use default
            }

            title = `${conversationTitle}的定时任务完成`;
            body = aiReply ? truncateText(aiReply, 20) : '任务已完成';
          }

          aiRepliesRef.current.delete(conversationId);

          ipcBridge.notification.show
            .invoke({
              title,
              body,
              conversationId,
            })
            .catch((err) => {
              console.warn('[Notification] Failed to show notification:', err);
            });
        }, 1000);

        timersRef.current.set(conversationId, timer);
      }
    };

    // Listen to both response streams (main + openclaw)
    const unsub1 = ipcBridge.conversation.responseStream.on(handleMessage);
    const unsub2 = ipcBridge.openclawConversation.responseStream.on(handleMessage);

    return () => {
      unsub1();
      unsub2();
      // Clean up all pending timers
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, [cronNotificationEnabled]);
};
