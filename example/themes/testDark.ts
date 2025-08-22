/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '../../src/renderer/themes/types';

export const testDarkTheme: Theme = {
  id: 'test-dark',
  name: '🧪 测试深色',
  mode: 'dark',
  colors: {
    // Primary colors (测试用黄绿色系)
    primary: '#ADFF2F', // 黄绿色
    primaryHover: '#9ACD32', // 黄绿色悬停
    primaryActive: '#7FFF00', // 查特鲁斯绿

    // Background colors (测试用深紫色系)
    background: '#2F0A3E', // 深紫色背景
    backgroundSecondary: '#4B0082', // 靛蓝色背景
    backgroundTertiary: '#6A0DAD', // 深紫红色背景

    // Surface colors (测试用深蓝色系)
    surface: '#000080', // 海军蓝表面
    surfaceHover: '#191970', // 午夜蓝悬停
    surfaceSelected: '#4169E1', // 皇家蓝选中

    // Text colors (测试用亮色系)
    textPrimary: '#00FFFF', // 青色主文字
    textSecondary: '#FFD700', // 金色次要文字
    textTertiary: '#FF6347', // 番茄红第三文字
    textDisabled: '#808080', // 灰色禁用文字

    // Border colors (测试用亮绿色系)
    border: '#32CD32', // 石灰绿边框
    borderHover: '#00FF32', // 亮绿色悬停边框
    borderActive: '#00FF00', // 纯绿色激活边框

    // Status colors (测试用霓虹色系)
    success: '#00FF7F', // 春绿色成功
    warning: '#FFB347', // 桃色警告
    error: '#FF6B6B', // 浅红色错误
    info: '#87CEEB', // 天蓝色信息

    // Sidebar specific (测试用深青色系)
    sidebarBackground: '#008B8B', // 深青色侧边栏
    sidebarHover: '#20B2AA', // 浅海绿色侧边栏悬停

    // Logo/Brand colors (测试用亮橙色系)
    logoBackground: '#FF4500', // 橙红色Logo背景
    logoForeground: '#FFFF00', // 黄色Logo前景

    // Search highlight colors (测试用亮粉色系)
    searchHighlight: '#FF69B4', // 热粉色高亮文字
    searchHighlightBackground: '#8B008B', // 深洋红色高亮背景

    // Code block theme
    codeBlockTheme: 'atom-one-dark', // 暗色代码主题

    // Icon colors (测试用霓虹色系)
    iconPrimary: '#00FF7F', // 春绿色图标主要颜色
    iconSecondary: '#FF6347', // 番茄红图标次要颜色
  },
  textColorMap: {
    'settings.theme.current': '#ADFF2F', // 黄绿色"当前"标识
    'settings.theme.title': '#00FFFF', // 青色标题
    'settings.personalAuth': '#FF69B4', // 热粉色Google帐号
    'settings.proxyConfig': '#7FFF00', // 查特鲁斯绿代理
    'settings.cacheDir': '#FFD700', // 金色缓存目录
    'settings.workDir': '#FF4500', // 橙红色工作目录
    'markdown.codeHeader': '#FFD700', // 金色代码头
    'markdown.codeToggle': '#FF6347', // 番茄红代码切换
    'markdown.inlineCode': '#32CD32', // 石灰绿内联代码
    'markdown.codeBlock': '#FF4500', // 橙红色代码块
    success: '#00FF7F',
    warning: '#FFB347',
    error: '#FF6B6B',
    info: '#87CEEB',
  },
  // 图标颜色映射：为特定的菜单项设置独立的图标颜色
  iconColorMap: {
    'settings.theme.title': '#ADFF2F', // 主题设置图标用黄绿色（与primary色一致）
    'settings.gemini': '#FF69B4', // Gemini设置图标用热粉色
    'settings.model': '#00FFFF', // 模型设置图标用青色
    'settings.system': '#FFD700', // 系统设置图标用金色
    'settings.about': '#FF6347', // 关于图标用番茄红
  },
};
