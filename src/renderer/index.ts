/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import '../adapter/browser';
import type { PropsWithChildren } from 'react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import Main from './main';

import 'uno.css';
import './index.css';
import '@arco-design/web-react/dist/css/arco.css';
import './i18n';
import enUS from '@arco-design/web-react/es/locale/en-US'; // 英文
import zhCN from '@arco-design/web-react/es/locale/zh-CN'; // 中文（简体）
import zhTW from '@arco-design/web-react/es/locale/zh-TW'; // 中文（繁体）
import jaJP from '@arco-design/web-react/es/locale/ja-JP'; // 日文
import { ConfigProvider } from '@arco-design/web-react';
import HOC from './utils/HOC';
import { useTranslation } from 'react-i18next';
import { ThemeProvider, useTheme } from './themes/index';
const root = createRoot(document.getElementById('root'));

const Config: React.FC<PropsWithChildren> = (props) => {
  const {
    i18n: { language },
  } = useTranslation();
  const { currentTheme } = useTheme();

  // 如果没有当前主题，使用默认配置
  if (!currentTheme) {
    return React.createElement(
      ConfigProvider,
      {
        locale: language === 'zh-CN' ? zhCN : language === 'zh-TW' ? zhTW : language === 'ja-JP' ? jaJP : enUS,
      },
      props.children
    );
  }

  const themeColors = currentTheme.manifest.variables;
  const isDarkMode = currentTheme.manifest.mode === 'dark';

  return React.createElement(
    ConfigProvider,
    {
      theme: {
        primaryColor: themeColors.primary,
        // 添加暗色主题支持
        ...(isDarkMode && {
          // 基础背景色
          colorBgLayout: themeColors.background,
          colorBgContainer: themeColors.surface,
          colorBgElevated: themeColors.surfaceHover,
          colorBgBase: themeColors.background,
          colorBgSpotlight: themeColors.surface,

          // 文字颜色
          colorText: themeColors.textPrimary,
          colorTextSecondary: themeColors.textSecondary,
          colorTextTertiary: themeColors.textTertiary,
          colorTextQuaternary: themeColors.textDisabled,
          colorTextBase: themeColors.textPrimary,
          colorTextLabel: themeColors.textPrimary,
          colorTextPlaceholder: themeColors.textTertiary,

          // 边框颜色
          colorBorder: themeColors.border,
          colorBorderSecondary: themeColors.borderHover,

          // 填充颜色
          colorFill: themeColors.surfaceHover,
          colorFillSecondary: themeColors.surface,
          colorFillTertiary: themeColors.backgroundSecondary,
          colorFillQuaternary: themeColors.backgroundTertiary,

          // 输入框相关
          colorBgTextInput: themeColors.surface,
          colorBgTextInputHover: themeColors.surfaceHover,
          colorBgTextInputFocus: themeColors.surface,
          colorBgTextInputDisabled: themeColors.backgroundSecondary,

          // 卡片和面板
          colorBgCard: themeColors.surface,
          colorBgPanel: themeColors.backgroundSecondary,

          // 分割线
          colorSplit: themeColors.border,
        }),
      },
      locale: language === 'zh-CN' ? zhCN : language === 'zh-TW' ? zhTW : language === 'ja-JP' ? jaJP : enUS,
    },
    props.children
  );
};

// Wrapper component that provides ThemeProvider
const App: React.FC = () => {
  return React.createElement(ThemeProvider, { children: React.createElement(HOC(Config)(Main)) });
};

root.render(React.createElement(App));
