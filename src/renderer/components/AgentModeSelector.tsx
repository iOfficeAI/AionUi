/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getAgentModes, supportsModeSwitch, type AgentModeOption } from '@/renderer/constants/agentModes';
import { iconColors } from '@/renderer/theme/colors';
import { getAgentLogo } from '@/renderer/utils/agentLogo';
import { Button, Dropdown, Menu, Message } from '@arco-design/web-react';
import { Down, Robot } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface AgentModeSelectorProps {
  /** Agent backend type / 代理后端类型 */
  backend?: string;
  /** Display name for the agent / 代理显示名称 */
  agentName?: string;
  /** Custom agent logo (SVG path or emoji) / 自定义代理 logo */
  agentLogo?: string;
  /** Whether the logo is an emoji / logo 是否为 emoji */
  agentLogoIsEmoji?: boolean;
  /** Conversation ID for mode switching / 用于切换模式的会话 ID */
  conversationId?: string;
  /** Compact mode: only show mode label + dropdown, no logo/name / 紧凑模式：仅显示模式标签和下拉 */
  compact?: boolean;
  /** Initial mode override (for Guid page pre-conversation selection) */
  initialMode?: string;
  /** Callback when mode is selected locally (no conversationId needed) */
  onModeSelect?: (mode: string) => void;
}

/**
 * AgentModeSelector - A dropdown component for switching agent modes
 * Displays agent logo and name, with dropdown menu for mode selection
 *
 * 代理模式选择器 - 用于切换代理模式的下拉组件
 * 显示代理 logo 和名称，通过下拉菜单选择模式
 */
const AgentModeSelector: React.FC<AgentModeSelectorProps> = ({ backend, agentName, agentLogo, agentLogoIsEmoji, conversationId, compact, initialMode, onModeSelect }) => {
  const { t } = useTranslation();
  const modes = getAgentModes(backend);
  const defaultMode = modes[0]?.value ?? 'default';
  // Validate initialMode against available modes; fall back to backend's default
  // when the provided value doesn't match (e.g. opencode has 'build'/'plan', not 'default')
  const validInitialMode = initialMode && modes.some((m) => m.value === initialMode) ? initialMode : defaultMode;
  const [currentMode, setCurrentMode] = useState<string>(validInitialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const canSwitchMode = supportsModeSwitch(backend) && (conversationId || onModeSelect);
  console.log(`[AgentModeSelector] render: backend=${backend}, conversationId=${conversationId}, canSwitchMode=${canSwitchMode}, modes=${modes.length}, currentMode=${currentMode}`);

  // When initialMode prop changes (e.g. agent switch on Guid page), update local state.
  // Validate against available modes to handle backends with non-standard default
  // (e.g. opencode uses 'build' instead of 'default').
  useEffect(() => {
    if (initialMode !== undefined) {
      const valid = modes.some((m) => m.value === initialMode) ? initialMode : defaultMode;
      setCurrentMode(valid);
    }
  }, [initialMode, modes, defaultMode]);

  // Sync mode from backend when mounting or switching conversation tabs
  useEffect(() => {
    if (!conversationId || !canSwitchMode) return;
    let cancelled = false;

    ipcBridge.acpConversation.getMode
      .invoke({ conversationId })
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setCurrentMode(result.data.mode);
        }
      })
      .catch(() => {
        // Silent fail, keep current state
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, canSwitchMode]);

  const handleModeChange = useCallback(
    async (mode: string) => {
      // Close dropdown immediately after selection
      setDropdownVisible(false);

      if (mode === currentMode) return;

      // Local mode (Guid page): update state and notify parent, no IPC needed
      if (!conversationId && onModeSelect) {
        setCurrentMode(mode);
        onModeSelect(mode);
        return;
      }

      if (!conversationId) return;

      setIsLoading(true);
      try {
        const result = await ipcBridge.acpConversation.setMode.invoke({
          conversationId,
          mode,
        });

        if (result.success) {
          setCurrentMode(result.data?.mode ?? mode);
          Message.success('Mode switched');
        } else {
          const errorMsg = result.msg || 'Switch failed';
          console.warn('[AgentModeSelector] Mode switch failed:', errorMsg);
          Message.warning(errorMsg);
        }
      } catch (error) {
        console.error('[AgentModeSelector] Failed to switch mode:', error);
        Message.error('Switch failed');
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, currentMode, onModeSelect]
  );

  // Render logo based on source
  const renderLogo = () => {
    if (agentLogo) {
      if (agentLogoIsEmoji) {
        return <span className='text-sm'>{agentLogo}</span>;
      }
      return <img src={agentLogo} alt={`${agentName || 'agent'} logo`} width={16} height={16} style={{ objectFit: 'contain' }} />;
    }
    const logo = getAgentLogo(backend);
    if (logo) {
      return <img src={logo} alt={`${backend} logo`} width={16} height={16} style={{ objectFit: 'contain' }} />;
    }
    return <Robot theme='outline' size={16} fill={iconColors.primary} />;
  };

  // Get display label for current mode
  const getCurrentModeLabel = () => {
    const modeOption = modes.find((m) => m.value === currentMode);
    return modeOption?.label ?? '';
  };

  // Dropdown menu (shared between compact and full mode)
  const dropdownMenu = (
    <Menu onClickMenuItem={(key) => void handleModeChange(key)}>
      <Menu.ItemGroup title={t('agentMode.switchMode', { defaultValue: 'Switch Mode' })}>
        {modes.map((mode: AgentModeOption) => (
          <Menu.Item key={mode.value} className={currentMode === mode.value ? '!bg-2' : ''}>
            <div className='flex items-center gap-8px'>
              {currentMode === mode.value && <span className='text-primary'>✓</span>}
              <span className={currentMode !== mode.value ? 'ml-16px' : ''}>{mode.label}</span>
            </div>
          </Menu.Item>
        ))}
      </Menu.ItemGroup>
    </Menu>
  );

  // Compact mode: render only mode label chip in sendbox area
  if (compact) {
    if (!canSwitchMode) return null;

    const compactContent = (
      <Button className='sendbox-model-btn' shape='round' style={{ opacity: isLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <span>{getCurrentModeLabel()}</span>
      </Button>
    );

    return (
      <Dropdown trigger='click' popupVisible={dropdownVisible} onVisibleChange={(visible) => !isLoading && setDropdownVisible(visible)} droplist={dropdownMenu}>
        {compactContent}
      </Dropdown>
    );
  }

  // Full mode: logo + name + optional mode label
  const content = (
    <div className={`flex items-center gap-2 bg-2 w-fit rounded-full px-[8px] py-[2px] ${canSwitchMode ? 'cursor-pointer hover:bg-3' : ''}`} style={{ opacity: isLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      {renderLogo()}
      <span className='text-sm text-t-primary'>{agentName || backend}</span>
      {canSwitchMode && (
        <>
          {currentMode !== defaultMode && <span className='text-xs text-t-tertiary'>({getCurrentModeLabel()})</span>}
          <Down size={12} className='text-t-tertiary' />
        </>
      )}
    </div>
  );

  // If mode switching is not supported, just render the content without dropdown
  if (!canSwitchMode) {
    return <div className='ml-16px'>{content}</div>;
  }

  // Render dropdown with mode selection menu
  return (
    <div className='ml-16px'>
      <Dropdown trigger='click' popupVisible={dropdownVisible} onVisibleChange={(visible) => !isLoading && setDropdownVisible(visible)} droplist={dropdownMenu}>
        {content}
      </Dropdown>
    </div>
  );
};

export default AgentModeSelector;
