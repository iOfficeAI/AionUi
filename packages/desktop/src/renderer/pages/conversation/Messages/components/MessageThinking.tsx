/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageThinking } from '@/common/chat/chatLib';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './MessageThinking.module.css';
import ToolShell from './ToolShell';

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

  const { content: text, status, subject } = message.content;
  const duration = message.content.duration ?? (message.content as { duration_ms?: number }).duration_ms;
  const isDone = status === 'done';
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);

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
    if (!isDone && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, isDone]);

  const state = isDone ? 'success' : 'running';
  const stateLabelKey = isDone ? 'messages.toolShell.stateThought' : 'messages.toolShell.stateThinking';
  const stateLabelFallback = isDone ? 'Thought' : 'Thinking';
  const stateLabel = t(stateLabelKey, { defaultValue: stateLabelFallback });
  const title = isDone
    ? t('conversation.thinking.complete', { defaultValue: 'Thought complete' })
    : subject || t('conversation.thinking.label', { defaultValue: 'Thinking...' });
  const meta = isDone ? formatDuration(duration || 0) : formatElapsedTime(elapsedTime);

  return (
    <ToolShell state={state} stateLabel={stateLabel} title={title} meta={meta} defaultExpanded={!isDone}>
      <div ref={bodyRef} className={styles.body}>
        {text}
      </div>
    </ToolShell>
  );
};

export default MessageThinking;
