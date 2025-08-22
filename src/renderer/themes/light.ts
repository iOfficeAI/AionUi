/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from './types';

export const defaultLightTheme: Theme = {
  id: 'default-light',
  name: 'Default Light',
  mode: 'light',
  colors: {
    // Primary colors (based on current Arco Design primaryColor)
    primary: '#4E5969',
    primaryHover: '#3D4652',
    primaryActive: '#2A2E37',

    // Background colors (based on current usage)
    background: '#ffffff',
    backgroundSecondary: '#f7f8fa',
    backgroundTertiary: '#f2f3f5',

    // Surface colors
    surface: '#ffffff',
    surfaceHover: '#f7f8fa',
    surfaceSelected: '#e5e6eb',

    // Text colors
    textPrimary: '#1d2129',
    textSecondary: '#4e5969',
    textTertiary: '#86909c',
    textDisabled: '#c9cdd4',

    // Border colors
    border: '#e5e6eb',
    borderHover: '#c9cdd4',
    borderActive: '#86909c',

    // Status colors
    success: '#00b42a',
    warning: '#ff7d00',
    error: '#f53f3f',
    info: '#165dff',

    // Sidebar specific (current layout colors)
    sidebarBackground: '#f2f3f5',
    sidebarHover: '#e5e6eb',

    // Logo/Brand colors (current logo style)
    logoBackground: '#000000',
    logoForeground: '#ffffff',

    // Search highlight colors
    searchHighlight: '#ff6b35', // 橙色高亮文字
    searchHighlightBackground: '#fff3e0', // 浅橙色背景

    // Code block theme
    codeBlockTheme: 'github', // 浅色主题使用 github 主题

    // Icon colors
    iconPrimary: '#4e5969', // 图标主要颜色，与textSecondary一致但独立配置
    iconSecondary: '#86909c', // 图标次要颜色
  },
  // 文本颜色映射：根据i18n key自定义特定文字的颜色
  textColorMap: {
    // 主题相关
    'settings.theme.current': '#4E5969', // "当前"标识用主题色
    'settings.theme.title': '#1d2129', // 主题设置标题
    'settings.theme.mode': '#1d2129', // 主题模式标题
    'settings.theme.auto': '#1d2129', // 自动模式文字
    'settings.theme.light': '#1d2129', // 浅色模式文字
    'settings.theme.dark': '#1d2129', // 深色模式文字
    'settings.theme.autoDesc': '#4e5969', // 自动模式描述

    // 设置页面相关
    'settings.gemini': '#1d2129', // Gemini设置
    'settings.model': '#1d2129', // 模型设置
    'settings.system': '#1d2129', // 系统设置
    'settings.about': '#1d2129', // 关于我们

    // 对话相关
    'conversation.welcome.title': '#1d2129', // 欢迎标题
    'conversation.welcome.newConversation': '#1d2129', // 新对话

    // 通用
    'common.settings': '#1d2129', // 设置
    'common.back': '#1d2129', // 返回

    // 状态文字
    success: '#00b42a', // 成功状态
    warning: '#ff7d00', // 警告状态
    error: '#f53f3f', // 错误状态
    info: '#165dff', // 信息状态
  },
};
