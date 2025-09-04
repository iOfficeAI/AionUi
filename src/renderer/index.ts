/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PropsWithChildren } from 'react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../adapter/browser';
// Initialize i18n before importing any components that may use it
import './i18n';
import Main from './main';

import 'uno.css';
import './index.css';
import '@arco-design/web-react/dist/css/arco.css';
import enUS from '@arco-design/web-react/es/locale/en-US'; // 英文
import jaJP from '@arco-design/web-react/es/locale/ja-JP'; // 日文
import zhCN from '@arco-design/web-react/es/locale/zh-CN'; // 中文（简体）
import zhTW from '@arco-design/web-react/es/locale/zh-TW'; // 中文（繁体）
import { ConfigProvider } from '@arco-design/web-react';
import { applyAppStyles, enableAppStyleObserver } from './themes/app-style-applier';
import HOC from './utils/HOC';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './themes';

// 全局处理 ResizeObserver 错误（遮罩/控制台抑制 + 捕获阶段阻断）
if (typeof window !== 'undefined') {
  // 捕获阶段阻断 error 事件，避免 dev-server overlay 捕获并弹窗
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const msg = String(event.message || (event.error && (event.error as Error).message) || '');
      if (msg.includes('ResizeObserver')) {
        event.preventDefault();
        (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      }
    },
    true
  );

  // onerror 兜底（部分环境以字符串形式透出）
  const originalOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    if (typeof message === 'string' && message.includes('ResizeObserver')) {
      return true; // 阻止错误显示
    }
    return originalOnError ? originalOnError(message, source, lineno, colno, error) : false;
  };

  // 同时处理 unhandledrejection
  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason: unknown = (event as PromiseRejectionEvent).reason;
      const msg = typeof reason === 'string' ? reason : (reason as Error)?.message;
      if (msg && String(msg).includes('ResizeObserver')) {
        event.preventDefault();
      }
    },
    true
  );

  // 过滤控制台报错，避免影响 overlay 的错误收集
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const joined = args.map((a) => (typeof a === 'string' ? a : (a && (a as Error).message) || '')).join(' ');
    if (joined.includes('ResizeObserver')) return;
    originalConsoleError(...args);
  };
}

const root = createRoot(document.getElementById('root'));

const Config: React.FC<PropsWithChildren> = (props) => {
  const {
    i18n: { language },
  } = useTranslation();
  return React.createElement(
    ConfigProvider,
    {
      // Let ThemeProvider provide Arco theme tokens; keep only locale here
      locale: language === 'zh-CN' ? zhCN : language === 'zh-TW' ? zhTW : language === 'ja-JP' ? jaJP : enUS,
    },
    props.children
  );
};

// Wrap app with Config (locale/theme) and the new ThemeProvider
root.render(React.createElement(HOC.Wrapper(Config, ThemeProvider)(Main)));

// Ensure appStyles applied when index is initialized (safety in case provider mount is late)
if (typeof window !== 'undefined') {
  enableAppStyleObserver(document.body);
  applyAppStyles(document.body);
}
