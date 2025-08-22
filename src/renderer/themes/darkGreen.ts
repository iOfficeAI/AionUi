/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from './types';

export const darkGreenTheme: Theme = {
  id: 'dark-green',
  name: '墨绿深邃',
  mode: 'dark',
  colors: {
    // Primary colors (金色系强调色)
    primary: '#D4AF37',
    primaryHover: '#B8941F',
    primaryActive: '#9C7A12',

    // Background colors (墨绿色系)
    background: '#0D1B0D',
    backgroundSecondary: '#132B13',
    backgroundTertiary: '#1A3B1A',

    // Surface colors
    surface: '#132B13',
    surfaceHover: '#1A3B1A',
    surfaceSelected: '#214B21',

    // Text colors (暖白色系，与墨绿背景形成良好对比)
    textPrimary: '#F0F8F0', // 淡绿白色
    textSecondary: '#D0E0D0', // 浅绿灰色
    textTertiary: '#A0C0A0', // 中等绿灰色
    textDisabled: '#708070', // 深绿灰色

    // Border colors
    border: '#2D4B2D',
    borderHover: '#3D5B3D',
    borderActive: '#D4AF37',

    // Status colors (调整为适配墨绿背景的颜色)
    success: '#4CAF50', // 明亮绿色
    warning: '#FFA726', // 橙色
    error: '#EF5350', // 红色
    info: '#42A5F5', // 蓝色

    // Sidebar specific
    sidebarBackground: '#0D1B0D',
    sidebarHover: '#1A3B1A',

    // Logo/Brand colors
    logoBackground: '#D4AF37',
    logoForeground: '#0D1B0D',

    // Search highlight colors
    searchHighlight: '#FFE4B5', // 淡金色高亮文字
    searchHighlightBackground: '#2D4B2D', // 深绿色背景

    // Code block theme
    codeBlockTheme: 'atom-one-dark', // 墨绿主题使用 atom-one-dark 主题

    // Icon colors
    iconPrimary: '#B8C8B8', // 图标主要颜色，淡绿色调
    iconSecondary: '#8B9B8B', // 图标次要颜色，中等绿灰色
  },
  // 文本颜色映射：根据i18n key自定义特定文字的颜色
  textColorMap: {
    // 主题相关
    'settings.theme.current': '#D4AF37', // "当前"标识用金色强调
    'settings.theme.title': '#F0F8F0', // 主题设置标题
    'settings.theme.mode': '#F0F8F0', // 主题模式标题
    'settings.theme.auto': '#F0F8F0', // 自动模式文字
    'settings.theme.light': '#F0F8F0', // 浅色模式文字
    'settings.theme.dark': '#F0F8F0', // 深色模式文字
    'settings.theme.autoDesc': '#D0E0D0', // 自动模式描述

    // 对话相关
    'conversation.welcome.title': '#F0F8F0', // 欢迎标题
    'conversation.welcome.newConversation': '#F0F8F0', // 新对话

    // 通用
    'common.settings': '#F0F8F0', // 设置
    'common.back': '#F0F8F0', // 返回

    // 状态文字
    success: '#4CAF50', // 成功状态
    warning: '#FFA726', // 警告状态
    error: '#EF5350', // 错误状态
    info: '#42A5F5', // 信息状态
  },
};
