/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import ScaleControl from '@/renderer/components/settings/ScaleControl';
import CssThemeSettings from '@renderer/pages/settings/AppearanceSettings/CssThemeSettings';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { FONT_SIZE_KEYS, FONT_SIZE_SPECS, FONT_SIZE_STEP, type FontSizeKey } from '@/common/config/fontSizes';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import { useSettingsViewMode } from '../../settingsViewContext';
import FontSizeStepper from './FontSizeStepper';
import FontFamilySelect from './FontFamilySelect';

/**
 * Map each appearance region to its row-label i18n key. Regions match
 * FONT_SIZE_KEYS one-for-one — 'app' is the global default the others inherit.
 */
const FONT_REGION_LABEL_KEY: Record<FontSizeKey, string> = {
  app: 'settings.fontRegionApp',
  chat: 'settings.fontRegionChat',
  markdown: 'settings.fontRegionMarkdown',
  code: 'settings.fontRegionCode',
};

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
 * 提供外观相关的配置选项，包括主题画廊、字体（字族 + 字号）和缩放
 * Provides appearance-related configuration options including theme gallery,
 * fonts (family + size) and scale.
 *
 * @features
 * - 统一主题画廊（浅色、深色及装饰主题）/ Unified theme gallery (light, dark, decorative)
 * - 分区字体：全局/聊天/Markdown/代码，每区可选字族与字号，未选字族的区继承全局
 *   Per-region fonts: global/chat/markdown/code, each with a family + size;
 *   regions without a family inherit the global one
 * - 缩放比例控制 / Zoom scale control
 */
const AppearanceModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const { fontSizes, setFontSize, fontFamilies, setFontFamily } = useThemeContext();

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

          {/* 字体（字族 + 字号）/ Fonts (family + size) */}
          <div className='px-16px md:px-24px lg:px-28px py-14px md:py-16px bg-2 rd-16px'>
            <div className='text-14px text-t-primary leading-22px mb-12px'>{t('settings.fonts')}</div>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {FONT_SIZE_KEYS.map((key) => (
                <PreferenceRow key={key} label={t(FONT_REGION_LABEL_KEY[key])}>
                  <div className='flex items-center gap-12px flex-wrap justify-end'>
                    <FontFamilySelect
                      value={fontFamilies[key]}
                      onChange={(family) => void setFontFamily(key, family)}
                    />
                    <FontSizeStepper
                      value={fontSizes[key]}
                      min={FONT_SIZE_SPECS[key].min}
                      max={FONT_SIZE_SPECS[key].max}
                      step={FONT_SIZE_STEP}
                      defaultValue={FONT_SIZE_SPECS[key].default}
                      resetLabel={t('settings.fontSizeStepperReset')}
                      onChange={(px) => void setFontSize(key, px)}
                    />
                  </div>
                </PreferenceRow>
              ))}
            </div>
          </div>

          {/* 缩放控制 / Scale Control */}
          <div className='px-16px md:px-24px lg:px-28px py-14px md:py-16px bg-2 rd-16px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              <PreferenceRow label={t('settings.scale')}>
                <ScaleControl />
              </PreferenceRow>
            </div>
          </div>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default AppearanceModalContent;
