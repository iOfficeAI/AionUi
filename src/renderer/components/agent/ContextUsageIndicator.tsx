/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Popover } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TokenUsageData } from '@/common/config/storage';
import { DEFAULT_CONTEXT_LIMIT } from '@/renderer/utils/model/modelContextLimits';

interface ContextUsageIndicatorProps {
  tokenUsage: TokenUsageData | null;
  contextLimit?: number;
  className?: string;
  size?: number;
}

type ContextUsageLevel = 'normal' | 'warning' | 'danger';

type UsageStat = {
  key: string;
  value: string;
};

export function formatTokenCount(count: number, hideZeroDecimals = false): string {
  if (count >= 1_000_000) {
    const value = count / 1_000_000;
    const formatted = value.toFixed(1);
    return hideZeroDecimals && formatted.endsWith('.0') ? `${Math.floor(value)}M` : `${formatted}M`;
  }
  if (count >= 1_000) {
    const value = count / 1_000;
    const formatted = value.toFixed(1);
    return hideZeroDecimals && formatted.endsWith('.0') ? `${Math.floor(value)}K` : `${formatted}K`;
  }
  return count.toString();
}

export function getContextUsageLevel(percentage: number): ContextUsageLevel {
  if (percentage >= 90) {
    return 'danger';
  }
  if (percentage >= 80) {
    return 'warning';
  }
  return 'normal';
}

const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = ({
  tokenUsage,
  contextLimit = DEFAULT_CONTEXT_LIMIT,
  className = '',
  size = 24,
}) => {
  const { t } = useTranslation();

  const usage = useMemo(() => {
    if (!tokenUsage) {
      return null;
    }

    const safeLimit = contextLimit > 0 ? contextLimit : DEFAULT_CONTEXT_LIMIT;
    const total = tokenUsage.totalTokens;
    const percentage = (total / safeLimit) * 100;
    const level = getContextUsageLevel(percentage);
    const progress = Math.max(0, Math.min(percentage, 100));

    const stats: UsageStat[] = [
      {
        key: t('conversation.contextUsage.totalTokens', 'Total'),
        value: formatTokenCount(total),
      },
      {
        key: t('conversation.contextUsage.contextWindow', 'Window'),
        value: formatTokenCount(safeLimit, true),
      },
    ];

    if (typeof tokenUsage.inputTokens === 'number') {
      stats.push({
        key: t('conversation.contextUsage.inputTokens', 'Input'),
        value: formatTokenCount(tokenUsage.inputTokens),
      });
    }
    if (typeof tokenUsage.outputTokens === 'number') {
      stats.push({
        key: t('conversation.contextUsage.outputTokens', 'Output'),
        value: formatTokenCount(tokenUsage.outputTokens),
      });
    }
    if (typeof tokenUsage.reasoningTokens === 'number') {
      stats.push({
        key: t('conversation.contextUsage.reasoningTokens', 'Reasoning'),
        value: formatTokenCount(tokenUsage.reasoningTokens),
      });
    }
    if (typeof tokenUsage.cachedInputTokens === 'number') {
      stats.push({
        key: t('conversation.contextUsage.cachedInputTokens', 'Cache read'),
        value: formatTokenCount(tokenUsage.cachedInputTokens),
      });
    }
    if (typeof tokenUsage.cachedOutputTokens === 'number') {
      stats.push({
        key: t('conversation.contextUsage.cachedOutputTokens', 'Cache write'),
        value: formatTokenCount(tokenUsage.cachedOutputTokens),
      });
    }

    return {
      displayLimit: formatTokenCount(safeLimit, true),
      displayTotal: formatTokenCount(total),
      level,
      percentage,
      progress,
      stats,
    };
  }, [contextLimit, t, tokenUsage]);

  if (!usage) {
    return null;
  }

  const strokeWidth = size <= 18 ? 2 : 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (usage.progress / 100) * circumference;

  const strokeColor =
    usage.level === 'danger'
      ? 'rgb(var(--danger-6))'
      : usage.level === 'warning'
        ? 'rgb(var(--warning-6))'
        : 'rgb(var(--primary-6))';

  const trackColor = 'var(--color-fill-3)';
  const warningText =
    usage.level === 'danger'
      ? t('conversation.contextUsage.criticalWarning', 'Usage is above 90%. Responses may degrade or truncate.')
      : usage.level === 'warning'
        ? t('conversation.contextUsage.highWarning', 'Usage is above 80%. Consider starting a new conversation soon.')
        : null;

  const popoverContent = (
    <div className='w-244px p-12px'>
      <div className='flex items-start justify-between gap-12px'>
        <div>
          <div className='text-14px font-medium text-t-primary'>
            {t('conversation.contextUsage.title', 'Context usage')}
          </div>
          <div className='mt-4px text-12px text-t-secondary'>
            {usage.displayTotal} / {usage.displayLimit} {t('conversation.contextUsage.contextUsed', 'context used')}
          </div>
        </div>
        <div className='text-right'>
          <div className='text-15px font-semibold text-t-primary'>{usage.percentage.toFixed(1)}%</div>
          <div className='text-11px text-t-secondary'>{t('conversation.contextUsage.contextWindow', 'Window')}</div>
        </div>
      </div>

      <div className='mt-10px h-8px overflow-hidden rounded-full bg-[var(--color-fill-3)]'>
        <div
          className='h-full rounded-full transition-all duration-300 ease-out'
          style={{
            backgroundColor: strokeColor,
            width: `${usage.progress}%`,
          }}
        />
      </div>

      <div className='mt-12px grid grid-cols-2 gap-x-16px gap-y-8px'>
        {usage.stats.map((stat) => (
          <div key={stat.key} className='min-w-0'>
            <div className='text-11px text-t-secondary'>{stat.key}</div>
            <div className='text-13px font-medium text-t-primary'>{stat.value}</div>
          </div>
        ))}
      </div>

      {warningText ? (
        <div
          className='mt-12px rounded-8px px-8px py-6px text-12px'
          style={{
            backgroundColor: usage.level === 'danger' ? 'rgba(var(--danger-6), 0.12)' : 'rgba(var(--warning-6), 0.12)',
            color: strokeColor,
          }}
        >
          {warningText}
        </div>
      ) : null}
    </div>
  );

  return (
    <Popover content={popoverContent} position='top' trigger='hover' className='context-usage-popover'>
      <div
        className={`context-usage-indicator cursor-pointer flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        data-testid='context-usage-indicator'
        aria-label={`${usage.percentage.toFixed(1)}% ${t('conversation.contextUsage.contextUsed', 'context used')}`}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill='none' stroke={trackColor} strokeWidth={strokeWidth} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap='round'
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
          />
        </svg>
      </div>
    </Popover>
  );
};

export default ContextUsageIndicator;
