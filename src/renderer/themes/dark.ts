/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from './types';

export const ideaDarkTheme: Theme = {
  id: 'idea-dark',
  name: 'IDEA Dark',
  mode: 'dark',
  colors: {
    // Primary colors (IDEA-inspired)
    primary: '#6494ED',
    primaryHover: '#5B85D6',
    primaryActive: '#4A75C2',

    // Background colors (更深的全暗主题)
    background: '#1E1E1E',
    backgroundSecondary: '#252526',
    backgroundTertiary: '#2D2D30',

    // Surface colors
    surface: '#252526',
    surfaceHover: '#2D2D30',
    surfaceSelected: '#37373D',

    // Text colors (更高对比度的浅色)
    textPrimary: '#E8E8E8', // 更亮的主要文字颜色
    textSecondary: '#C0C0C0', // 更亮的次要文字颜色
    textTertiary: '#909090', // 更亮的第三级文字颜色
    textDisabled: '#606060', // 稍微亮一点的禁用文字颜色

    // Border colors
    border: '#3E3E42',
    borderHover: '#464647',
    borderActive: '#6494ED',

    // Status colors (IDEA-like)
    success: '#6A8759',
    warning: '#BBB529',
    error: '#BC3F3C',
    info: '#6897BB',

    // Sidebar specific (全暗)
    sidebarBackground: '#1E1E1E',
    sidebarHover: '#2D2D30',

    // Logo/Brand colors (adapted for dark theme)
    logoBackground: '#6494ED',
    logoForeground: '#FFFFFF',

    // Search highlight colors
    searchHighlight: '#FFD700', // 金色高亮文字
    searchHighlightBackground: '#3D3D00', // 深黄色背景

    // Code block theme
    codeBlockTheme: 'tomorrow-night', // 暗色主题使用 tomorrow-night 主题

    // Icon colors
    iconPrimary: '#B0B0B0', // 图标主要颜色，比textSecondary稍微亮一些
    iconSecondary: '#808080', // 图标次要颜色
  },
  // 文本颜色映射：根据i18n key自定义特定文字的颜色
  textColorMap: {
    // 主题相关
    'settings.theme.current': '#6494ED', // "当前"标识用主题色
    'settings.theme.title': '#E8E8E8', // 主题设置标题
    'settings.theme.mode': '#E8E8E8', // 主题模式标题
    'settings.theme.auto': '#E8E8E8', // 自动模式文字
    'settings.theme.light': '#E8E8E8', // 浅色模式文字
    'settings.theme.dark': '#E8E8E8', // 深色模式文字
    'settings.theme.autoDesc': '#C0C0C0', // 自动模式描述

    // 设置页面相关
    'settings.gemini': '#E8E8E8', // Gemini设置
    'settings.model': '#E8E8E8', // 模型设置
    'settings.system': '#E8E8E8', // 系统设置
    'settings.about': '#E8E8E8', // 关于我们

    // 对话相关
    'conversation.welcome.title': '#E8E8E8', // 欢迎标题
    'conversation.welcome.newConversation': '#E8E8E8', // 新对话

    // 通用
    'common.settings': '#E8E8E8', // 设置
    'common.back': '#E8E8E8', // 返回

    // 状态文字
    success: '#6A8759', // 成功状态
    warning: '#BBB529', // 警告状态
    error: '#BC3F3C', // 错误状态
    info: '#6897BB', // 信息状态
  },
  // 图标颜色映射：为特定的菜单项设置独立的图标颜色（示例：主题设置图标使用主题色）
  iconColorMap: {},
};
