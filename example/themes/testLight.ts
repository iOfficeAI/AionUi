/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '../../src/renderer/themes/types';

export const testLightTheme: Theme = {
  id: 'test-light',
  name: '🧪 测试浅色',
  mode: 'light',
  colors: {
    // Primary colors (测试用红色系)
    primary: '#FF0000', // 纯红色
    primaryHover: '#FF3333', // 浅红色
    primaryActive: '#CC0000', // 深红色

    // Background colors (测试用蓝色系)
    background: '#E6F3FF', // 浅蓝色背景
    backgroundSecondary: '#CCE6FF', // 中蓝色背景
    backgroundTertiary: '#B3DAFF', // 深蓝色背景

    // Surface colors (测试用绿色系)
    surface: '#E6FFE6', // 浅绿色表面
    surfaceHover: '#CCFFCC', // 中绿色悬停
    surfaceSelected: '#B3FFB3', // 深绿色选中

    // Text colors (测试用紫色系)
    textPrimary: '#800080', // 紫色主文字
    textSecondary: '#9932CC', // 中紫色次要文字
    textTertiary: '#BA55D3', // 浅紫色第三文字
    textDisabled: '#DDA0DD', // 很浅紫色禁用文字

    // Border colors (测试用橙色系)
    border: '#FFA500', // 橙色边框
    borderHover: '#FF8C00', // 深橙色悬停边框
    borderActive: '#FF4500', // 红橙色激活边框

    // Status colors (测试用各种鲜艳色)
    success: '#00FF00', // 纯绿色成功
    warning: '#FFFF00', // 纯黄色警告
    error: '#FF00FF', // 洋红色错误
    info: '#00FFFF', // 青色信息

    // Sidebar specific (测试用粉色系)
    sidebarBackground: '#FFE6F2', // 浅粉色侧边栏
    sidebarHover: '#FFCCDB', // 中粉色侧边栏悬停

    // Logo/Brand colors (测试用棕色系)
    logoBackground: '#8B4513', // 棕色Logo背景
    logoForeground: '#F4A460', // 沙棕色Logo前景

    // Search highlight colors (测试用亮色系)
    searchHighlight: '#FF1493', // 深粉色高亮文字
    searchHighlightBackground: '#FFFF99', // 浅黄色高亮背景

    // Code block theme
    codeBlockTheme: 'github', // 浅色代码主题

    // Icon colors (测试用亮色系)
    iconPrimary: '#FF6347', // 番茄色图标主要颜色
    iconSecondary: '#FFA500', // 橙色图标次要颜色
  },
  textColorMap: {
    'settings.theme.current': '#FF0000', // 红色"当前"标识
    'settings.theme.title': '#800080', // 紫色标题
    'settings.personalAuth': '#FF1493', // 深粉色Google帐号
    'settings.proxyConfig': '#32CD32', // 青柠绿代理
    'settings.cacheDir': '#FF8C00', // 深橙色缓存目录
    'settings.workDir': '#DC143C', // 深红色工作目录
    'markdown.codeHeader': '#FF8C00', // 橙色代码头
    'markdown.codeToggle': '#00FF00', // 绿色代码切换
    'markdown.inlineCode': '#9932CC', // 紫色内联代码
    'markdown.codeBlock': '#8B4513', // 棕色代码块
    success: '#00FF00',
    warning: '#FFFF00',
    error: '#FF00FF',
    info: '#00FFFF',
  },
  // 图标颜色映射：为特定的菜单项设置独立的图标颜色
  iconColorMap: {
    'settings.theme.title': '#FF1493', // 主题设置图标用深粉色
    'settings.gemini': '#00FF7F', // Gemini设置图标用春绿色
    'settings.model': '#FF4500', // 模型设置图标用橙红色
    'settings.system': '#4169E1', // 系统设置图标用皇家蓝
    'settings.about': '#FFD700', // 关于图标用金色
  },
};
