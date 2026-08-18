/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { classifyConfigSetError, type AcpConfigOptionsPort } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import { Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
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

/**
 * Warmup status for a team teammate's runtime, defined locally so this shared
 * selector never imports team-domain types. Values intentionally mirror
 * TeamAgentRuntimeStatus so TeamPage can pass them through 1:1.
 */
export type AcpWarmupStatus = 'dormant' | 'pending' | 'ready' | 'failed';

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
  configOptionsPort?: AcpConfigOptionsPort;
  onRuntimeReadyChange?: (ready: boolean) => void;
  /** Deprecated: runtime config loading now ensures the conversation runtime. */
  waitForWarmup?: boolean;
  /**
   * Optional manual-warmup control for team teammates. Omitted in single chat,
   * so single-chat behavior is unchanged. `trigger` is withheld (undefined)
   * while the whole team is still warming.
   */
  warmup?: {
    status: AcpWarmupStatus;
    trigger?: () => Promise<void>;
  };
}> = ({
  conversation_id,
  backend,
  initialModelId,
  prepareRuntime,
  prepareSetRuntime,
  configOptionsPort,
  onRuntimeReadyChange,
  warmup,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobileHeaderCompact = Boolean(layout?.isMobile);
  const {
    model_info,
    isRuntimeReady,
    canSwitch,
    isLoading,
    isSetting,
    selectModel,
    thoughtLevel,
    setStatus,
    setConfigOption,
    isConfigOptionBlocked = () => false,
  } = useAcpModelInfo({
    conversation_id,
    backend,
    initialModelId,
    prepareRuntime,
    prepareSetRuntime,
    configOptionsPort,
    // Persistence is the backend's job: the same request that switches the
    // runtime also records the selection (team members get their roster entry
    // updated too). No follow-up call to chain here, so success means switched
    // AND persisted.
    onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
    onSelectModelFailed: (_modelId, error) => Message.error(t(configErrorMessageKey(error))),
  });

  useEffect(() => {
    onRuntimeReadyChange?.(isRuntimeReady);
  }, [isRuntimeReady, onRuntimeReadyChange]);

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
      if (
        !thoughtLevel ||
        value === thoughtLevel.currentValue ||
        isRuntimeSetting ||
        isConfigOptionBlocked(thoughtLevel.id)
      )
        return;
      try {
        await setConfigOption(thoughtLevel.id, value);
        Message.success(t('agent.thoughtLevel.switchSuccess'));
      } catch (error) {
        Message.error(t(configErrorMessageKey(error)));
      }
    },
    [isConfigOptionBlocked, isRuntimeSetting, setConfigOption, thoughtLevel, t]
  );
  const tooltipContent = combinedLabel;

  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;

  const [triggering, setTriggering] = useState(false);

  // Optimistic spinner clears as soon as warmup leaves 'dormant' (a Pending/
  // Ready/Failed event took over the visual), handing back to event-driven state.
  useEffect(() => {
    if (warmup && warmup.status !== 'dormant') setTriggering(false);
  }, [warmup]);

  const canManualWarmup = Boolean(
    warmup && (warmup.status === 'dormant' || warmup.status === 'failed') && warmup.trigger
  );
  const showWarmupSpinner = triggering || warmup?.status === 'pending';

  const handleWarmupClick = useCallback(async () => {
    if (!warmup?.trigger || triggering) return;
    setTriggering(true);
    try {
      await warmup.trigger();
    } catch {
      // Failure surfaces via the runtime status stream ('failed'); clearing the
      // optimistic spinner here also covers attachAgent rejecting outright
      // (HTTP error, no Pending event) so the spinner never sticks.
    } finally {
      setTriggering(false);
    }
  }, [warmup, triggering]);

  // Read-only pill renderer shared by the `!model_info` and `!canSwitch`
  // branches. When a teammate is dormant/failed with a trigger, it becomes a
  // clickable wake pill; while (optimistically) triggering or pending it shows a
  // spinner; otherwise it stays the existing read-only pill.
  const renderReadonlyPill = (label: string, readonlyTooltip: React.ReactNode) => {
    const clickable = !showWarmupSpinner && canManualWarmup;
    const tooltip = clickable ? t('agent.warmup.clickToWake') : readonlyTooltip;
    return (
      <Tooltip content={tooltip} position='top'>
        <RuntimeSelectorPill
          testId='acp-model-selector-warmup'
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          label={label}
          leading={renderLogo()}
          loading={showWarmupSpinner}
          onClick={clickable ? () => void handleWarmupClick() : undefined}
          style={{ cursor: clickable ? 'pointer' : 'default' }}
        />
      </Tooltip>
    );
  };

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
    return renderReadonlyPill(t('conversation.welcome.useCliModel'), t('conversation.welcome.modelSwitchNotSupported'));
  }

  if (!canSwitch) {
    return renderReadonlyPill(combinedLabel, tooltipContent);
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
                  disabled={isRuntimeSetting || isConfigOptionBlocked('model')}
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
                      if (!isRuntimeSetting && !isConfigOptionBlocked(thoughtLevel.id)) {
                        void handleThoughtLevelSelect(item.value);
                      }
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
              disabled={isRuntimeSetting || isConfigOptionBlocked('model')}
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
