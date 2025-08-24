/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThemeMode = 'light' | 'dark' | 'auto' | 'filter-dark';

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
