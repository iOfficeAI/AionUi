/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getAgentModes, supportsModeSwitch, type AgentModeOption } from '@/renderer/constants/agentModes';
import { iconColors } from '@/renderer/theme/colors';
import type { AcpBackend } from '@/types/acpTypes';
import { Dropdown, Menu, Message } from '@arco-design/web-react';
import { Down, Robot } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';

// Agent Logo imports (same as ChatLayout)
import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import GitHubLogo from '@/renderer/assets/logos/github.svg';
import GooseLogo from '@/renderer/assets/logos/goose.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import NanobotLogo from '@/renderer/assets/logos/nanobot.svg';
import OpenCodeLogo from '@/renderer/assets/logos/opencode.svg';
import QoderLogo from '@/renderer/assets/logos/qoder.png';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';

const AGENT_LOGO_MAP: Partial<Record<AcpBackend, string>> = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  qwen: QwenLogo,
  codex: CodexLogo,
  iflow: IflowLogo,
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
  opencode: OpenCodeLogo,
  copilot: GitHubLogo,
  qoder: QoderLogo,
  nanobot: NanobotLogo,
};

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
}

/**
 * AgentModeSelector - A dropdown component for switching agent modes
 * Displays agent logo and name, with dropdown menu for mode selection
 *
 * 代理模式选择器 - 用于切换代理模式的下拉组件
 * 显示代理 logo 和名称，通过下拉菜单选择模式
 */
const AgentModeSelector: React.FC<AgentModeSelectorProps> = ({ backend, agentName, agentLogo, agentLogoIsEmoji, conversationId, compact }) => {
  const modes = getAgentModes(backend);
  const defaultMode = modes[0]?.value ?? 'default';
  const [currentMode, setCurrentMode] = useState<string>(defaultMode);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const canSwitchMode = supportsModeSwitch(backend) && conversationId;
  console.log(`[AgentModeSelector] render: backend=${backend}, conversationId=${conversationId}, canSwitchMode=${canSwitchMode}, modes=${modes.length}, currentMode=${currentMode}`);

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

      if (!conversationId || mode === currentMode) return;

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
    [conversationId, currentMode]
  );

  // Render logo based on source
  const renderLogo = () => {
    if (agentLogo) {
      if (agentLogoIsEmoji) {
        return <span className='text-sm'>{agentLogo}</span>;
      }
      return <img src={agentLogo} alt={`${agentName || 'agent'} logo`} width={16} height={16} style={{ objectFit: 'contain' }} />;
    }
    if (backend && AGENT_LOGO_MAP[backend as AcpBackend]) {
      return <img src={AGENT_LOGO_MAP[backend as AcpBackend]} alt={`${backend} logo`} width={16} height={16} style={{ objectFit: 'contain' }} />;
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
      <Menu.ItemGroup title='Switch Mode'>
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
      <div className='flex items-center gap-4px cursor-pointer rounded-full px-[6px] py-[2px] hover:bg-3' style={{ opacity: isLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <span className='text-xs text-t-secondary'>{getCurrentModeLabel()}</span>
        <Down size={10} className='text-t-tertiary' />
      </div>
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
