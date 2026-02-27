/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import Markdown from '@/renderer/components/Markdown';
import classNames from 'classnames';
import React, { useCallback, useMemo, useRef } from 'react';
import { useAgentChat } from './AgentChatContext';
import styles from './agentchat.module.css';
import type { AgentChatMessage, ReplyRef } from './types';

type AgentChatBubbleProps = {
  message: AgentChatMessage;
  isCurrentUser: boolean;
  isConsecutive?: boolean;
  todoStatus?: 'todo' | 'done' | null;
  onReply: (ref: ReplyRef) => void;
  onTodoToggle: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const AgentChatBubble: React.FC<AgentChatBubbleProps> = ({ message, isCurrentUser, isConsecutive, todoStatus, onReply, onTodoToggle, onScrollToMessage }) => {
  const { getAgentColor } = useAgentChat();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const senderColor = message.senderColor || getAgentColor(message.sender);

  const handleReply = useCallback(() => {
    onReply({
      messageId: message.id,
      sender: message.sender,
      text: message.text.slice(0, 100),
    });
  }, [message, onReply]);

  const handleTodo = useCallback(() => {
    onTodoToggle(message.id);
  }, [message.id, onTodoToggle]);

  const handleReplyClick = useCallback(() => {
    if (message.replyTo && onScrollToMessage) {
      onScrollToMessage(message.replyTo.messageId);
    }
  }, [message.replyTo, onScrollToMessage]);

  // Render @mentions in text with colored pills
  const renderedText = useMemo(() => {
    return message.text.replace(/@(\w+)/g, (_match: string, name: string) => {
      const color = getAgentColor(name);
      return `<span class="${styles.mention}" style="color: ${color}">@${name}</span>`;
    });
  }, [message.text, getAgentColor]);

  if (message.isSystem) {
    return (
      <div className={classNames(styles.message, styles.systemMessage)}>
        <span className={styles.joinDot} style={{ background: senderColor }} />
        <span className={styles.joinText}>{message.text}</span>
      </div>
    );
  }

  const avatarInitial = message.sender.charAt(0).toUpperCase();
  const todoButtonLabel = todoStatus === 'todo' ? 'Done' : todoStatus === 'done' ? 'Unpin' : 'Pin';

  return (
    <div
      ref={bubbleRef}
      className={classNames(styles.message, {
        [styles.messageSelf]: isCurrentUser,
        [styles.messageConsecutive]: isConsecutive,
      })}
      data-message-id={message.id}
    >
      {/* Todo strip */}
      <div className={styles.todoStrip} data-status={todoStatus || ''} />

      {/* Avatar — hidden for consecutive same-sender messages */}
      {isConsecutive ? (
        <div className={styles.avatarSpacer} />
      ) : (
        <div className={styles.avatar} style={{ background: senderColor }}>
          {avatarInitial}
        </div>
      )}

      {/* Chat bubble */}
      <div className={styles.chatBubble} style={{ '--bubble-color': senderColor } as React.CSSProperties}>
        {/* Reply quote */}
        {message.replyTo && (
          <div className={styles.replyQuote} onClick={handleReplyClick} role='button' tabIndex={0} onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleReplyClick()}>
            <span className={styles.replySender}>{message.replyTo.sender}: </span>
            {message.replyTo.text}
          </div>
        )}

        {/* Bubble header — hidden for consecutive same-sender messages */}
        {!isConsecutive && (
          <div className={styles.bubbleHeader}>
            <span className={styles.msgSender} style={{ color: senderColor }}>
              {message.sender}
            </span>
            <span className={styles.msgTime}>{formatTime(message.timestamp)}</span>
          </div>
        )}

        {/* Message text with markdown */}
        <div className={styles.msgText}>
          <Markdown>{renderedText}</Markdown>
        </div>
      </div>

      {/* Actions (reply + pin) */}
      <div className={styles.msgActions}>
        <button type='button' className={styles.actionBtn} onClick={handleReply}>
          Reply
        </button>
        <button
          type='button'
          className={styles.actionBtn}
          onClick={handleTodo}
          style={todoStatus === 'todo' ? { color: '#4ade80' } : todoStatus === 'done' ? { color: '#f87171' } : undefined}
        >
          {todoButtonLabel}
        </button>
      </div>
    </div>
  );
};

export default React.memo(AgentChatBubble);
