/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Popover } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TokenUsageData } from '@/common/storage';

// 从 modelContextLimits 导入默认上下文限制
import { DEFAULT_CONTEXT_LIMIT } from '@/renderer/utils/modelContextLimits';

interface ContextUsageIndicatorProps {
  tokenUsage: TokenUsageData | null;
  contextLimit?: number;
  className?: string;
  size?: number;
}

const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = ({ tokenUsage, contextLimit = DEFAULT_CONTEXT_LIMIT, className = '', size = 24 }) => {
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

    return {
      percentage: pct,
      displayTotal: formatTokenCount(total),
      displayLimit: formatTokenCount(contextLimit, true),
      isWarning: pct > 70,
      isDanger: pct > 90,
    };
  }, [tokenUsage, contextLimit]);

  // 如果没有 token 数据，不显示
  if (!tokenUsage) {
    return null;
  }

  // 计算圆环参数
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // 根据状态获取颜色
  const getStrokeColor = () => {
    if (isDanger) return 'rgb(var(--danger-6))';
    if (isWarning) return 'rgb(var(--warning-6))';
    return 'rgb(var(--primary-6))';
  };

  // 背景圆环颜色 - 适配深浅主题
  const getTrackColor = () => {
    return 'var(--color-fill-3)';
  };

  const popoverContent = (
    <div className='p-8px min-w-160px'>
      <div className='text-14px font-medium text-t-primary'>
        {percentage.toFixed(1)}% · {displayTotal} / {displayLimit} {t('conversation.contextUsage.contextUsed', 'context used')}
      </div>
    </div>
  );

  return (
    <Popover content={popoverContent} position='top' trigger='hover' className='context-usage-popover'>
      <div className={`context-usage-indicator cursor-pointer flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          {/* 背景圆环 */}
          <circle cx={size / 2} cy={size / 2} r={radius} fill='none' stroke={getTrackColor()} strokeWidth={strokeWidth} />
          {/* 进度圆环 */}
          <circle cx={size / 2} cy={size / 2} r={radius} fill='none' stroke={getStrokeColor()} strokeWidth={strokeWidth} strokeLinecap='round' strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }} />
        </svg>
      </div>
    </Popover>
  );
};

/**
 * 格式化 token 数量显示
 * @param count token 数量
 * @param hideZeroDecimals 是否隐藏小数点为0的情况（如 1.0M 显示为 1M），默认为 false
 * @returns 格式化后的字符串，如 "37.0K" 或 "1.2M"，当 hideZeroDecimals 为 true 时 "1.0M" 显示为 "1M"
 */
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
