/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import { iconColors } from '@/renderer/theme/colors';
import { emitter } from '@/renderer/utils/emitter';
import { Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Close, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useConversationTabs } from './context/ConversationTabsContext';

const TAB_OVERFLOW_THRESHOLD = 10;

interface TabFadeState {
  left: boolean;
  right: boolean;
}

/**
 * 会话 Tabs 栏组件
 * Conversation tabs bar component
 *
 * 显示所有打开的会话 tabs，支持切换、关闭和新建会话
 * Displays all open conversation tabs, supports switching, closing, and creating new conversations
 */
const ConversationTabs: React.FC = () => {
  const { openTabs, activeTabId, switchTab, closeTab, closeAllTabs, closeTabsToLeft, closeTabsToRight, closeOtherTabs, openTab } = useConversationTabs();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [tabFadeState, setTabFadeState] = useState<TabFadeState>({ left: false, right: false });

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
      switchTab(tabId);
      void navigate(`/conversation/${tabId}`);
    },
    [switchTab, navigate]
  );

  // 关闭 tab
  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeTab(tabId);
      // 如果关闭的是当前 tab，导航将由 context 自动处理（切换到最后一个）
      // 如果没有 tab 了，导航到欢迎页
      if (openTabs.length === 1 && tabId === activeTabId) {
        void navigate('/guid');
      }
    },
    [closeTab, openTabs.length, activeTabId, navigate]
  );

  // 新建会话 - 在当前工作空间分组下创建新会话
  const handleNewConversation = useCallback(() => {
    const currentTab = openTabs.find((tab) => tab.id === activeTabId);
    if (!currentTab || !currentTab.workspace) {
      // 没有活动tab或没有workspace，跳转到欢迎页
      void navigate('/guid');
      return;
    }

    // 从数据库获取当前会话的完整信息
    void ipcBridge.database.getUserConversations
      .invoke({ page: 0, pageSize: 10000 })
      .then((conversations) => {
        const currentConversation = conversations?.find((conv: TChatConversation) => conv.id === currentTab.id);
        if (!currentConversation) {
          void navigate('/guid');
          return;
        }

        // 创建新会话，复制当前会话的配置和标题
        const newId = uuid();
        const newConversation = {
          ...currentConversation,
          id: newId,
          name: t('conversation.welcome.newConversation'), // Default title for new session
          createTime: Date.now(),
          modifyTime: Date.now(),
        };

        void ipcBridge.conversation.createWithConversation
          .invoke({
            conversation: newConversation,
          })
          .then(() => {
            // 将新会话添加到 tabs
            openTab(newConversation);
            // 导航到新会话
            void navigate(`/conversation/${newId}`);
            // 刷新历史列表
            emitter.emit('chat.history.refresh');
          })
          .catch((error) => {
            console.error('Failed to create conversation:', error);
          });
      })
      .catch((error) => {
        console.error('Failed to load conversations:', error);
        void navigate('/guid');
      });
  }, [navigate, openTabs, activeTabId, openTab]);

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

  return (
    <div className='relative shrink-0 bg-2 min-h-40px'>
      <div className='relative flex items-center h-40px w-full border-t border-x border-solid border-[color:var(--border-base)]'>
        {/* Tabs 滚动区域 */}
        <div ref={tabsContainerRef} className='flex items-center h-full flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'>
          {openTabs.map((tab) => (
            <Dropdown key={tab.id} droplist={getContextMenu(tab.id)} trigger='contextMenu' position='bl'>
              <Tooltip content={tab.name} position='bottom'>
                <div className={`flex items-center gap-8px px-12px h-full max-w-240px cursor-pointer transition-all duration-200 shrink-0 border-r border-[color:var(--border-base)] ${tab.id === activeTabId ? 'bg-1 text-[color:var(--color-text-1)] font-medium' : 'bg-2 text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-2)] border-b border-[color:var(--border-base)]'}`} style={{ borderRight: '1px solid var(--border-base)' }} onClick={() => handleSwitchTab(tab.id)}>
                  <span className='text-15px whitespace-nowrap overflow-hidden text-ellipsis select-none flex-1'>{tab.name}</span>
                  <Close
                    theme='outline'
                    size='14'
                    fill={iconColors.secondary}
                    className='shrink-0 transition-all duration-200 hover:fill-[rgb(var(--danger-6))]'
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTab(tab.id);
                    }}
                  />
                </div>
              </Tooltip>
            </Dropdown>
          ))}
        </div>

        {/* 新建会话按钮 */}
        <div className='flex items-center justify-center w-40px h-40px shrink-0 cursor-pointer transition-colors duration-200 hover:bg-[var(--fill-2)] ' style={{ borderLeft: '1px solid var(--border-base)' }} onClick={handleNewConversation} title={t('conversation.workspace.createNewConversation')}>
          <Plus theme='outline' size='16' fill={iconColors.primary} strokeWidth={3} />
        </div>

        {/* 左侧渐变指示器 */}
        {showLeftFade && <div className='pointer-events-none absolute left-0 top-0 bottom-0 w-32px [background:linear-gradient(90deg,var(--bg-2)_0%,transparent_100%)]' />}

        {/* 右侧渐变指示器 */}
        {showRightFade && <div className='pointer-events-none absolute right-40px top-0 bottom-0 w-32px [background:linear-gradient(270deg,var(--bg-2)_0%,transparent_100%)]' />}
      </div>
    </div>
  );
};

export default ConversationTabs;
