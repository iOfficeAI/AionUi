/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import FontSizeControl from '@/renderer/components/settings/FontSizeControl';
import CssThemeSettings from '@renderer/pages/settings/DisplaySettings/CssThemeSettings';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
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
  <div className='flex flex-col items-stretch gap-10px py-12px md:flex-row md:items-center md:justify-between md:gap-24px'>
    <div className='text-14px text-t-primary leading-22px'>{label}</div>
    <div className='w-full flex md:flex-1 md:justify-end'>{children}</div>
  </div>
);

/**
 * 外观设置内容组件 / Appearance settings content component
 *
 * 提供外观相关的配置选项，包括主题画廊和字体缩放
 * Provides appearance-related configuration options including theme gallery and font scale
 *
 * @features
 * - 统一主题画廊（浅色、深色及装饰主题）/ Unified theme gallery (light, dark, decorative)
 * - 缩放比例控制 / Zoom scale control
 */
const DisplayModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  return (
    <div className='flex flex-col h-full w-full'>
      {/* 内容区域 / Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* 主题画廊 / Theme Gallery */}
          <div className='px-16px md:px-24px lg:px-28px py-14px md:py-16px bg-2 rd-16px'>
            <div className='text-14px text-t-primary leading-22px mb-12px'>{t('settings.theme')}</div>
            <CssThemeSettings />
          </div>

          {/* 缩放控制 / Scale Control */}
          <div className='px-16px md:px-24px lg:px-28px py-14px md:py-16px bg-2 rd-16px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              <PreferenceRow label={t('settings.fontSize')}>
                <FontSizeControl />
              </PreferenceRow>
            </div>
          </div>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default DisplayModalContent;
