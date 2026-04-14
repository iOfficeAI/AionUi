/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tag, Spin } from '@arco-design/web-react';
import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { useTranslation } from 'react-i18next';

export interface ThoughtData {
  subject: string;
  description: string;
}

interface ThoughtDisplayProps {
  thought?: ThoughtData;
  style?: 'default' | 'compact';
  running?: boolean;
  onStop?: () => void;
}

// Background gradient constants
const GRADIENT_DARK = 'linear-gradient(135deg, #464767 0%, #323232 100%)';
const GRADIENT_LIGHT = 'linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)';

const ThoughtDisplay: React.FC<ThoughtDisplayProps> = ({
  thought,
  style = 'default',
  running = false,
  onStop: _onStop,
}) => {
  const { theme } = useThemeContext();
  const { t } = useTranslation();

  // Format elapsed time with localized units
  const formatElapsedTime = (seconds: number): string => {
    const sUnit = t('common.unit.second_short', { defaultValue: 's' });
    const mUnit = t('common.unit.minute_short', { defaultValue: 'm' });

    if (seconds < 60) {
      return `${seconds}${sUnit}`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}${mUnit} ${remainingSeconds}${sUnit}`;
  };

  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  // Timer for elapsed time
  useEffect(() => {
    if (!running && !thought?.subject) {
      setElapsedTime(0);
      return;
    }

    startTimeRef.current = Date.now();
    setElapsedTime(0);

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [running, thought?.subject]);

  // Calculate final style based on theme and style prop
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
    };
  }, [theme, style]);

  // Hide when not running and no thought data
  if (!thought?.subject && !running) {
    return null;
  }

  // Loading-only mode: running without thought data (used by ACP when thinking is inline)
  if (running && !thought?.subject) {
    return (
      <div
        className='relative z-1 mb--20px pb-30px px-10px py-10px rd-t-20px text-14px lh-20px text-t-primary flex items-center gap-8px'
        style={containerStyle}
      >
        <Spin size={14} />
        <span className='text-t-secondary'>
          {t('conversation.chat.processing')}
          <span className='ml-8px opacity-60'>({formatElapsedTime(elapsedTime)})</span>
        </span>
      </div>
    );
  }

  // Full thought display mode: used by non-ACP platforms that still pass thought data
  const showDescription = thought?.description && thought.description !== thought.subject;

  return (
    <div
      className='relative z-1 mb--20px pb-30px px-10px py-10px rd-t-20px text-14px lh-20px text-t-primary'
      style={containerStyle}
    >
      <div className='flex items-center gap-8px'>
        {running && <Spin size={14} />}
        <Tag color='arcoblue' size='small'>
          {thought?.subject}
        </Tag>
        {showDescription && <span className='flex-1 truncate'>{thought?.description}</span>}
        {running && (
          <span className='text-t-tertiary text-12px whitespace-nowrap'>({formatElapsedTime(elapsedTime)})</span>
        )}
      </div>
    </div>
  );
};

export default ThoughtDisplay;
