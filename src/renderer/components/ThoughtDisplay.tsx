/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tag, Spin } from '@arco-design/web-react';
import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import { useTranslation } from 'react-i18next';

export interface ThoughtData {
  subject: string;
  description: string;
}

interface ThoughtDisplayProps {
  thought: ThoughtData;
  style?: 'default' | 'compact';
  running?: boolean;
  onStop?: () => void;
}

// 背景渐变常量 Background gradient constants
const GRADIENT_DARK = 'linear-gradient(135deg, #464767 0%, #323232 100%)';
const GRADIENT_LIGHT = 'linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)';

// 格式化时间 Format elapsed time
const formatElapsedTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const ThoughtDisplay: React.FC<ThoughtDisplayProps> = ({ thought, style = 'default', running = false, onStop }) => {
  const { theme } = useThemeContext();
  const { t } = useTranslation();
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  // 计时器 Timer for elapsed time
  useEffect(() => {
    if (!running && !thought?.subject) {
      setElapsedTime(0);
      return;
    }

    // 开始新的计时
    startTimeRef.current = Date.now();
    setElapsedTime(0);

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [running, thought?.subject]);

  // 处理 ESC 键取消 Handle ESC key to cancel
  useEffect(() => {
    if (!running || !onStop) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onStop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [running, onStop]);

  // 根据主题和样式计算最终样式 Calculate final style based on theme and style prop
  const containerStyle = useMemo(() => {
    const background = theme === 'dark' ? GRADIENT_DARK : GRADIENT_LIGHT;

    if (style === 'compact') {
      return {
        background,
        marginBottom: '8px',
        maxHeight: '100px',
        overflow: 'scroll' as const,
      };
    }

    return {
      background,
      transform: 'translateY(36px)',
    };
  }, [theme, style]);

  // 如果没有 thought 且不在运行中，不显示
  if (!thought?.subject && !running) {
    return null;
  }

  // 运行中但没有 thought 时显示默认处理状态
  if (running && !thought?.subject) {
    return (
      <div className='px-10px py-10px rd-20px text-14px pb-40px lh-20px text-t-primary flex items-center gap-8px' style={containerStyle}>
        <Spin size={14} />
        <span className='text-t-secondary'>
          {t('conversation.chat.processing')}
          <span className='ml-8px opacity-60'>
            ({t('common.escToCancel')}, {formatElapsedTime(elapsedTime)})
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className='px-10px py-10px rd-20px text-14px pb-40px lh-20px text-t-primary' style={containerStyle}>
      <div className='flex items-center gap-8px'>
        {running && <Spin size={14} />}
        <Tag color='arcoblue' size='small'>
          {thought.subject}
        </Tag>
        <span className='flex-1 truncate'>{thought.description}</span>
        {running && (
          <span className='text-t-tertiary text-12px whitespace-nowrap'>
            ({t('common.escToCancel')}, {formatElapsedTime(elapsedTime)})
          </span>
        )}
      </div>
    </div>
  );
};

export default ThoughtDisplay;
