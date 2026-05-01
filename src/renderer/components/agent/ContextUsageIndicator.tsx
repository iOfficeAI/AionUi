/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TokenUsageData } from '@/common/config/storage';
import { DEFAULT_CONTEXT_LIMIT } from '@/renderer/utils/model/modelContextLimits';
import { Popover } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface ContextUsageIndicatorProps {
  tokenUsage: TokenUsageData | null;
  contextLimit?: number;
  compaction?: {
    enabled: boolean;
    context_window: number;
    output_reserve: number;
    autocompact_trigger: number;
    emergency_limit: number;
  } | null;
  className?: string;
  size?: number;
}

const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = ({
  tokenUsage,
  contextLimit = DEFAULT_CONTEXT_LIMIT,
  compaction = null,
  className = '',
  size = 24,
}) => {
  const { t } = useTranslation();

  const { percentage, displayTotal, displayLimit, isWarning, isDanger } = useMemo(() => {
    if (!tokenUsage) {
      return {
        percentage: 0,
        displayTotal: '0',
        displayLimit: formatTokenCount(contextLimit, true),
        isWarning: false,
        isDanger: false,
      };
    }

    const total = tokenUsage.totalTokens;
    const pct = (total / contextLimit) * 100;
    const warningThreshold = compaction?.enabled ? compaction.autocompact_trigger : contextLimit * 0.7;
    const dangerThreshold = compaction?.enabled ? compaction.emergency_limit : contextLimit * 0.9;

    return {
      percentage: pct,
      displayTotal: formatTokenCount(total),
      displayLimit: formatTokenCount(contextLimit, true),
      isWarning: total >= warningThreshold,
      isDanger: total >= dangerThreshold,
    };
  }, [compaction, contextLimit, tokenUsage]);

  if (!tokenUsage) {
    return null;
  }

  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getStrokeColor = () => {
    if (isDanger) return 'rgb(var(--danger-6))';
    if (isWarning) return 'rgb(var(--warning-6))';
    return 'rgb(var(--primary-6))';
  };

  const popoverContent = (
    <div className='p-8px min-w-160px'>
      <div className='text-14px font-medium text-t-primary'>
        {percentage.toFixed(1)}% {displayTotal} / {displayLimit}{' '}
        {t('conversation.contextUsage.contextUsed', 'context used')}
      </div>
      {compaction?.enabled && (
        <div className='mt-6px flex flex-col gap-2px text-12px text-t-secondary'>
          <div>
            {t('conversation.aionrs.autoCompactAt')}: {formatTokenCount(compaction.autocompact_trigger, true)}
          </div>
          <div>
            {t('conversation.aionrs.emergencyLimit')}: {formatTokenCount(compaction.emergency_limit, true)}
          </div>
          <div>
            {t('conversation.aionrs.outputReserve')}: {formatTokenCount(compaction.output_reserve, true)}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Popover content={popoverContent} position='top' trigger='hover' className='context-usage-popover'>
      <div
        className={`context-usage-indicator cursor-pointer flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke='var(--color-fill-3)'
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke={getStrokeColor()}
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

export default ContextUsageIndicator;
