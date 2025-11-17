/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/context/ThemeContext';
import AionSelect from '@/renderer/components/base/AionSelect';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 主题切换器组件 / Theme switcher component
 *
 * 提供明暗模式切换功能
 * Provides light/dark mode switching functionality
 */
export const ThemeSwitcher = () => {
  const { theme, setTheme } = useThemeContext();
  const { t } = useTranslation();

  return (
    <div className='flex items-center gap-8px'>
      {/* 明暗模式选择器 / Light/Dark mode selector */}
      <AionSelect value={theme} onChange={setTheme} className='w-160px'>
        <AionSelect.Option value='light'>{t('settings.lightMode')}</AionSelect.Option>
        <AionSelect.Option value='dark'>{t('settings.darkMode')}</AionSelect.Option>
      </AionSelect>
    </div>
  );
};
