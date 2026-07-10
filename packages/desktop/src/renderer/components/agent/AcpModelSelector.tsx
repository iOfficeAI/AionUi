/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { classifyConfigSetError, type AcpConfigOptionsLoader } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import { Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import RuntimeSelectorPill, { RuntimeSelectorLoadingIndicator } from './RuntimeSelectorPill';
import {
  composeRuntimeSelectorLabel,
  getCurrentThoughtLevelLabel,
  isConfigSetting,
  RUNTIME_SUBMENU_TRIGGER_PROPS,
  RuntimeSelectorCheckedItem,
  RuntimeSelectorModelList,
  RuntimeSelectorSubMenuTitle,
} from './runtimeSelectorOptions';

const configErrorMessageKey = (error: unknown) => {
  const errorKind = classifyConfigSetError(error);
  if (errorKind === 'command_ack') return 'agent.config.commandAck';
  if (errorKind === 'confirmation_timeout') return 'agent.config.timeout';
  if (errorKind === 'config_update_in_progress') return 'agent.config.busy';
  return 'agent.config.failed';
};

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
  prepareRuntime?: () => Promise<void>;
  prepareSetRuntime?: () => Promise<void>;
  loadConfigOptions?: AcpConfigOptionsLoader;
  /** Deprecated: runtime config loading now ensures the conversation runtime. */
  waitForWarmup?: boolean;
}> = ({ conversation_id, backend, initialModelId, prepareRuntime, prepareSetRuntime, loadConfigOptions }) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobileHeaderCompact = Boolean(layout?.isMobile);
  const { model_info, canSwitch, isLoading, isSetting, selectModel, thoughtLevel, setStatus, setConfigOption } =
    useAcpModelInfo({
      conversation_id,
      backend,
      initialModelId,
      prepareRuntime,
      prepareSetRuntime,
      loadConfigOptions,
      onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
      onSelectModelFailed: (_modelId, error) => Message.error(t(configErrorMessageKey(error))),
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
  const combinedLabel = composeRuntimeSelectorLabel({ modelLabel: display_label, thoughtLevel });
  const isRuntimeSetting = isConfigSetting(setStatus);
  const handleThoughtLevelSelect = useCallback(
    async (value: string) => {
      if (!thoughtLevel || value === thoughtLevel.currentValue || isRuntimeSetting) return;
      try {
        await setConfigOption(thoughtLevel.id, value);
        Message.success(t('agent.thoughtLevel.switchSuccess'));
      } catch (error) {
        Message.error(t(configErrorMessageKey(error)));
      }
    },
    [isRuntimeSetting, setConfigOption, thoughtLevel, t]
  );
  const tooltipContent = combinedLabel;

  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;

  if (!model_info && isLoading) {
    return (
      <div
        data-testid='acp-model-selector-loading'
        className='header-model-loading-slot flex h-28px w-28px shrink-0 items-center justify-center leading-none text-t-secondary'
      >
        <RuntimeSelectorLoadingIndicator />
      </div>
    );
  }

  if (!model_info) {
    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <RuntimeSelectorPill
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          label={t('conversation.welcome.useCliModel')}
          leading={renderLogo()}
          style={{ cursor: 'default' }}
        />
      </Tooltip>
    );
  }

  if (!canSwitch) {
    return (
      <Tooltip content={tooltipContent} position='top'>
        <RuntimeSelectorPill
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          label={combinedLabel}
          leading={renderLogo()}
          style={{ cursor: 'default' }}
        />
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
          {thoughtLevel ? (
            <>
              {/* Two-level layout: first level shows model + thought-level rows;
                  each expands into a left-side submenu with the full option list. */}
              <Menu.SubMenu
                key='model'
                triggerProps={RUNTIME_SUBMENU_TRIGGER_PROPS}
                title={
                  <RuntimeSelectorSubMenuTitle
                    label={t('common.model', { defaultValue: 'Model' })}
                    value={display_label}
                  />
                }
              >
                <RuntimeSelectorModelList
                  models={model_info.available_models}
                  currentModelId={model_info.current_model_id}
                  disabled={isRuntimeSetting}
                  onSelect={selectModel}
                />
              </Menu.SubMenu>
              <Menu.SubMenu
                key='thought-level'
                triggerProps={RUNTIME_SUBMENU_TRIGGER_PROPS}
                title={
                  <RuntimeSelectorSubMenuTitle
                    label={t('agent.thoughtLevel.label')}
                    value={getCurrentThoughtLevelLabel(thoughtLevel)}
                  />
                }
              >
                {thoughtLevel.options.map((item) => (
                  <Menu.Item
                    key={item.value}
                    className={item.value === thoughtLevel.currentValue ? 'bg-2!' : ''}
                    onClick={() => {
                      if (!isRuntimeSetting) void handleThoughtLevelSelect(item.value);
                    }}
                  >
                    <RuntimeSelectorCheckedItem
                      selected={item.value === thoughtLevel.currentValue}
                      description={item.description}
                    >
                      {item.label}
                    </RuntimeSelectorCheckedItem>
                  </Menu.Item>
                ))}
              </Menu.SubMenu>
            </>
          ) : (
            /* No thought level: the dropdown is the model list directly. */
            <RuntimeSelectorModelList
              models={model_info.available_models}
              currentModelId={model_info.current_model_id}
              disabled={isRuntimeSetting}
              onSelect={selectModel}
            />
          )}
        </Menu>
      }
    >
      <RuntimeSelectorPill
        testId='acp-model-selector'
        className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
        label={combinedLabel}
        leading={renderLogo()}
        trailing={<Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />}
        loading={isSetting || isRuntimeSetting}
        disabled={isRuntimeSetting}
      />
    </Dropdown>
  );
};

export default AcpModelSelector;
