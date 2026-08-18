/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Popover } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TokenUsageCost, TokenUsageData } from '@/common/config/storage';
import { formatCurrency, formatNumber } from '@/renderer/services/i18n/format';

interface ContextUsageIndicatorProps {
  tokenUsage: TokenUsageData | null;
  /**
   * Agent-reported context window size. Without it (<= 0) the ring stays a
   * hollow track and the popover shows the raw token count instead of a
   * percentage — never a percentage against a guessed denominator.
   */
  context_limit: number;
  className?: string;
  size?: number;
}

const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = ({
  tokenUsage,
  context_limit,
  className = '',
  size = 20,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const hasWindow = context_limit > 0;

  const { percentage, displayTotal, displayLimit, isWarning, isDanger } = useMemo(() => {
    if (!tokenUsage) {
      return {
        percentage: 0,
        displayTotal: '0',
        displayLimit: '0',
        isWarning: false,
        isDanger: false,
      };
    }

    const total = tokenUsage.total_tokens;
    if (!hasWindow) {
      return {
        percentage: 0,
        displayTotal: formatTokenCount(total, locale),
        displayLimit: '0',
        isWarning: false,
        isDanger: false,
      };
    }

    const pct = (total / context_limit) * 100;

    return {
      percentage: pct,
      displayTotal: formatTokenCount(total, locale),
      displayLimit: formatTokenCount(context_limit, locale, true),
      isWarning: pct > 70,
      isDanger: pct > 90,
    };
  }, [tokenUsage, context_limit, hasWindow, locale]);

  if (!tokenUsage) {
    return null;
  }

  // 计算圆环参数
  const strokeWidth = 2;
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

  const breakdown = tokenUsage.breakdown;
  const breakdownParts: string[] = [];
  if (breakdown) {
    if (typeof breakdown.input_tokens === 'number') {
      breakdownParts.push(
        `${t('conversation.contextUsage.input', 'Input')} ${formatTokenCount(breakdown.input_tokens, locale)}`
      );
    }
    if (typeof breakdown.output_tokens === 'number') {
      breakdownParts.push(
        `${t('conversation.contextUsage.output', 'Output')} ${formatTokenCount(breakdown.output_tokens, locale)}`
      );
    }
    if (breakdown.cached_read_tokens) {
      breakdownParts.push(
        `${t('conversation.contextUsage.cachedRead', 'Cache read')} ${formatTokenCount(breakdown.cached_read_tokens, locale)}`
      );
    }
    if (breakdown.cached_write_tokens) {
      breakdownParts.push(
        `${t('conversation.contextUsage.cachedWrite', 'Cache write')} ${formatTokenCount(breakdown.cached_write_tokens, locale)}`
      );
    }
    if (breakdown.thought_tokens) {
      breakdownParts.push(
        `${t('conversation.contextUsage.thought', 'Thinking')} ${formatTokenCount(breakdown.thought_tokens, locale)}`
      );
    }
  }

  const details = (
    <>
      {tokenUsage.cost && (
        <div className='text-12px text-t-secondary mt-4px'>
          {t('conversation.contextUsage.sessionCost', 'Session cost')} ≈ {formatCostAmount(tokenUsage.cost, locale)}
        </div>
      )}
      {breakdownParts.length > 0 && (
        <div className='text-12px text-t-secondary mt-4px'>{breakdownParts.join(' · ')}</div>
      )}
    </>
  );

  // Percentages are only honest against an agent-reported window size —
  // never substitute a hardcoded per-model default here. Without a window
  // the popover reports the raw count and says the window is unknown.
  const popoverContent = hasWindow ? (
    <div className='p-8px min-w-160px'>
      <div className='text-14px font-medium text-t-primary'>
        {formatPercentage(percentage, locale)} · {displayTotal} / {displayLimit}{' '}
        {t('conversation.contextUsage.contextUsed', 'context used')}
      </div>
      {details}
    </div>
  ) : (
    <div className='p-8px min-w-160px'>
      <div className='text-14px font-medium text-t-primary'>
        {t('conversation.contextUsage.tokensUsed', '{{tokens}} tokens used', { tokens: displayTotal })}
      </div>
      <div className='text-12px text-t-secondary mt-4px'>
        {t('conversation.contextUsage.windowUnknown', 'Context window size unknown')}
      </div>
      {details}
    </div>
  );

  return (
    <Popover content={popoverContent} position='top' trigger='hover' className='context-usage-popover'>
      <div
        className={`context-usage-indicator cursor-pointer flex items-center justify-center ${className}`}
        style={{ width: 32, height: 32 }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          {/* 背景圆环 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke={getTrackColor()}
            strokeWidth={strokeWidth}
          />
          {/* 进度圆环 — only when the denominator is known; otherwise the hollow track alone signals "count available, window unknown" */}
          {hasWindow && (
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
          )}
        </svg>
      </div>
    </Popover>
  );
};

/**
 * Smallest amount that four fraction digits can still render honestly. Below
 * it, rounding to 4dp yields 0, and the currency's own minimum fraction digits
 * (2 for USD) then print it as "$0.00".
 */
const SUB_UNIT_PRECISION_FLOOR = 0.0001;

/**
 * Format an agent-reported cumulative session cost in the app language,
 * e.g. "$0.42" (en-US) or "0,42 $" (de-DE).
 *
 * Four fraction digits suit an ordinary session cost, but a single cheap turn
 * can bill fractions of a cent, and at that size `maximumFractionDigits: 4`
 * rounds to zero and renders "$0.00" — indistinguishable from free. Amounts
 * below the floor therefore switch to significant digits, which keeps the
 * charge visible ("$0.00003") without turning "$1,234.5678" into "$1,200" the
 * way significant digits would if applied across the whole range.
 *
 * Falls back to "0.4200 USD" when the currency code is not renderable.
 */
export function formatCostAmount(cost: TokenUsageCost, locale?: string): string {
  const isVisibleAtFourDigits = cost.amount === 0 || Math.abs(cost.amount) >= SUB_UNIT_PRECISION_FLOOR;
  const options: Intl.NumberFormatOptions = isVisibleAtFourDigits
    ? { maximumFractionDigits: 4 }
    : { maximumSignificantDigits: 2 };
  return formatCurrency(cost.amount, cost.currency, locale, options);
}

/**
 * Format the context-usage percentage in the app language, e.g. "4.8%" (en-US)
 * or "4,8 %" (fr-FR).
 */
export function formatPercentage(value: number, locale?: string): string {
  return formatNumber(value / 100, locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Format a token count as a compact "12.6K" / "1.2M" string.
 *
 * The K/M suffixes stay as-is — `Intl` compact notation is unusable here
 * (de-DE renders 12600 as "12.600", indistinguishable from a grouped integer) —
 * but the decimal separator follows the app language, so the popover does not
 * mix "0,42 $" with "12.6K".
 *
 * @param count token count
 * @param locale app language (`i18n.language`)
 * @param hideZeroDecimals drop a trailing zero decimal (1.0M → 1M), default false
 */
export function formatTokenCount(count: number, locale?: string, hideZeroDecimals = false): string {
  const withSuffix = (value: number, suffix: string): string => {
    // Keep the original rounding rule: a value that renders as "x.0" at one
    // decimal collapses to the floored integer.
    if (hideZeroDecimals && value.toFixed(1).endsWith('.0')) {
      return `${formatNumber(Math.floor(value), locale, { maximumFractionDigits: 0 })}${suffix}`;
    }
    return `${formatNumber(value, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`;
  };

  if (count >= 1_000_000) return withSuffix(count / 1_000_000, 'M');
  if (count >= 1_000) return withSuffix(count / 1_000, 'K');
  return formatNumber(count, locale, { maximumFractionDigits: 0 });
}

export default ContextUsageIndicator;
