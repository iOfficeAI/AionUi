/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Popover } from '@arco-design/web-react';
import { Brain, SettingTwo } from '@icon-park/react';
import classNames from 'classnames';
import type { TFunction } from 'i18next';
import {
  formatCostAmount,
  formatPercentage,
  formatTokenCount,
} from '@/renderer/components/agent/ContextUsageIndicator';
import { useActiveModelUsage } from '@/renderer/hooks/agent/useActiveModelUsage';
import type { SiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

export function formatResetCountdown(resetTime: string, t: TFunction): string {
  const target = new Date(resetTime).getTime();
  const now = Date.now();
  const diffMs = target - now;

  if (isNaN(target) || diffMs <= 0) {
    return t('conversation.contextUsage.resetsNow', 'resets now');
  }

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(diffMinutes / (24 * 60));
  const hours = Math.floor((diffMinutes % (24 * 60)) / 60);
  const minutes = diffMinutes % 60;

  let timeStr = '';
  if (days > 0) {
    timeStr = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  } else if (hours > 0) {
    timeStr = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  } else {
    timeStr = `${Math.max(1, minutes)}m`;
  }

  return t('conversation.contextUsage.resetsIn', { defaultValue: 'resets in {{time}}', time: timeStr });
}

export function getQuotaEntrySubtitle(
  entry: {
    fiveHourPct?: number;
    weeklyPct?: number;
  },
  locale: string,
  t: TFunction
): string {
  if (entry.fiveHourPct !== undefined && entry.weeklyPct !== undefined) {
    const formatted5h = formatPercentage(entry.fiveHourPct, locale);
    const formattedWk = formatPercentage(entry.weeklyPct, locale);
    const weeklyLabel = t('conversation.contextUsage.weeklyShort', 'Wk');
    return t('conversation.contextUsage.quotaDualSummary', {
      defaultValue: '5h: {{fiveHour}} • {{weeklyLabel}}: {{weekly}}',
      fiveHour: formatted5h,
      weeklyLabel,
      weekly: formattedWk,
    });
  }

  if (entry.fiveHourPct !== undefined) {
    return t('conversation.contextUsage.quotaRemainingSummary', {
      defaultValue: '{{percentage}} remaining (5h)',
      percentage: formatPercentage(entry.fiveHourPct, locale),
      window: '5h',
    });
  }

  if (entry.weeklyPct !== undefined) {
    const weeklyLabel = t('conversation.contextUsage.weeklyLimit', 'Weekly');
    return t('conversation.contextUsage.quotaRemainingSummary', {
      defaultValue: '{{percentage}} remaining ({{window}})',
      percentage: formatPercentage(entry.weeklyPct, locale),
      window: weeklyLabel,
    });
  }

  return '';
}

interface SiderModelUsageProps {
  collapsed?: boolean;
  isMobile?: boolean;
  siderTooltipProps?: SiderTooltipProps;
}

const SiderModelUsage: React.FC<SiderModelUsageProps> = ({
  collapsed = false,
  isMobile,
  siderTooltipProps: _siderTooltipProps,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigate = useNavigate();

  const {
    modelName,
    agentName,
    totalTokens,
    contextLimit,
    percentage,
    hasLimit,
    isWarning,
    isDanger,
    cost,
    breakdown,
    quotaData,
    quotaEntries,
    primaryBucket,
    quotaType,
  } = useActiveModelUsage();

  const displayModelName = modelName || t('common.defaultModel', 'Default Model');

  const displayTotal = useMemo(() => formatTokenCount(totalTokens, locale), [totalTokens, locale]);
  const displayLimit = useMemo(
    () => (contextLimit > 0 ? formatTokenCount(contextLimit, locale, true) : '0'),
    [contextLimit, locale]
  );

  const formattedPct = useMemo(() => formatPercentage(percentage, locale), [percentage, locale]);

  const usageSubtitle = useMemo(() => {
    if (quotaType === 'account_quota' && primaryBucket) {
      const windowLabel = primaryBucket.window === '5h' ? '5h' : t('conversation.contextUsage.weeklyLimit', 'Weekly');
      return t('conversation.contextUsage.quotaRemainingSummary', '{{percentage}} remaining ({{window}})', {
        percentage: formattedPct,
        window: windowLabel,
      });
    }

    if (quotaType === 'context_window' && hasLimit) {
      return t('conversation.contextUsage.quotaSummary', '{{percentage}} quota • {{tokens}}', {
        percentage: formattedPct,
        tokens: `${displayTotal} / ${displayLimit}`,
      });
    }

    if (totalTokens <= 0) {
      return t('conversation.contextUsage.noUsage', '0 tokens');
    }
    return t('conversation.contextUsage.tokensUsed', '{{tokens}} tokens', { tokens: displayTotal });
  }, [quotaType, primaryBucket, hasLimit, totalTokens, formattedPct, displayTotal, displayLimit, t]);

  const handleNavigateToModelSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigate('/settings/model');
  };

  // Ring calculations for SVG gauge
  const strokeColor = isDanger ? 'rgb(var(--danger-6))' : isWarning ? 'rgb(var(--warning-6))' : 'rgb(var(--primary-6))';

  // Expanded entry ring (size 20, r 7.5)
  const radiusExpanded = 7.5;
  const circumferenceExpanded = 2 * Math.PI * radiusExpanded;

  // Collapsed entry ring (size 18, r 7)
  const radiusCollapsed = 7;
  const circumferenceCollapsed = 2 * Math.PI * radiusCollapsed;

  // Fallback single ring (size 22, r 8.5)
  const radiusFallback = 8.5;
  const circumferenceFallback = 2 * Math.PI * radiusFallback;
  const strokeDashoffsetFallback = circumferenceFallback - (Math.min(percentage, 100) / 100) * circumferenceFallback;

  const breakdownParts = useMemo(() => {
    if (!breakdown) return [];
    const parts: Array<{ label: string; value: string }> = [];
    if (typeof breakdown.input_tokens === 'number') {
      parts.push({
        label: t('conversation.contextUsage.input', 'Input'),
        value: formatTokenCount(breakdown.input_tokens, locale),
      });
    }
    if (typeof breakdown.output_tokens === 'number') {
      parts.push({
        label: t('conversation.contextUsage.output', 'Output'),
        value: formatTokenCount(breakdown.output_tokens, locale),
      });
    }
    if (breakdown.cached_read_tokens) {
      parts.push({
        label: t('conversation.contextUsage.cachedRead', 'Cache read'),
        value: formatTokenCount(breakdown.cached_read_tokens, locale),
      });
    }
    if (breakdown.cached_write_tokens) {
      parts.push({
        label: t('conversation.contextUsage.cachedWrite', 'Cache write'),
        value: formatTokenCount(breakdown.cached_write_tokens, locale),
      });
    }
    if (breakdown.thought_tokens) {
      parts.push({
        label: t('conversation.contextUsage.thought', 'Thinking'),
        value: formatTokenCount(breakdown.thought_tokens, locale),
      });
    }
    return parts;
  }, [breakdown, locale, t]);

  const popoverContent = (
    <div
      className='p-10px min-w-240px max-w-300px flex flex-col gap-8px select-none'
      data-testid='sider-model-usage-popover'
    >
      {/* Header */}
      <div className='flex items-center justify-between gap-8px pb-8px border-b border-solid border-[var(--color-border-2)]'>
        <div className='flex items-center gap-6px min-w-0 flex-1'>
          <Brain theme='outline' size='16' fill='currentColor' className='text-primary shrink-0' />
          <span className='text-13px font-semibold text-t-primary truncate' title={displayModelName}>
            {displayModelName}
          </span>
        </div>
        {agentName && (
          <span className='px-6px py-1px text-10px font-medium rd-4px bg-fill-2 text-t-secondary shrink-0'>
            {agentName}
          </span>
        )}
      </div>

      {/* Real Account Quotas */}
      {quotaEntries.length > 0 ? (
        <div className='flex flex-col gap-6px'>
          <div className='text-11px font-semibold uppercase tracking-wider text-t-secondary'>
            {t('conversation.contextUsage.modelQuota', 'Model Quota')}
          </div>
          {quotaEntries.map((entry) => {
            const group = quotaData?.groups.find((g) => g.name === entry.groupName);
            const buckets = group?.buckets || [];

            return (
              <div
                key={entry.key}
                className='flex flex-col gap-4px p-6px rd-6px bg-fill-1 border border-solid border-[var(--color-border-2)]'
              >
                <div className='flex items-center justify-between'>
                  <span className='text-12px font-medium text-t-primary'>{entry.name}</span>
                  {entry.isActive && (
                    <span className='px-4px py-0.5px text-9px font-medium rd-3px bg-primary/10 text-primary'>
                      {t('conversation.contextUsage.active', 'Active')}
                    </span>
                  )}
                </div>
                {buckets.map((bucket, bucketIdx) => {
                  const bucketPct = Math.round(bucket.remainingFraction * 1000) / 10;
                  const bucketPctFormatted = formatPercentage(bucketPct, locale);
                  const bucketIsDanger = bucketPct <= 10;
                  const bucketIsWarning = bucketPct <= 30;
                  const bucketColor = bucketIsDanger
                    ? 'rgb(var(--danger-6))'
                    : bucketIsWarning
                      ? 'rgb(var(--warning-6))'
                      : 'rgb(var(--primary-6))';
                  const bucketLabel =
                    bucket.window === '5h'
                      ? t('conversation.contextUsage.fiveHourLimit', '5-Hour Limit')
                      : bucket.window === 'weekly'
                        ? t('conversation.contextUsage.weeklyLimit', 'Weekly Limit')
                        : bucket.name;

                  return (
                    <div key={bucketIdx} className='flex flex-col gap-2px'>
                      <div className='flex items-center justify-between text-11px'>
                        <span className='text-t-secondary'>{bucketLabel}</span>
                        <span
                          className={classNames(
                            'font-mono font-medium',
                            bucketIsDanger ? 'text-danger-6' : bucketIsWarning ? 'text-warning-6' : 'text-t-primary'
                          )}
                        >
                          {bucketPctFormatted} {t('conversation.contextUsage.remaining', 'remaining')}
                        </span>
                      </div>
                      <div className='w-full h-5px rd-3px bg-fill-3 overflow-hidden'>
                        <div
                          className='h-full rd-3px transition-all duration-300'
                          style={{
                            width: `${Math.min(bucketPct, 100)}%`,
                            backgroundColor: bucketColor,
                          }}
                        />
                      </div>
                      {bucket.resetTime && (
                        <div className='text-10px text-t-tertiary flex justify-end'>
                          {formatResetCountdown(bucket.resetTime, t)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : hasLimit && quotaType === 'context_window' ? (
        /* Standard Context Window Quota */
        <div className='flex flex-col gap-4px'>
          <div className='flex items-center justify-between text-12px'>
            <span className='text-t-secondary'>{t('conversation.contextUsage.quota', 'Quota')}</span>
            <span
              className={classNames(
                'font-mono font-medium',
                isDanger ? 'text-danger-6' : isWarning ? 'text-warning-6' : 'text-t-primary'
              )}
            >
              {formattedPct} ({displayTotal} / {displayLimit})
            </span>
          </div>
          <div className='w-full h-6px rd-3px bg-fill-3 overflow-hidden'>
            <div
              className='h-full rd-3px transition-all duration-300'
              style={{
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: strokeColor,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Session Tokens Section */}
      <div className='flex flex-col gap-4px pt-4px border-t border-solid border-[var(--color-border-2)]'>
        <div className='flex items-center justify-between text-11px'>
          <span className='font-semibold uppercase tracking-wider text-t-secondary'>
            {t('conversation.contextUsage.sessionUsage', 'Session Usage')}
          </span>
          <span className='font-mono font-medium text-t-primary'>{displayTotal}</span>
        </div>

        {/* Breakdown Details */}
        {breakdownParts.length > 0 && (
          <div className='flex flex-col gap-2px pt-2px text-11px text-t-secondary'>
            {breakdownParts.map((part, index) => (
              <div key={index} className='flex items-center justify-between'>
                <span>{part.label}</span>
                <span className='font-mono text-t-primary'>{part.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Session Cost */}
        {cost && (
          <div className='flex items-center justify-between text-11px text-t-secondary pt-2px border-t border-dashed border-[var(--color-border-2)]'>
            <span>{t('conversation.contextUsage.sessionCost', 'Session cost')}</span>
            <span className='font-mono font-medium text-t-primary'>≈ {formatCostAmount(cost, locale)}</span>
          </div>
        )}
      </div>

      {/* Footer Action: Settings Link */}
      <div className='pt-6px border-t border-solid border-[var(--color-border-2)] flex justify-end'>
        <div
          onClick={handleNavigateToModelSettings}
          className='flex items-center gap-4px text-11px text-primary hover:text-primary-hover cursor-pointer transition-colors'
        >
          <SettingTwo theme='outline' size='12' fill='currentColor' />
          <span>{t('settings.model', 'Model settings')}</span>
        </div>
      </div>
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      position={collapsed ? 'right' : 'top'}
      trigger='hover'
      popupHoverStay
      className='sider-model-usage-popover'
    >
      {collapsed ? (
        quotaEntries.length > 0 ? (
          <div
            onClick={handleNavigateToModelSettings}
            data-testid='sider-model-usage-collapsed'
            className='w-full flex flex-col items-center justify-center gap-4px py-2px rd-0.5rem cursor-pointer transition-colors hover:bg-fill-3 active:bg-fill-4'
          >
            {quotaEntries.map((entry) => {
              const subtitle = getQuotaEntrySubtitle(entry, locale, t);
              const strokeColorEntry = entry.isDanger
                ? 'rgb(var(--danger-6))'
                : entry.isWarning
                  ? 'rgb(var(--warning-6))'
                  : 'rgb(var(--primary-6))';
              const strokeDashoffset =
                circumferenceCollapsed - (Math.min(entry.primaryPct, 100) / 100) * circumferenceCollapsed;

              return (
                <div
                  key={entry.key}
                  title={`${entry.name} - ${subtitle}`}
                  className='size-20px flex items-center justify-center'
                >
                  <svg width='18' height='18' viewBox='0 0 18 18' style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx='9' cy='9' r='7' fill='none' stroke='var(--color-fill-3)' strokeWidth='1.8' />
                    <circle
                      cx='9'
                      cy='9'
                      r='7'
                      fill='none'
                      stroke={strokeColorEntry}
                      strokeWidth='1.8'
                      strokeLinecap='round'
                      strokeDasharray={circumferenceCollapsed}
                      strokeDashoffset={strokeDashoffset}
                      style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            onClick={handleNavigateToModelSettings}
            data-testid='sider-model-usage-collapsed'
            className='h-34px w-full flex items-center justify-center rd-0.5rem cursor-pointer transition-colors hover:bg-fill-3 active:bg-fill-4'
          >
            {hasLimit ? (
              <svg width='20' height='20' viewBox='0 0 20 20' style={{ transform: 'rotate(-90deg)' }}>
                <circle cx='10' cy='10' r='7.5' fill='none' stroke='var(--color-fill-3)' strokeWidth='2' />
                <circle
                  cx='10'
                  cy='10'
                  r='7.5'
                  fill='none'
                  stroke={strokeColor}
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeDasharray={circumferenceCollapsed}
                  strokeDashoffset={circumferenceCollapsed - (Math.min(percentage, 100) / 100) * circumferenceCollapsed}
                  style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
                />
              </svg>
            ) : (
              <Brain theme='outline' size='16' fill='currentColor' className='text-t-secondary' />
            )}
          </div>
        )
      ) : quotaEntries.length > 0 ? (
        <div
          onClick={handleNavigateToModelSettings}
          data-testid='sider-model-usage'
          className={classNames(
            'w-full flex flex-col gap-2px select-none min-w-0 cursor-pointer',
            isMobile && 'sider-footer-btn-mobile'
          )}
        >
          {quotaEntries.map((entry) => {
            const subtitle = getQuotaEntrySubtitle(entry, locale, t);
            const entryColor = entry.isDanger
              ? 'rgb(var(--danger-6))'
              : entry.isWarning
                ? 'rgb(var(--warning-6))'
                : 'rgb(var(--primary-6))';
            const strokeDashoffset =
              circumferenceExpanded - (Math.min(entry.primaryPct, 100) / 100) * circumferenceExpanded;

            return (
              <div
                key={entry.key}
                data-testid={`sider-model-usage-entry-${entry.key}`}
                className={classNames(
                  'group h-36px flex items-center rd-0.5rem transition-colors px-8px py-3px hover:bg-fill-3 active:bg-fill-4 select-none min-w-0',
                  entry.isActive && 'bg-fill-2/80'
                )}
              >
                {/* Leading Icon / Circular Gauge */}
                <span className='size-20px flex items-center justify-center shrink-0 me-8px relative'>
                  <svg width='20' height='20' viewBox='0 0 20 20' style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx='10' cy='10' r='7.5' fill='none' stroke='var(--color-fill-3)' strokeWidth='2' />
                    <circle
                      cx='10'
                      cy='10'
                      r='7.5'
                      fill='none'
                      stroke={entryColor}
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeDasharray={circumferenceExpanded}
                      strokeDashoffset={strokeDashoffset}
                      style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
                    />
                  </svg>
                </span>

                {/* Model Name & Quota Info */}
                <div className='flex flex-col min-w-0 flex-1 justify-center leading-tight'>
                  <div className='flex items-center justify-between gap-4px min-w-0'>
                    <span className='text-12px font-medium text-t-primary truncate' title={entry.name}>
                      {entry.name}
                    </span>
                    <span
                      className={classNames(
                        'text-10px font-mono font-medium shrink-0',
                        entry.isDanger ? 'text-danger-6' : entry.isWarning ? 'text-warning-6' : 'text-t-secondary'
                      )}
                    >
                      {Math.round(entry.primaryPct)}%
                    </span>
                  </div>
                  <span className='text-10px text-t-tertiary truncate' title={subtitle}>
                    {subtitle}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Fallback single model row */
        <div
          onClick={handleNavigateToModelSettings}
          data-testid='sider-model-usage'
          className={classNames(
            'group h-40px flex items-center rd-0.5rem cursor-pointer transition-colors px-10px py-4px hover:bg-fill-3 active:bg-fill-4 select-none min-w-0',
            isMobile && 'sider-footer-btn-mobile'
          )}
        >
          {/* Leading Icon / Circular Gauge */}
          <span className='size-22px flex items-center justify-center shrink-0 me-8px relative'>
            {hasLimit ? (
              <svg width='22' height='22' viewBox='0 0 22 22' style={{ transform: 'rotate(-90deg)' }}>
                <circle cx='11' cy='11' r='8.5' fill='none' stroke='var(--color-fill-3)' strokeWidth='2' />
                <circle
                  cx='11'
                  cy='11'
                  r='8.5'
                  fill='none'
                  stroke={strokeColor}
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeDasharray={circumferenceFallback}
                  strokeDashoffset={strokeDashoffsetFallback}
                  style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
                />
              </svg>
            ) : (
              <Brain theme='outline' size='18' fill='currentColor' className='text-primary' />
            )}
          </span>

          {/* Model Name & Quota Info */}
          <div className='flex flex-col min-w-0 flex-1 justify-center leading-tight'>
            <div className='flex items-center justify-between gap-4px min-w-0'>
              <span className='text-12px font-medium text-t-primary truncate' title={displayModelName}>
                {displayModelName}
              </span>
              {hasLimit && (
                <span
                  className={classNames(
                    'text-10px font-mono font-medium shrink-0',
                    isDanger ? 'text-danger-6' : isWarning ? 'text-warning-6' : 'text-t-secondary'
                  )}
                >
                  {Math.round(percentage)}%
                </span>
              )}
            </div>
            <span className='text-10px text-t-tertiary truncate' title={usageSubtitle}>
              {usageSubtitle}
            </span>
          </div>
        </div>
      )}
    </Popover>
  );
};

export default SiderModelUsage;
