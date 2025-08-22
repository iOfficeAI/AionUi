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

  return React.createElement(
    ConfigProvider,
    {
      theme: {
        primaryColor: currentTheme.colors.primary,
        // 添加暗色主题支持
        ...(currentTheme.mode === 'dark' && {
          // 基础背景色
          colorBgLayout: currentTheme.colors.background,
          colorBgContainer: currentTheme.colors.surface,
          colorBgElevated: currentTheme.colors.surfaceHover,
          colorBgBase: currentTheme.colors.background,
          colorBgSpotlight: currentTheme.colors.surface,

          // 文字颜色
          colorText: currentTheme.colors.textPrimary,
          colorTextSecondary: currentTheme.colors.textSecondary,
          colorTextTertiary: currentTheme.colors.textTertiary,
          colorTextQuaternary: currentTheme.colors.textDisabled,
          colorTextBase: currentTheme.colors.textPrimary,
          colorTextLabel: currentTheme.colors.textPrimary,
          colorTextPlaceholder: currentTheme.colors.textTertiary,

          // 边框颜色
          colorBorder: currentTheme.colors.border,
          colorBorderSecondary: currentTheme.colors.borderHover,

          // 填充颜色
          colorFill: currentTheme.colors.surfaceHover,
          colorFillSecondary: currentTheme.colors.surface,
          colorFillTertiary: currentTheme.colors.backgroundSecondary,
          colorFillQuaternary: currentTheme.colors.backgroundTertiary,

          // 输入框相关
          colorBgTextInput: currentTheme.colors.surface,
          colorBgTextInputHover: currentTheme.colors.surfaceHover,
          colorBgTextInputFocus: currentTheme.colors.surface,
          colorBgTextInputDisabled: currentTheme.colors.backgroundSecondary,

          // 卡片和面板
          colorBgCard: currentTheme.colors.surface,
          colorBgPanel: currentTheme.colors.backgroundSecondary,

          // 分割线
          colorSplit: currentTheme.colors.border,
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
