/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageThinking } from '@/common/chat/chatLib';
import { Spin } from '@arco-design/web-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './MessageThinking.module.css';

const getFirstLine = (content: string): string => {
  const firstLine = content.split('\n')[0] || '';
  return firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;
};

const MessageThinking: React.FC<{ message: IMessageThinking }> = ({ message }) => {
  const { t } = useTranslation();

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const sUnit = t('common.unit.second_short', { defaultValue: 's' });
    const mUnit = t('common.unit.minute_short', { defaultValue: 'm' });

    if (seconds < 60) return `${seconds}${sUnit}`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}${mUnit} ${remaining}${sUnit}`;
  };

  const formatElapsedTime = (seconds: number): string => {
    const sUnit = t('common.unit.second_short', { defaultValue: 's' });
    const mUnit = t('common.unit.minute_short', { defaultValue: 'm' });

    if (seconds < 60) return `${seconds}${sUnit}`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}${mUnit} ${remaining}${sUnit}`;
  };

  const { content: text, status, duration, subject } = message.content;
  const isDone = status === 'done';
  const [expanded, setExpanded] = useState(!isDone);
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-collapse when status changes to done
  useEffect(() => {
    if (isDone) {
      setExpanded(false);
    }
  }, [isDone]);

  // Elapsed timer for active thinking
  useEffect(() => {
    if (isDone) return;

    startTimeRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isDone]);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (!isDone && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, isDone, expanded]);

  const summaryText = isDone
    ? `${t('conversation.thinking.complete', { defaultValue: 'Thought complete' })} (${formatDuration(duration || 0)}) — ${getFirstLine(text)}`
    : `${subject || t('conversation.thinking.label', { defaultValue: 'Thinking...' })} (${formatElapsedTime(elapsedTime)})`;

  return (
    <div className={styles.container}>
      <hr className={styles.divider} />
      <div className={styles.header} onClick={() => setExpanded((v) => !v)}>
        {!isDone && <Spin size={12} />}
        <span className={`${styles.arrow} ${expanded ? styles.arrowExpanded : ''}`}>{'\u25B6'}</span>
        <span className={styles.summary}>{summaryText}</span>
      </div>
      <div ref={bodyRef} className={`${styles.body} ${!expanded ? styles.collapsed : ''}`}>
        {text}
      </div>
      <hr className={styles.divider} />
    </div>
  );
};

export default MessageThinking;
