/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@/renderer/pages/guid/constants';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { emitter } from '@/renderer/utils/emitter';
import { cleanupSiderTooltips } from '@/renderer/utils/ui/siderTooltip';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Dropdown, Menu, Message } from '@arco-design/web-react';
import { Close, Plus, Robot } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useConversationTabs } from '../hooks/ConversationTabsContext';
import { useConversationAgents } from '../hooks/useConversationAgents';
import { applyDefaultConversationName } from '../utils/newConversationName';
import { buildCliAgentParams, buildPresetAssistantParams } from '../utils/createConversationParams';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { iconColors } from '@/renderer/styles/colors';

const TAB_OVERFLOW_THRESHOLD = 10;

interface TabFadeState {
  left: boolean;
  right: boolean;
}

interface ConversationTabViewProps {
  tabId: string;
  tabName: string;
  isActive: boolean;
  isMobile: boolean;
  contextMenu: React.ReactNode;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

const ConversationTabView: React.FC<ConversationTabViewProps> = ({
  tabId,
  tabName,
  isActive,
  isMobile,
  contextMenu,
  onSwitch,
  onClose,
}) => {
  const tabClassName = `flex items-center gap-8px px-12px h-full max-w-240px cursor-pointer transition-all duration-200 shrink-0 border-r border-[color:var(--border-base)] ${isActive ? 'bg-1 text-[color:var(--color-text-1)] font-medium' : 'bg-2 text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-2)] border-b border-[color:var(--border-base)]'}`;

  return (
    <Dropdown droplist={contextMenu} trigger='contextMenu' position='bl'>
      <div
        className={tabClassName}
        style={{ borderRight: '1px solid var(--border-base)' }}
        onClick={() => onSwitch(tabId)}
        title={isMobile ? undefined : tabName}
      >
        <span className='text-15px whitespace-nowrap overflow-hidden text-ellipsis select-none flex-1'>{tabName}</span>
        <Close
          theme='outline'
          size='14'
          fill={iconColors.secondary}
          className='shrink-0 transition-all duration-200 hover:fill-[rgb(var(--danger-6))]'
          onClick={(event) => {
            event.stopPropagation();
            onClose(tabId);
          }}
        />
      </div>
    </Dropdown>
  );
};

interface CreateConversationTriggerProps {
  disabled: boolean;
  title: string;
  menu: React.ReactNode;
}

const CreateConversationTrigger: React.FC<CreateConversationTriggerProps> = ({ disabled, title, menu }) => (
  <Dropdown droplist={menu} trigger='click' position='bl' disabled={disabled}>
    <div
      className={`flex items-center justify-center w-40px h-40px shrink-0 transition-colors duration-200 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-[var(--fill-2)]'}`}
      style={{ borderLeft: '1px solid var(--border-base)' }}
      title={title}
    >
      <Plus theme='outline' size='16' fill={iconColors.primary} strokeWidth={3} />
    </div>
  </Dropdown>
);

/**
 * 会话 Tabs 栏组件
 * Conversation tabs bar component
 *
 * 显示所有打开的会话 tabs，支持切换、关闭和新建会话
 * Displays all open conversation tabs, supports switching, closing, and creating new conversations
 */
const ConversationTabs: React.FC = () => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const {
    openTabs,
    activeTabId,
    switchTab,
    closeTab,
    closeAllTabs,
    closeTabsToLeft,
    closeTabsToRight,
    closeOtherTabs,
    openTab,
  } = useConversationTabs();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [tabFadeState, setTabFadeState] = useState<TabFadeState>({ left: false, right: false });

  const { cliAgents, presetAssistants, isLoading } = useConversationAgents();
  const defaultConversationName = t('conversation.welcome.newConversation');

  // 更新 Tab 溢出状态
  const updateTabOverflow = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const hasOverflow = scrollWidth > clientWidth + 1;

    const nextState: TabFadeState = {
      left: hasOverflow && scrollLeft > TAB_OVERFLOW_THRESHOLD,
      right: hasOverflow && scrollLeft + clientWidth < scrollWidth - TAB_OVERFLOW_THRESHOLD,
    };

    setTabFadeState((prev) => {
      if (prev.left === nextState.left && prev.right === nextState.right) return prev;
      return nextState;
    });
  }, []);

  // 当 tabs 变化时更新溢出状态
  useEffect(() => {
    updateTabOverflow();
  }, [updateTabOverflow, openTabs.length]);

  // 监听滚动和窗口大小变化
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const handleScroll = () => updateTabOverflow();
    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateTabOverflow);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateTabOverflow());
      resizeObserver.observe(container);
    }

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateTabOverflow);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [updateTabOverflow]);

  // 切换 tab 并导航
  const handleSwitchTab = useCallback(
    (tabId: string) => {
      cleanupSiderTooltips();
      switchTab(tabId);
      void navigate(`/conversation/${tabId}`);
    },
    [switchTab, navigate]
  );

  // 关闭 tab
  const handleCloseTab = useCallback(
    (tabId: string) => {
      cleanupSiderTooltips();
      closeTab(tabId);
      // 如果关闭的是当前 tab，导航将由 context 自动处理（切换到最后一个）
      // 如果没有 tab 了，导航到欢迎页
      if (openTabs.length === 1 && tabId === activeTabId) {
        void navigate('/guid');
      }
    },
    [closeTab, openTabs.length, activeTabId, navigate]
  );

  // 创建新会话 - 通过下拉菜单选择 Agent/助手后创建
  const handleCreateConversation = useCallback(
    async (key: string) => {
      const currentTab = openTabs.find((tab) => tab.id === activeTabId);
      if (!currentTab?.workspace) {
        void navigate('/guid');
        return;
      }

      const workspace = currentTab.workspace;

      try {
        // [BUG-3] Build params inside try block: getDefaultGeminiModel() may throw if no model configured
        let params;

        if (key.startsWith('cli:')) {
          const backend = key.slice(4);
          // [BUG-6] Null check: find() may return undefined
          const agent = cliAgents.find((a) => a.backend === backend);
          if (!agent) {
            Message.error(t('conversation.createFailed'));
            return;
          }
          params = await buildCliAgentParams(agent, workspace);
        } else if (key.startsWith('preset:')) {
          const assistantId = key.slice(7);
          // [BUG-6] Null check: find() may return undefined
          const agent = presetAssistants.find((a) => a.customAgentId === assistantId);
          if (!agent) {
            Message.error(t('conversation.createFailed'));
            return;
          }
          params = await buildPresetAssistantParams(agent, workspace, i18n.language);
        } else {
          return;
        }

        // Use conversation.create (calls ConversationService) not createWithConversation (direct DB insert)
        const newConversation = await ipcBridge.conversation.create.invoke(
          applyDefaultConversationName(params, defaultConversationName)
        );

        // [BUG-5] Order matters: closeAllTabs() must come before openTab() to prevent append behavior
        closeAllTabs();
        updateWorkspaceTime(workspace);
        openTab(newConversation);
        void navigate(`/conversation/${newConversation.id}`);
        emitter.emit('chat.history.refresh');
      } catch (error) {
        // [BUG-3] Unified catch: handles both param building errors (getDefaultGeminiModel) and IPC errors
        console.error('Failed to create conversation:', error);
        Message.error(t('conversation.createFailed'));
      }
    },
    [
      navigate,
      openTabs,
      activeTabId,
      cliAgents,
      presetAssistants,
      closeAllTabs,
      openTab,
      t,
      i18n.language,
      defaultConversationName,
    ]
  );

  // 渲染 Agent 下拉菜单
  const renderAgentDropdownMenu = useCallback(() => {
    return (
      <Menu onClickMenuItem={(key) => void handleCreateConversation(key)}>
        {cliAgents.length > 0 && (
          <Menu.ItemGroup title={t('conversation.dropdown.cliAgents')}>
            {cliAgents.map((agent) => {
              const logo = getAgentLogo(agent.backend);
              return (
                <Menu.Item key={`cli:${agent.backend}`}>
                  <div className='flex items-center gap-8px'>
                    {logo ? (
                      <img src={logo} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                    ) : (
                      <Robot size='16' />
                    )}
                    <span>{agent.name}</span>
                  </div>
                </Menu.Item>
              );
            })}
          </Menu.ItemGroup>
        )}
        {presetAssistants.length > 0 && (
          <Menu.ItemGroup title={t('conversation.dropdown.presetAssistants')}>
            {presetAssistants.map((agent) => {
              const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
              const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');
              return (
                <Menu.Item key={`preset:${agent.customAgentId}`}>
                  <div className='flex items-center gap-8px'>
                    {avatarImage ? (
                      <img src={avatarImage} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                    ) : isEmoji ? (
                      <span style={{ fontSize: 14, lineHeight: '16px' }}>{agent.avatar}</span>
                    ) : (
                      <Robot size='16' />
                    )}
                    <span>{agent.name}</span>
                  </div>
                </Menu.Item>
              );
            })}
          </Menu.ItemGroup>
        )}
      </Menu>
    );
  }, [cliAgents, presetAssistants, handleCreateConversation, t]);

  // 生成右键菜单内容
  const getContextMenu = useCallback(
    (tabId: string) => {
      const tabIndex = openTabs.findIndex((tab) => tab.id === tabId);
      const hasLeftTabs = tabIndex > 0;
      const hasRightTabs = tabIndex < openTabs.length - 1;
      const hasOtherTabs = openTabs.length > 1;

      return (
        <Menu
          onClickMenuItem={(key) => {
            switch (key) {
              case 'close-all':
                closeAllTabs();
                void navigate('/guid');
                break;
              case 'close-left':
                closeTabsToLeft(tabId);
                break;
              case 'close-right':
                closeTabsToRight(tabId);
                break;
              case 'close-others':
                closeOtherTabs(tabId);
                void navigate(`/conversation/${tabId}`);
                break;
            }
          }}
        >
          <Menu.Item key='close-others' disabled={!hasOtherTabs}>
            {t('conversation.tabs.closeOthers')}
          </Menu.Item>
          <Menu.Item key='close-left' disabled={!hasLeftTabs}>
            {t('conversation.tabs.closeLeft')}
          </Menu.Item>
          <Menu.Item key='close-right' disabled={!hasRightTabs}>
            {t('conversation.tabs.closeRight')}
          </Menu.Item>
          <Menu.Item key='close-all'>{t('conversation.tabs.closeAll')}</Menu.Item>
        </Menu>
      );
    },
    [openTabs, closeAllTabs, closeTabsToLeft, closeTabsToRight, closeOtherTabs, navigate, t]
  );

  const { left: showLeftFade, right: showRightFade } = tabFadeState;
  // 检查当前激活的 tab 是否在 openTabs 中
  // Check if current active tab is in openTabs
  const isActiveTabInList = openTabs.some((tab) => tab.id === activeTabId);

  // 如果没有打开的 tabs，或者当前激活的会话不在 tabs 中（说明切换到了非工作空间会话），不显示此组件
  // If no open tabs, or active conversation is not in tabs (switched to non-workspace chat), hide component
  if (openTabs.length === 0 || !isActiveTabInList) {
    return null;
  }

  const isDropdownDisabled = isLoading || (!cliAgents.length && !presetAssistants.length);

  return (
    <div className='relative shrink-0 bg-2 min-h-40px'>
      <div className='relative flex items-center h-40px w-full border-t border-x border-solid border-[color:var(--border-base)]'>
        {/* Tabs 滚动区域 */}
        <div
          ref={tabsContainerRef}
          className='flex items-center h-full flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
        >
          {openTabs.map((tab) => (
            <ConversationTabView
              key={tab.id}
              tabId={tab.id}
              tabName={tab.name}
              isActive={tab.id === activeTabId}
              isMobile={isMobile}
              contextMenu={getContextMenu(tab.id)}
              onSwitch={handleSwitchTab}
              onClose={handleCloseTab}
            />
          ))}
        </div>

        {/* 新建会话按钮 - 点击显示 Agent 下拉选择 */}
        <CreateConversationTrigger
          disabled={isDropdownDisabled}
          title={t('conversation.workspace.createNewConversation')}
          menu={renderAgentDropdownMenu()}
        />

        {/* 左侧渐变指示器 */}
        {showLeftFade && (
          <div className='pointer-events-none absolute left-0 top-0 bottom-0 w-32px [background:linear-gradient(90deg,var(--bg-2)_0%,transparent_100%)]' />
        )}

        {/* 右侧渐变指示器 */}
        {showRightFade && (
          <div className='pointer-events-none absolute right-40px top-0 bottom-0 w-32px [background:linear-gradient(270deg,var(--bg-2)_0%,transparent_100%)]' />
        )}
      </div>
    </div>
  );
};

export default ConversationTabs;
