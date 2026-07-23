/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tag, Spin, Button } from '@arco-design/web-react';
import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { useTranslation } from 'react-i18next';

export interface ThoughtData {
  subject: string;
  description: string;
}

type ThoughtDisplayProps = {
  thought?: ThoughtData;
  style?: 'default' | 'compact';
  running?: boolean;
  statusText?: string;
  onStop?: () => void;
  // Directed per-member attach retry, shown next to a runtime-failed status text.
  onRetryStart?: () => void;
  // Absolute start timestamp (ms) supplied by an external source (e.g. team slot work).
  startedAtMs?: number | null;
  // Explicit flag declaring elapsed time is driven by an external timestamp (team chain).
  externalElapsedSource?: boolean;
};

// Background gradient constants
const GRADIENT_DARK = 'linear-gradient(135deg, #464767 0%, #323232 100%)';
const GRADIENT_LIGHT = 'linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)';

const ThoughtDisplay: React.FC<ThoughtDisplayProps> = ({
  thought,
  style = 'default',
  running = false,
  statusText,
  onStop: _onStop,
  onRetryStart,
  startedAtMs,
  externalElapsedSource,
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

  // External mode with a valid absolute start timestamp → derive elapsed from it (state A).
  const hasValidStartedAt =
    externalElapsedSource === true &&
    typeof startedAtMs === 'number' &&
    Number.isFinite(startedAtMs) &&
    startedAtMs > 0;
  // External mode but timestamp invalid → suppress the elapsed number (state B).
  const suppressElapsed = externalElapsedSource === true && !hasValidStartedAt;
  // Show the elapsed number only while running and not suppressed; the spinner stays gated on `running`.
  const showElapsed = running && !suppressElapsed;

  // Timer for elapsed time
  useEffect(() => {
    // Branch A: external timestamp mode with a valid start. Base the elapsed time on the
    // absolute `startedAtMs`, so remount or effect re-runs recompute from the same origin
    // instead of resetting to zero. The inline predicate narrows `startedAtMs` to a number.
    if (
      externalElapsedSource === true &&
      typeof startedAtMs === 'number' &&
      Number.isFinite(startedAtMs) &&
      startedAtMs > 0
    ) {
      const tick = () => setElapsedTime(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
      tick();
      const timer = setInterval(tick, 1000);
      return () => clearInterval(timer);
    }

    // Branch B: external timestamp mode without a valid start. Do not start a timer; the
    // render layer suppresses the number and only shows the status text and spinner.
    if (externalElapsedSource === true) {
      setElapsedTime(0);
      return;
    }

    // Branch C: non-external mode (non-team). Preserve the original local timer behavior.
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
  }, [externalElapsedSource, startedAtMs, running, thought?.subject]);

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
  if (!thought?.subject && !running && !statusText) {
    return null;
  }

  // Loading-only mode: running without thought data (used by ACP when thinking is inline)
  if (!thought?.subject && (running || statusText)) {
    return (
      <div
        className='relative z-1 mb--20px pb-30px px-10px py-10px rd-t-20px text-14px lh-20px text-t-primary flex items-center gap-8px'
        style={containerStyle}
      >
        {running && <Spin size={14} />}
        {/* Left block fills the row and truncates long text (tooltip shows the
            full message); the retry button stays pinned on the right and never
            shrinks, so a long/localized status can't push it out of a narrow
            parallel-view column. */}
        <span className='text-t-secondary min-w-0 flex-1 truncate' title={statusText}>
          {statusText ?? t('conversation.chat.processing')}
          {showElapsed && <span className='ml-8px opacity-60'>({formatElapsedTime(elapsedTime)})</span>}
        </span>
        {onRetryStart && (
          <Button className='flex-shrink-0' size='mini' type='text' onClick={onRetryStart}>
            {t('team.work.retryStart', { defaultValue: 'Retry start' })}
          </Button>
        )}
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
        {showElapsed && (
          <span className='text-t-tertiary text-12px whitespace-nowrap'>({formatElapsedTime(elapsedTime)})</span>
        )}
      </div>
    </div>
  );
};

export default ThoughtDisplay;
