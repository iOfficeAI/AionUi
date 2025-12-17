/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import FontSizeControl from '@/renderer/components/FontSizeControl';
import { ThemeSwitcher } from '@/renderer/components/ThemeSwitcher';
import CssThemeSettings from '@/renderer/components/CssThemeSettings';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AionCollapse from '@/renderer/components/base/AionCollapse';
import { iconColors } from '@/renderer/theme/colors';
import { Down, Up } from '@icon-park/react';
import { useSettingsViewMode } from '../settingsViewContext';

/**
 * 偏好设置行组件 / Preference row component
 * 用于显示标签和对应的控件，统一的水平布局 / Used for displaying labels and corresponding controls in a unified horizontal layout
 */
const PreferenceRow: React.FC<{
  /** 标签文本 / Label text */
  label: string;
  /** 控件元素 / Control element */
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='text-14px text-2'>{label}</div>
    <div className='flex-1 flex justify-end'>{children}</div>
  </div>
);

/**
 * 显示设置内容组件 / Display settings content component
 *
 * 提供显示相关的配置选项，包括主题、缩放比例和自定义CSS
 * Provides display-related configuration options including theme, zoom scale and custom CSS
 *
 * @features
 * - 主题切换：亮色/暗色/跟随系统 / Theme: light/dark/system
 * - 缩放比例控制 / Zoom scale control
 * - 自定义CSS编辑器 / Custom CSS editor
 */
const DisplayModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  // 渲染折叠面板的展开/收起图标 / Render expand/collapse icon for collapse panel
  const renderExpandIcon = (active: boolean) => (active ? <Up theme='outline' size='16' fill={iconColors.secondary} /> : <Down theme='outline' size='16' fill={iconColors.secondary} />);

  // 显示设置项配置 / Display items configuration
  const displayItems = [
    { key: 'theme', label: t('settings.theme'), component: <ThemeSwitcher /> },
    { key: 'fontSize', label: t('settings.fontSize'), component: <FontSizeControl /> },
  ];

  return (
    <div className='flex flex-col h-full w-full'>
      {/* 内容区域 / Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* 显示设置 / Display Settings */}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {displayItems.map((item) => (
                <PreferenceRow key={item.key} label={item.label}>
                  {item.component}
                </PreferenceRow>
              ))}
            </div>
          </div>

          {/* CSS 主题设置 / CSS Theme Settings - Collapsible */}
          <AionCollapse bordered={false} defaultActiveKey={['css']} expandIcon={renderExpandIcon} expandIconPosition='right'>
            <AionCollapse.Item name='css' header={<span className='text-14px text-2'>{t('settings.cssSettings')}</span>} className='bg-transparent' contentStyle={{ padding: '12px 0 0' }}>
              <CssThemeSettings />
            </AionCollapse.Item>
          </AionCollapse>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default DisplayModalContent;
