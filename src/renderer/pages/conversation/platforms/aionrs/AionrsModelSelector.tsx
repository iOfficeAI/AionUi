/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AionrsCapabilities } from '@process/agent/aionrs/protocol';
import type { AionrsModelSelection } from './useAionrsModelSelection';
import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import { formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

const MAX_TOOLTIP_LIMITS = 3;

const AionrsModelSelector: React.FC<{
  selection?: AionrsModelSelection;
  capabilities?: AionrsCapabilities | null;
  disabled?: boolean;
}> = ({ selection, capabilities, disabled = false }) => {
  const { t } = useTranslation();
  const { isOpen: isPreviewOpen } = usePreviewContext();
  const layout = useLayoutContext();
  const compact = isPreviewOpen || layout?.isMobile;
  const isMobileHeaderCompact = Boolean(layout?.isMobile);
  const defaultModelLabel = t('common.defaultModel');

  const { data: modelConfig } = useSWR<IProvider[]>('model.config', () => ipcBridge.mode.getModelConfig.invoke());

  const currentModel = selection?.currentModel;
  const currentModelId = capabilities?.current_model || currentModel?.useModel;
  const currentModelHealth = useMemo(() => {
    if (!currentModel || !modelConfig || !currentModelId) return { status: 'unknown', color: 'bg-gray-400' };
    const matchedProvider = modelConfig.find((provider) => provider.id === currentModel.id);
    const healthStatus = matchedProvider?.modelHealth?.[currentModelId]?.status || 'unknown';
    const healthColor =
      healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';
    return { status: healthStatus, color: healthColor };
  }, [currentModel, currentModelId, modelConfig]);

  const tooltipContent = useMemo(() => {
    if (!capabilities) {
      return null;
    }

    const limitLines = capabilities.account_limits?.limits.slice(0, MAX_TOOLTIP_LIMITS).flatMap((limit) => {
      const name = limit.limit_name || limit.limit_id || t('conversation.aionrs.limit');
      const entries: string[] = [];

      if (limit.primary) {
        entries.push(
          limit.primary.window_minutes
            ? t('conversation.aionrs.usageLimitWindow', {
                name,
                used: Math.round(limit.primary.used_percent),
                window: limit.primary.window_minutes,
              })
            : t('conversation.aionrs.usageLimit', {
                name,
                used: Math.round(limit.primary.used_percent),
              })
        );
      }

      if (limit.secondary) {
        const secondaryName = `${name} ${t('conversation.aionrs.secondaryWindow')}`;
        entries.push(
          limit.secondary.window_minutes
            ? t('conversation.aionrs.usageLimitWindow', {
                name: secondaryName,
                used: Math.round(limit.secondary.used_percent),
                window: limit.secondary.window_minutes,
              })
            : t('conversation.aionrs.usageLimit', {
                name: secondaryName,
                used: Math.round(limit.secondary.used_percent),
              })
        );
      }

      if (limit.credits?.has_credits) {
        entries.push(
          `${t('conversation.aionrs.creditsRemaining')}: ${
            limit.credits.unlimited
              ? t('conversation.aionrs.unlimitedCredits')
              : (limit.credits.balance ?? t('conversation.aionrs.unlimitedCredits'))
          }`
        );
      }

      return entries;
    });

    const rows = [
      currentModelId ? selection?.getDisplayModelName(currentModelId, { truncate: false }) : null,
      capabilities.account_limits?.plan_type
        ? `${t('conversation.aionrs.plan')}: ${capabilities.account_limits.plan_type}`
        : null,
      capabilities.context_limit
        ? `${t('conversation.aionrs.contextWindow')}: ${formatTokenCount(capabilities.context_limit, true)}`
        : null,
      capabilities.compaction?.enabled
        ? `${t('conversation.aionrs.autoCompactAt')}: ${formatTokenCount(capabilities.compaction.autocompact_trigger, true)}`
        : null,
      capabilities.compaction?.enabled
        ? `${t('conversation.aionrs.emergencyLimit')}: ${formatTokenCount(capabilities.compaction.emergency_limit, true)}`
        : null,
      ...(limitLines ?? []),
    ].filter(Boolean);

    if (rows.length === 0) {
      return null;
    }

    return (
      <div className='min-w-180px p-8px flex flex-col gap-4px text-12px text-t-primary'>
        {rows.map((row, index) => (
          <div key={`${index}-${row}`}>{row}</div>
        ))}
      </div>
    );
  }, [capabilities, currentModelId, selection, t]);

  const buttonClassName = classNames(
    'sendbox-model-btn header-model-btn',
    compact && '!max-w-[120px]',
    isMobileHeaderCompact && '!max-w-[160px]'
  );

  if (disabled || !selection) {
    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button className={buttonClassName} shape='round' size='small' style={{ cursor: 'default' }}>
          <span className='flex items-center gap-6px min-w-0'>
            <span className={compact ? 'block truncate' : undefined}>{t('conversation.welcome.useCliModel')}</span>
          </span>
        </Button>
      </Tooltip>
    );
  }

  const { providers, getAvailableModels, handleSelectModel } = selection;
  const currentLabel = selection.getDisplayModelName(currentModelId, { truncate: false });
  const label = getModelDisplayLabel({
    selectedValue: currentModelId,
    selectedLabel: currentLabel || currentModelId || '',
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.selectModel'),
  });

  const triggerButton = (
    <Button className={buttonClassName} shape='round' size='small'>
      <span className='flex items-center gap-6px min-w-0'>
        {currentModelHealth.status !== 'unknown' && (
          <div className={`w-6px h-6px rounded-full shrink-0 ${currentModelHealth.color}`} />
        )}
        <span className={compact ? 'block truncate' : undefined}>{label}</span>
      </span>
    </Button>
  );

  const wrappedTrigger = tooltipContent ? (
    <Tooltip content={tooltipContent} position='bottom'>
      {triggerButton}
    </Tooltip>
  ) : (
    triggerButton
  );

  return (
    <Dropdown
      trigger='click'
      droplist={
        <Menu>
          {providers.map((provider) => {
            const models = getAvailableModels(provider);
            if (!models.length) return null;

            return (
              <Menu.ItemGroup title={provider.name} key={provider.id}>
                {models.map((modelName) => {
                  const matchedProvider = modelConfig?.find((candidate) => candidate.id === provider.id);
                  const healthStatus = matchedProvider?.modelHealth?.[modelName]?.status || 'unknown';
                  const healthColor =
                    healthStatus === 'healthy'
                      ? 'bg-green-500'
                      : healthStatus === 'unhealthy'
                        ? 'bg-red-500'
                        : 'bg-gray-400';

                  return (
                    <Menu.Item
                      key={`${provider.id}-${modelName}`}
                      className={currentModel?.id + currentModelId === provider.id + modelName ? '!bg-2' : ''}
                      onClick={() => void handleSelectModel(provider, modelName)}
                    >
                      <div className='flex items-center gap-8px w-full'>
                        {healthStatus !== 'unknown' && (
                          <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />
                        )}
                        <span>{selection.getDisplayModelName(modelName, { truncate: false })}</span>
                      </div>
                    </Menu.Item>
                  );
                })}
              </Menu.ItemGroup>
            );
          })}
        </Menu>
      }
    >
      {wrappedTrigger}
    </Dropdown>
  );
};

export default AionrsModelSelector;
