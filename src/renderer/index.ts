/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import './bootstrap/runtimePatches';
import type { PropsWithChildren } from 'react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../adapter/browser';
import Main from './main';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { PreviewProvider } from './pages/conversation/preview';
import { ConversationTabsProvider } from './pages/conversation/context/ConversationTabsContext';

import { ConfigProvider } from '@arco-design/web-react';
// 配置 Arco Design 使用 React 18 的 createRoot，修复 Message 组件的 CopyReactDOM.render 错误
// Configure Arco Design to use React 18's createRoot, fixing Message component's CopyReactDOM.render error
import '@arco-design/web-react/es/_util/react-19-adapter';
import '@arco-design/web-react/dist/css/arco.css';
import enUS from '@arco-design/web-react/es/locale/en-US'; // 英文
import jaJP from '@arco-design/web-react/es/locale/ja-JP'; // 日文
import zhCN from '@arco-design/web-react/es/locale/zh-CN'; // 中文（简体）
import zhTW from '@arco-design/web-react/es/locale/zh-TW'; // 中文（繁体）
import koKR from '@arco-design/web-react/es/locale/ko-KR'; // 韩文
import { useTranslation } from 'react-i18next';
import 'uno.css';
import './arco-override.css';
import './i18n';
import './styles/themes/index.css';
import HOC from './utils/HOC';
const root = createRoot(document.getElementById('root'));

// Patch Korean locale with missing properties from English locale
const koKRComplete = {
  ...koKR,
  Calendar: {
    ...koKR.Calendar,
    monthFormat: enUS.Calendar.monthFormat,
    yearFormat: enUS.Calendar.yearFormat,
  },
  DatePicker: {
    ...koKR.DatePicker,
    Calendar: {
      ...koKR.DatePicker.Calendar,
      monthFormat: enUS.Calendar.monthFormat,
      yearFormat: enUS.Calendar.yearFormat,
    },
  },
  Form: enUS.Form,
  ColorPicker: enUS.ColorPicker,
};

const arcoLocales: Record<string, typeof enUS> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'ja-JP': jaJP,
  'ko-KR': koKRComplete,
  'en-US': enUS,
};

const AppProviders: React.FC<PropsWithChildren> = ({ children }) => React.createElement(AuthProvider, null, React.createElement(ThemeProvider, null, React.createElement(PreviewProvider, null, React.createElement(ConversationTabsProvider, null, children))));

const Config: React.FC<PropsWithChildren> = ({ children }) => {
  const {
    i18n: { language },
  } = useTranslation();
  const arcoLocale = arcoLocales[language] ?? enUS;

  return React.createElement(ConfigProvider, { theme: { primaryColor: '#4E5969' }, locale: arcoLocale }, children);
};

const App = HOC.Wrapper(Config)(Main);

root.render(React.createElement(AppProviders, null, React.createElement(App)));
