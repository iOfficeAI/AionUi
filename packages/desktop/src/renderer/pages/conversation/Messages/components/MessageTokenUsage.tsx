/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Popover } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TokenUsageData } from '@/common/config/storage';
import { extractTokenMetrics } from '@/common/chat/tokenUsage';
import { formatCostAmount, formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';
import { formatNumber } from '@/renderer/services/i18n/format';

export interface MessageTokenUsageProps {
  tokenUsage: TokenUsageData | null | undefined;
  className?: string;
}

const MessageTokenUsage: React.FC<MessageTokenUsageProps> = ({ tokenUsage, className = '' }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en-US';

  const metrics = useMemo(() => extractTokenMetrics(tokenUsage), [tokenUsage]);

  if (!tokenUsage || metrics.total <= 0) {
    return null;
  }

  const { total, input, output, cache, cacheRead, cacheWrite, thought, cost } = metrics;

  const inlineSummary = useMemo(() => {
    const parts = [
      `${t('conversation.contextUsage.total', 'Total')}: ${formatTokenCount(total, locale)}`,
      `${t('conversation.contextUsage.input', 'In')}: ${formatTokenCount(input, locale)}`,
      `${t('conversation.contextUsage.output', 'Out')}: ${formatTokenCount(output, locale)}`,
    ];
    if (cache > 0) {
      parts.push(`${t('conversation.contextUsage.cache', 'Cache')}: ${formatTokenCount(cache, locale)}`);
    }
    return parts.join(' · ');
  }, [total, input, output, cache, locale, t]);

  const popoverContent = (
    <div className='p-8px min-w-180px text-12px'>
      <div className='font-semibold text-13px text-t-primary mb-6px pb-4px border-b border-b-border'>
        {t('conversation.contextUsage.replyTokens', 'Reply tokens')}
      </div>
      <div className='flex flex-col gap-4px'>
        <div className='flex justify-between items-center text-t-primary font-medium'>
          <span>{t('conversation.contextUsage.total', 'Total')}</span>
          <span data-testid='message-token-usage-popover-total'>{formatNumber(total, locale)}</span>
        </div>
        <div className='flex justify-between items-center text-t-secondary'>
          <span>{t('conversation.contextUsage.input', 'Input')}</span>
          <span>{formatNumber(input, locale)}</span>
        </div>
        <div className='flex justify-between items-center text-t-secondary'>
          <span>{t('conversation.contextUsage.output', 'Output')}</span>
          <span>{formatNumber(output, locale)}</span>
        </div>
        {cacheRead > 0 && (
          <div className='flex justify-between items-center text-t-secondary'>
            <span>{t('conversation.contextUsage.cachedRead', 'Cache read')}</span>
            <span>{formatNumber(cacheRead, locale)}</span>
          </div>
        )}
        {cacheWrite > 0 && (
          <div className='flex justify-between items-center text-t-secondary'>
            <span>{t('conversation.contextUsage.cachedWrite', 'Cache write')}</span>
            <span>{formatNumber(cacheWrite, locale)}</span>
          </div>
        )}
        {cache > 0 && cacheRead === 0 && cacheWrite === 0 && (
          <div className='flex justify-between items-center text-t-secondary'>
            <span>{t('conversation.contextUsage.cache', 'Cache')}</span>
            <span>{formatNumber(cache, locale)}</span>
          </div>
        )}
        {thought > 0 && (
          <div className='flex justify-between items-center text-t-secondary'>
            <span>{t('conversation.contextUsage.thought', 'Thinking')}</span>
            <span>{formatNumber(thought, locale)}</span>
          </div>
        )}
        {cost && (
          <div className='flex justify-between items-center text-t-secondary pt-4px mt-2px border-t border-t-border'>
            <span>{t('conversation.contextUsage.sessionCost', 'Cost')}</span>
            <span>≈ {formatCostAmount(cost, locale)}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Popover content={popoverContent} position='top' trigger='hover'>
      <div
        data-testid='message-token-usage'
        className={`inline-flex items-center text-11px text-t-secondary select-none px-6px py-2px rounded-4px bg-fill-1 hover:bg-fill-2 transition-colors cursor-pointer ${className}`}
      >
        <span>{inlineSummary}</span>
      </div>
    </Popover>
  );
};

export default MessageTokenUsage;
