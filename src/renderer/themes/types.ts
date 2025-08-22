/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface ThemeColors {
  // Primary colors
  primary: string;
  primaryHover: string;
  primaryActive: string;

  // Background colors
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;

  // Surface colors
  surface: string;
  surfaceHover: string;
  surfaceSelected: string;

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;

  // Border colors
  border: string;
  borderHover: string;
  borderActive: string;

  // Status colors
  success: string;
  warning: string;
  error: string;
  info: string;

  // Sidebar specific
  sidebarBackground: string;
  sidebarHover: string;

  // Logo/Brand colors
  logoBackground: string;
  logoForeground: string;

  // Search highlight colors
  searchHighlight: string;
  searchHighlightBackground: string;

  // Code block theme
  codeBlockTheme: string; // react-syntax-highlighter 主题名称

  // Icon colors
  iconPrimary: string;
  iconSecondary: string;
}

export interface Theme {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  colors: ThemeColors;
  // 文本颜色映射：i18n key -> 颜色值
  textColorMap?: Record<string, string>;
  // 图标颜色映射：i18n key -> 颜色值
  iconColorMap?: Record<string, string>;
}

export interface ThemeConfig {
  currentTheme: string;
  autoMode: boolean;
  themes: Record<string, Theme>;
  // 分别保存亮色和暗色模式下选择的主题
  preferredLightTheme?: string;
  preferredDarkTheme?: string;
}
