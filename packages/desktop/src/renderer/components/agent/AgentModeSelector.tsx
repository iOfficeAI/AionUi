/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { classifyConfigSetError, useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import type { AgentModeOption } from '@/renderer/utils/model/agentTypes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { AgentLogoIcon } from './AgentBadge';
import { Dropdown, Menu, Message } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import RuntimeSelectorPill from './RuntimeSelectorPill';

const configErrorMessageKey = (error: unknown) => {
  const errorKind = classifyConfigSetError(error);
  if (errorKind === 'command_ack') return 'agent.config.commandAck';
  if (errorKind === 'confirmation_timeout') return 'agent.config.timeout';
  if (errorKind === 'config_update_in_progress') return 'agent.config.busy';
  return 'agent.config.failed';
};

export interface AgentModeSelectorProps {
  /** Agent backend type / 代理后端类型 */
  backend?: string;
  /** Display name for the agent / 代理显示名称 */
  agent_name?: string;
  /** Custom agent logo (SVG path or emoji) / 自定义代理 logo */
  agentLogo?: string;
  /** Whether the logo is an emoji / logo 是否为 emoji */
  agentLogoIsEmoji?: boolean;
  /** Conversation ID for mode switching / 用于切换模式的会话 ID */
  conversation_id?: string;
  /** Compact mode: only show mode label + dropdown, no logo/name / 紧凑模式：仅显示模式标签和下拉 */
  compact?: boolean;
  /** Show agent logo in compact mode / 紧凑模式是否显示代理图标 */
  showLogoInCompact?: boolean;
  /** Compact label content: mode label or agent name / 紧凑模式文案：模式名或代理名 */
  compactLabelType?: 'mode' | 'agent';
  /** Initial mode override (for Guid page pre-conversation selection) */
  initialMode?: string;
  /** Callback when mode is selected locally (no conversation_id needed) */
  onModeSelect?: (mode: string) => void;
  /** Optional compact label override */
  compactLabelOverride?: string;
  /** Optional compact leading icon */
  compactLeadingIcon?: React.ReactNode;
  /** Optional display label formatter for mode options */
  modeLabelFormatter?: (mode: AgentModeOption) => string;
  /** Optional compact prefix text, e.g. "Permission" / "权限" */
  compactLabelPrefix?: string;
  /** Hide compact prefix on mobile */
  hideCompactLabelPrefixOnMobile?: boolean;
  /** Callback fired after a successful mode change (for team-mode propagation) */
  onModeChanged?: (mode: string) => void;
  /** Dynamic modes from capabilities (overrides static list when non-empty) */
  dynamicModes?: AgentModeOption[];
  /** Optional runtime preparation before reading active-session mode. */
  beforeRuntimeSync?: () => Promise<void>;
}

/**
 * AgentModeSelector - A dropdown component for switching agent modes
 * Displays agent logo and name, with dropdown menu for mode selection
 *
 * 代理模式选择器 - 用于切换代理模式的下拉组件
 * 显示代理 logo 和名称，通过下拉菜单选择模式
 */
const AgentModeSelector: React.FC<AgentModeSelectorProps> = ({
  backend,
  agent_name,
  agentLogo,
  agentLogoIsEmoji,
  conversation_id,
  compact,
  showLogoInCompact = false,
  compactLabelType = 'mode',
  initialMode,
  onModeSelect,
  compactLabelOverride,
  compactLeadingIcon,
  modeLabelFormatter,
  compactLabelPrefix,
  hideCompactLabelPrefixOnMobile = false,
  onModeChanged,
  dynamicModes,
  beforeRuntimeSync,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const runtimeConfig = useAcpConfigOptions({
    conversation_id: conversation_id ?? '',
    prepareRuntime: beforeRuntimeSync,
    enabled: Boolean(conversation_id),
  });
  const runtimeMode = runtimeConfig.mode;
  const runtimeModes = useMemo(
    () =>
      runtimeMode?.options.map((item) => ({
        value: item.value,
        label: item.label,
        description: item.description ?? undefined,
      })),
    [runtimeMode?.options]
  );

  // Priority: observed config_options > dynamic modes from persisted agent_metadata.
  const modes = useMemo(() => {
    if (runtimeModes && runtimeModes.length > 0) return runtimeModes;
    if (dynamicModes && dynamicModes.length > 0) return dynamicModes;
    return [];
  }, [runtimeModes, dynamicModes]);
  const defaultMode = modes[0]?.value ?? initialMode ?? 'default';
  // Validate initialMode against available modes; fall back to backend's default
  // when the provided value doesn't match (e.g. opencode has 'build'/'plan', not 'default')
  const validInitialMode = initialMode && modes.some((m) => m.value === initialMode) ? initialMode : defaultMode;
  const [current_mode, setCurrentMode] = useState<string>(validInitialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const getDisplayModeLabel = useCallback(
    (mode: AgentModeOption) => modeLabelFormatter?.(mode) ?? mode.label,
    [modeLabelFormatter]
  );

  const can_switchMode = modes.length > 0 && Boolean(conversation_id || onModeSelect);
  // Mobile conversation header agent pill is display-only by design.
  const canInteract = can_switchMode && !(compact && compactLabelType === 'agent');

  // When initialMode prop changes (e.g. agent switch on Guid page), update local state.
  // Validate against available modes to handle backends with non-standard default
  // (e.g. opencode uses 'build' instead of 'default').
  useEffect(() => {
    if (initialMode !== undefined && !runtimeMode?.currentValue) {
      const valid = modes.some((m) => m.value === initialMode) ? initialMode : defaultMode;
      setCurrentMode(valid);
    }
  }, [initialMode, modes, defaultMode, runtimeMode?.currentValue]);

  useEffect(() => {
    if (!runtimeMode?.currentValue) return;
    setCurrentMode(runtimeMode.currentValue);
  }, [runtimeMode?.currentValue]);

  const handleModeChange = useCallback(
    async (mode: string) => {
      // Close dropdown immediately after selection
      setDropdownVisible(false);

      if (mode === current_mode) return;

      // Local mode (Guid page): update state and notify parent, no IPC needed
      if (!conversation_id && onModeSelect) {
        setCurrentMode(mode);
        onModeSelect(mode);
        onModeChanged?.(mode);
        return;
      }

      if (!conversation_id) return;

      const setActiveMode = async () => {
        if (!runtimeMode) {
          throw new Error('config_not_observed');
        }
        await runtimeConfig.setConfigOption(runtimeMode.id, mode);
      };

      setIsLoading(true);
      try {
        await beforeRuntimeSync?.();
        await setActiveMode();
        setCurrentMode(mode);
        onModeChanged?.(mode);
        Message.success(t('agentMode.switchSuccess'));
      } catch (error) {
        console.error('[AgentModeSelector] Failed to switch mode:', error);
        Message.error(t(configErrorMessageKey(error)));
      } finally {
        setIsLoading(false);
      }
    },
    [beforeRuntimeSync, conversation_id, current_mode, onModeChanged, onModeSelect, runtimeConfig, runtimeMode, t]
  );

  const renderLogo = () => (
    <AgentLogoIcon
      backend={backend}
      agent_name={agent_name}
      agentLogo={agentLogo}
      agentLogoIsEmoji={agentLogoIsEmoji}
    />
  );

  // Get display label for current mode
  const getCurrentModeLabel = () => {
    const modeOption = modes.find((m) => m.value === current_mode);
    return modeOption ? getDisplayModeLabel(modeOption) : '';
  };

  // Dropdown menu (shared between compact and full mode)
  const dropdownMenu = (
    <Menu onClickMenuItem={(key) => void handleModeChange(key)}>
      <Menu.ItemGroup title={t('agentMode.switchMode', { defaultValue: 'Switch Mode' })}>
        {modes.map((mode: AgentModeOption) => (
          <Menu.Item key={mode.value} className={current_mode === mode.value ? '!bg-2' : ''}>
            <div
              className='flex items-center gap-8px'
              data-mode-value={mode.value}
              data-testid={`aionrs-mode-option-${mode.value}`}
            >
              {current_mode === mode.value && <span className='text-primary'>✓</span>}
              <span className={current_mode !== mode.value ? 'ml-16px' : ''}>{getDisplayModeLabel(mode)}</span>
            </div>
          </Menu.Item>
        ))}
      </Menu.ItemGroup>
    </Menu>
  );

  // Compact mode: render only mode label chip in sendbox area
  if (compact) {
    const isSetting = isLoading || runtimeConfig.setStatus.state === 'setting';
    const legacyCompactBehavior = !showLogoInCompact && compactLabelType === 'mode';
    const baseCompactLabel =
      compactLabelType === 'agent'
        ? agent_name || backend || 'Agent'
        : can_switchMode
          ? getCurrentModeLabel()
          : agent_name || backend || 'Agent';
    const compactLabel =
      compactLabelOverride ||
      (compactLabelPrefix && compactLabelType !== 'agent'
        ? hideCompactLabelPrefixOnMobile && isMobile
          ? baseCompactLabel
          : `${compactLabelPrefix} · ${baseCompactLabel}`
        : baseCompactLabel);
    if (!canInteract && legacyCompactBehavior) {
      return null;
    }

    const compactContent = (
      <span data-testid='mode-selector' data-current-mode={current_mode} className='inline-flex'>
        <RuntimeSelectorPill
          testId={backend ? `agent-mode-selector-${backend}` : 'agent-mode-selector'}
          className={`sendbox-model-btn agent-mode-compact-pill ${canInteract ? '' : 'agent-mode-compact-pill--readonly'}`}
          label={compactLabel}
          leading={
            <>
              {compactLeadingIcon && <span className='shrink-0 inline-flex items-center'>{compactLeadingIcon}</span>}
              {showLogoInCompact && <span className='shrink-0 inline-flex items-center'>{renderLogo()}</span>}
            </>
          }
          trailing={canInteract ? <Down size={12} className='text-t-tertiary shrink-0' /> : null}
          loading={isSetting}
          disabled={isSetting}
          onClick={canInteract ? () => !isSetting && setDropdownVisible((visible) => !visible) : undefined}
          style={{
            opacity: isSetting ? 0.6 : 1,
            transition: 'opacity 0.2s',
            cursor: canInteract ? 'pointer' : 'default',
          }}
        />
      </span>
    );

    if (!canInteract) {
      return compactContent;
    }

    return (
      <Dropdown
        trigger='click'
        popupVisible={dropdownVisible}
        onVisibleChange={(visible) => !isSetting && setDropdownVisible(visible)}
        droplist={dropdownMenu}
      >
        {compactContent}
      </Dropdown>
    );
  }

  // Full mode: logo + name + optional mode label
  const content = (
    <div
      className={`flex items-center gap-2 bg-2 w-fit rounded-full px-[8px] py-[2px] ${can_switchMode ? 'cursor-pointer hover:bg-3' : ''}`}
      style={{
        opacity: isLoading || runtimeConfig.setStatus.state === 'setting' ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {renderLogo()}
      <span className='text-sm text-t-primary'>{agent_name || backend}</span>
      {can_switchMode && (
        <>
          {current_mode !== defaultMode && <span className='text-xs text-t-tertiary'>({getCurrentModeLabel()})</span>}
          <Down size={12} className='text-t-tertiary' />
        </>
      )}
    </div>
  );

  // If mode switching is not supported, just render the content without dropdown
  if (!can_switchMode) {
    return <div className='ml-16px'>{content}</div>;
  }

  // Render dropdown with mode selection menu
  return (
    <div className='ml-16px'>
      <Dropdown
        trigger='click'
        popupVisible={dropdownVisible}
        onVisibleChange={(visible) =>
          !isLoading && runtimeConfig.setStatus.state !== 'setting' && setDropdownVisible(visible)
        }
        droplist={dropdownMenu}
      >
        {content}
      </Dropdown>
    </div>
  );
};

export default AgentModeSelector;
