/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/theme/colors';
import { Close } from '@icon-park/react';
import { IconShrink } from '@arco-design/web-react/icon';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TabFadeState } from '../../hooks/useTabOverflow';

/**
 * Tab 信息
 * Tab information
 */
export interface PreviewTab {
  /**
   * Tab ID
   */
  id: string;

  /**
   * Tab 标题
   * Tab title
   */
  title: string;

  /**
   * 是否有未保存的修改
   * Whether there are unsaved changes
   */
  isDirty?: boolean;
}

/**
 * PreviewTabs 组件属性
 * PreviewTabs component props
 */
interface PreviewTabsProps {
  /**
   * Tabs 列表
   * Tabs list
   */
  tabs: PreviewTab[];

  /**
   * 当前活动的 Tab ID
   * Current active tab ID
   */
  activeTabId: string | null;

  /**
   * Tab 渐变状态（左右溢出指示器）
   * Tab fade state (left/right overflow indicators)
   */
  tabFadeState: TabFadeState;

  /**
   * Tabs 容器引用
   * Tabs container ref
   */
  tabsContainerRef: React.RefObject<HTMLDivElement>;

  /**
   * 切换 Tab 回调
   * Switch tab callback
   */
  onSwitchTab: (tabId: string) => void;

  /**
   * 关闭 Tab 回调
   * Close tab callback
   */
  onCloseTab: (tabId: string) => void;

  /**
   * Tab 右键菜单回调
   * Tab context menu callback
   */
  onContextMenu: (e: React.MouseEvent, tabId: string) => void;

  /**
   * 关闭预览面板回调
   * Close preview panel callback
   */
  onClosePanel?: () => void;
}

/**
 * 预览面板 Tabs 栏组件
 * Preview panel tabs bar component
 *
 * 显示多个 Tab，支持切换、关闭和右键菜单
 * Displays multiple tabs, supports switching, closing, and context menu
 *
 * 包含左右渐变指示器，提示用户可以滚动查看更多 Tab
 * Includes left/right gradient indicators to prompt users that more tabs can be scrolled
 */
const PreviewTabs: React.FC<PreviewTabsProps> = ({ tabs, activeTabId, tabFadeState, tabsContainerRef, onSwitchTab, onCloseTab, onContextMenu, onClosePanel }) => {
  const { t } = useTranslation();
  const { left: showLeftFade, right: showRightFade } = tabFadeState;

  return (
    <div className='relative flex-shrink-0 bg-bg-2' style={{ minHeight: '40px', borderBottom: '1px solid var(--border-base)' }}>
      <div className='flex items-center h-40px w-full'>
        {/* Tabs 滚动区域 / Tabs scroll area */}
        <div ref={tabsContainerRef} className='flex items-center h-full flex-1 overflow-x-auto'>
          {tabs.length > 0 ? (
            tabs.map((tab) => (
              <div key={tab.id} className={`flex items-center gap-8px px-12px h-full cursor-pointer transition-colors flex-shrink-0 ${tab.id === activeTabId ? 'bg-bg-1 text-t-primary' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => onSwitchTab(tab.id)} onContextMenu={(e) => onContextMenu(e, tab.id)}>
                <span className='text-12px whitespace-nowrap flex items-center gap-4px'>
                  {tab.title}
                  {/* 未保存指示器 / Unsaved indicator */}
                  {tab.isDirty && <span className='w-6px h-6px rd-full bg-primary' title={t('preview.unsavedChangesTitle')} />}
                </span>
                <Close
                  theme='outline'
                  size='14'
                  fill={iconColors.secondary}
                  className='hover:fill-primary'
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                />
              </div>
            ))
          ) : (
            <div className='text-12px text-t-tertiary px-12px'>{t('preview.noTabs')}</div>
          )}
        </div>

        {/* 收起面板按钮 / Collapse panel button */}
        {onClosePanel && (
          <div className='flex items-center h-full px-12px flex-shrink-0 rounded-tr-[16px]'>
            <div className='flex items-center justify-center w-24px h-24px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={onClosePanel} title={t('preview.collapsePanel')}>
              <IconShrink style={{ fontSize: 16, color: iconColors.secondary }} />
            </div>
          </div>
        )}
      </div>

      {/* 左侧渐变指示器 / Left gradient indicator */}
      {showLeftFade && (
        <div
          className='pointer-events-none absolute left-0 top-0 bottom-0 w-32px rounded-tl-[16px]'
          style={{
            background: 'linear-gradient(90deg, var(--bg-2) 0%, transparent 100%)',
          }}
        />
      )}

      {/* 右侧渐变指示器 / Right gradient indicator */}
      {showRightFade && (
        <div
          className='pointer-events-none absolute right-0 top-0 bottom-0 w-32px rounded-tr-[16px]'
          style={{
            background: 'linear-gradient(270deg, var(--bg-2) 0%, transparent 100%)',
          }}
        />
      )}
    </div>
  );
};

export default PreviewTabs;
