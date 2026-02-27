/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText, TMessage } from '@/common/chatLib';
import { stripThinkTags, hasThinkTags } from '@/renderer/utils/thinkTagFilter';
import { Down } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useMessageList } from '@renderer/messages/hooks';
import { useAgentChat } from './AgentChatContext';
import AgentChatBubble from './AgentChatBubble';
import DateDivider from './DateDivider';
import TypingIndicator from './TypingIndicator';
import styles from './agentchat.module.css';
import type { AgentChatMessage, ReplyRef } from './types';

// Meaningful message types to display in the chat room
// Everything else (tool_call, tool_group, acp_tool_call, acp_permission,
// codex_tool_call, plan, agent_status, etc.) is internal noise
const VISIBLE_TYPES = new Set(['text']);

// Resolve a human-readable sender name from message data
const resolveSender = (msg: TMessage, backendName: string): { name: string; isUser: boolean } => {
  // Swarm-style agentMeta
  if (msg.agentMeta?.name) {
    return { name: msg.agentMeta.name, isUser: false };
  }
  // User messages are positioned right
  if (msg.position === 'right') {
    return { name: 'You', isUser: true };
  }
  // Agent responses are positioned left – use the backend label
  return { name: backendName, isUser: false };
};

// Extract plain text from a text message, strip think tags, return null if empty
const extractText = (msg: TMessage): string | null => {
  const textMsg = msg as IMessageText;
  const raw = textMsg.content?.content;

  let str: string;
  if (typeof raw === 'string') {
    str = raw;
  } else if (Array.isArray(raw)) {
    str = (raw as Array<{ type?: string; text?: string }>)
      .filter((b) => b?.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
  } else {
    str = String(raw ?? '');
  }

  // Strip internal thinking blocks
  if (hasThinkTags(str)) {
    str = stripThinkTags(str);
  }

  str = str.trim();
  return str.length > 0 ? str : null;
};

// Convert a TMessage to an AgentChatMessage for bubble rendering
const toAgentChatMessage = (msg: TMessage, getAgentColor: (n: string) => string, backendName: string): AgentChatMessage | null => {
  if (!VISIBLE_TYPES.has(msg.type)) return null;

  const text = extractText(msg);
  if (!text) return null;

  const { name: sender, isUser } = resolveSender(msg, backendName);
  const senderColor = isUser ? '#a78bfa' : (msg.agentMeta as any)?.color || getAgentColor(sender);

  // Extract @mentions from text
  const mentions: string[] = [];
  const mentionRegex = /@(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return {
    id: msg.id,
    sender,
    senderColor,
    text,
    timestamp: (msg as any).createTime || (msg as any).createdAt || Date.now(),
    mentions,
    isSystem: false,
  };
};

// Format date for divider
const formatDateDivider = (ts: number): string => {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

const getDateKey = (ts: number): string => new Date(ts).toDateString();

type TimelineItem =
  | { type: 'date'; date: string; id: string }
  | { type: 'message'; message: AgentChatMessage; isConsecutive: boolean; id: string };

const AgentChatTimeline: React.FC<{ backendName?: string }> = ({ backendName = 'Claude' }) => {
  const list = useMessageList();
  const { getAgentColor, username, todos, addTodo, toggleTodo, removeTodo, setReplyTo } = useAgentChat();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const atBottomRef = useRef(true);

  // Convert message list to timeline items — only meaningful messages
  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];
    let lastDateKey = '';
    let prevSender = '';

    for (const msg of list) {
      const chatMsg = toAgentChatMessage(msg, getAgentColor, backendName);
      if (!chatMsg) continue;

      const dateKey = getDateKey(chatMsg.timestamp);
      if (dateKey !== lastDateKey) {
        items.push({ type: 'date', date: formatDateDivider(chatMsg.timestamp), id: `date-${dateKey}` });
        lastDateKey = dateKey;
        prevSender = '';
      }

      // Consecutive messages from the same sender get compact spacing (no repeated avatar/name)
      const isConsecutive = chatMsg.sender === prevSender;
      items.push({ type: 'message', message: chatMsg, isConsecutive, id: chatMsg.id });
      prevSender = chatMsg.sender;
    }

    return items;
  }, [list, getAgentColor, backendName]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (atBottomRef.current && timelineItems.length > 0) {
      virtuosoRef.current?.scrollToIndex({ index: timelineItems.length - 1, behavior: 'smooth' });
    } else if (!atBottomRef.current) {
      setUnreadCount((prev) => prev + 1);
    }
  }, [timelineItems.length]);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
    if (atBottom) {
      setShowScrollBtn(false);
      setUnreadCount(0);
    } else {
      setShowScrollBtn(true);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: timelineItems.length - 1, behavior: 'smooth' });
    setShowScrollBtn(false);
    setUnreadCount(0);
  }, [timelineItems.length]);

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const idx = timelineItems.findIndex((item) => item.id === messageId);
      if (idx >= 0) {
        virtuosoRef.current?.scrollToIndex({ index: idx, behavior: 'smooth' });
        setTimeout(() => {
          const el = document.querySelector(`[data-message-id="${messageId}"]`);
          if (el) {
            el.classList.add(styles.messageHighlight);
            setTimeout(() => el.classList.remove(styles.messageHighlight), 2000);
          }
        }, 300);
      }
    },
    [timelineItems]
  );

  // Build todo status lookup
  const todoStatusMap = useMemo(() => {
    const map = new Map<string, 'todo' | 'done'>();
    for (const todo of todos) {
      map.set(todo.messageId, todo.status);
    }
    return map;
  }, [todos]);

  const handleReply = useCallback(
    (ref: ReplyRef) => {
      setReplyTo(ref);
    },
    [setReplyTo]
  );

  const handleTodoToggle = useCallback(
    (messageId: string) => {
      const existing = todos.find((t) => t.messageId === messageId);
      if (existing) {
        if (existing.status === 'done') {
          removeTodo(existing.id);
        } else {
          toggleTodo(existing.id);
        }
      } else {
        const item = timelineItems.find((i) => i.type === 'message' && i.id === messageId);
        if (item && item.type === 'message') {
          addTodo({
            messageId: item.message.id,
            text: item.message.text.slice(0, 200),
            sender: item.message.sender,
            status: 'todo',
          });
        }
      }
    },
    [todos, addTodo, toggleTodo, removeTodo, timelineItems]
  );

  const renderItem = useCallback(
    (_index: number, item: TimelineItem) => {
      if (item.type === 'date') {
        return <DateDivider date={item.date} />;
      }

      const msg = item.message;
      const isCurrentUser = msg.sender === 'You' || msg.sender === username || msg.sender === 'user';

      return (
        <AgentChatBubble
          message={msg}
          isCurrentUser={isCurrentUser}
          isConsecutive={item.isConsecutive}
          todoStatus={todoStatusMap.get(msg.id) || null}
          onReply={handleReply}
          onTodoToggle={handleTodoToggle}
          onScrollToMessage={scrollToMessage}
        />
      );
    },
    [username, todoStatusMap, handleReply, handleTodoToggle, scrollToMessage]
  );

  // Empty state
  if (timelineItems.length === 0) {
    return (
      <div className={classNames(styles.timeline, 'flex items-center justify-center')}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>💬</div>
          <div className={styles.emptyTitle}>Start a conversation</div>
          <div className={styles.emptyHint}>Use @mentions or the toggle buttons to address agents</div>
        </div>
      </div>
    );
  }

  return (
    <div className={classNames(styles.timeline, 'relative')}>
      <Virtuoso ref={virtuosoRef} data={timelineItems} itemContent={renderItem} followOutput='smooth' atBottomStateChange={handleAtBottomStateChange} className='size-full' />

      <TypingIndicator />

      {showScrollBtn && (
        <button type='button' className={styles.scrollAnchor} onClick={scrollToBottom} title='Scroll to bottom'>
          {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount}</span>}
          <Down theme='filled' size='16' fill='white' />
        </button>
      )}
    </div>
  );
};

export default AgentChatTimeline;
