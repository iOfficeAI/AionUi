/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import MarqueePillLabel from './MarqueePillLabel';

/**
 * Model selector for ACP-based agents. Renders three states:
 * - null model info: disabled "Use CLI model" button (backward compatible)
 * - no available_models: read-only display of current model name
 * - has available_models: clickable dropdown selector
 *
 * Data fetching/syncing lives in `useAcpModelInfo` so the mobile action
 * sheet can read from the same source.
 */
const AcpModelSelector: React.FC<{
  conversation_id: string;
  /** ACP backend name for loading cached models (e.g., 'claude', 'qwen') */
  backend?: string;
  /** Pre-selected model ID from Guid page */
  initialModelId?: string;
  /** Wait for ACP warmup before reading runtime model info. */
  waitForWarmup?: boolean;
  /** Whether model switches should persist to the backend-wide preference key. */
  persistGlobalPreference?: boolean;
}> = ({ conversation_id, backend, initialModelId, waitForWarmup = false, persistGlobalPreference = true }) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobileHeaderCompact = Boolean(layout?.isMobile);
  const prepareRuntime = useCallback(() => warmupConversation(conversation_id), [conversation_id]);
  const { model_info, canSwitch, selectModel } = useAcpModelInfo({
    conversation_id,
    backend,
    initialModelId,
    prepareRuntime: waitForWarmup ? prepareRuntime : undefined,
    persistGlobalPreference,
    onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
    onSelectModelFailed: () => Message.error(t('agent.model.switchFailed')),
  });

  const defaultModelLabel = t('common.defaultModel');
  const rawDisplayLabel =
    (model_info?.current_model_id &&
      model_info.available_models.find((m) => m.id === model_info.current_model_id)?.label) ||
    model_info?.current_model_label ||
    model_info?.current_model_id ||
    '';
  const display_label = getModelDisplayLabel({
    selected_value: model_info?.current_model_id,
    selectedLabel: rawDisplayLabel,
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.useCliModel'),
  });
  const tooltipContent = display_label;

  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;

  if (!model_info) {
    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0 leading-none'>
            {renderLogo()}
            <MarqueePillLabel>{t('conversation.welcome.useCliModel')}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  if (!canSwitch) {
    return (
      <Tooltip content={tooltipContent} position='top'>
        <Button
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0 leading-none'>
            {renderLogo()}
            <MarqueePillLabel>{display_label}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Dropdown
      trigger='click'
      // Mobile: portal the popup to <body> so it escapes the titlebar slot.
      // Desktop: leave default container so click events reach Menu.Item normally.
      {...(isMobileHeaderCompact ? { getPopupContainer: () => document.body } : {})}
      droplist={
        <Menu>
          {model_info.available_models.map((model) => (
            <Menu.Item
              key={model.id}
              className={model.id === model_info.current_model_id ? 'bg-2!' : ''}
              onClick={() => selectModel(model.id)}
            >
              <div className='flex items-center gap-8px w-full'>
                <span>{model.label || model.id}</span>
              </div>
            </Menu.Item>
          ))}
        </Menu>
      }
    >
      <Button className='sendbox-model-btn header-model-btn agent-mode-compact-pill' shape='round' size='small'>
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          {renderLogo()}
          <MarqueePillLabel>{display_label}</MarqueePillLabel>
          <Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
