/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTheme } from './ThemeProvider';
import { createThemeAdapter, getTextColor, getIconColor } from './themeAdapter';
import type { ThemeColors } from './types';

/**
 * 获取当前主题的颜色配置
 */
export const useThemeColors = (): ThemeColors => {
  const { currentTheme } = useTheme();
  if (!currentTheme) {
    // 返回默认颜色
    return {
      primary: '#4E5969',
      primaryHover: '#3D4652',
      primaryActive: '#2A2E37',
      background: '#ffffff',
      backgroundSecondary: '#f7f8fa',
      backgroundTertiary: '#f2f3f5',
      surface: '#ffffff',
      surfaceHover: '#f7f8fa',
      surfaceSelected: '#e5e6eb',
      textPrimary: '#1d2129',
      textSecondary: '#4e5969',
      textTertiary: '#86909c',
      textDisabled: '#c9cdd4',
      border: '#e5e6eb',
      borderHover: '#c9cdd4',
      borderActive: '#86909c',
      success: '#00b42a',
      warning: '#ff7d00',
      error: '#f53f3f',
      info: '#165dff',
      sidebarBackground: '#f2f3f5',
      sidebarHover: '#e5e6eb',
      logoBackground: '#000000',
      logoForeground: '#ffffff',
      searchHighlight: '#ff6b35',
      searchHighlightBackground: '#fff3e0',
      codeBlockTheme: 'github',
      iconPrimary: '#4e5969',
      iconSecondary: '#86909c',
    };
  }
  return currentTheme.manifest.variables as unknown as ThemeColors;
};

/**
 * Hook to get CSS variable string for a theme color
 * Usage: style={{ backgroundColor: getThemeVar('primary') }}
 */
export const useThemeVar = () => {
  return (colorKey: keyof ThemeColors): string => {
    const cssVarName = `--theme-${colorKey.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    return `var(${cssVarName})`;
  };
};

/**
 * Hook to check if current theme is dark mode
 */
export const useIsDarkMode = (): boolean => {
  const { currentTheme } = useTheme();
  return currentTheme?.manifest.mode === 'dark';
};

/**
 * Hook to get theme-aware class names
 * Returns className utilities for theme-specific styling
 */
export const useThemeClasses = () => {
  const { currentTheme } = useTheme();
  const isDark = currentTheme?.manifest.mode === 'dark';

  return {
    isDark,
    themeMode: currentTheme?.manifest.mode || 'light',
    themeId: currentTheme?.manifest.id || 'default',
    // Common class combinations
    background: 'bg-[var(--theme-background)]',
    backgroundSecondary: 'bg-[var(--theme-background-secondary)]',
    backgroundTertiary: 'bg-[var(--theme-background-tertiary)]',
    surface: 'bg-[var(--theme-surface)]',
    textPrimary: 'text-[var(--theme-text-primary)]',
    textSecondary: 'text-[var(--theme-text-secondary)]',
    border: 'border-[var(--theme-border)]',
    primary: 'bg-[var(--theme-primary)]',
    sidebarBackground: 'bg-[var(--theme-sidebar-background)]',
  };
};

/**
 * Hook to get text color for a specific i18n key
 * 根据i18n key获取对应的文字颜色，如果没有配置特定颜色就使用全局默认颜色
 * Usage: const textColor = useTextColor('settings.theme.current');
 */
export const useTextColor = () => {
  const { currentTheme } = useTheme();

  return (i18nKey: string, fallback?: keyof ThemeColors): string => {
    if (!currentTheme) return '#000000';

    const adapter = createThemeAdapter(currentTheme);
    return getTextColor(adapter, i18nKey, fallback);
  };
};

/**
 * Hook to get icon color
 * 获取图标颜色，可以指定使用primary或secondary级别，也可以基于i18n key获取特定颜色
 * Usage:
 * - const iconColor = useIconColor()('primary'); // 获取默认图标颜色
 * - const iconColor = useIconColor()('settings.theme.title', 'primary'); // 获取特定图标颜色
 */
export const useIconColor = () => {
  const { currentTheme } = useTheme();

  return (i18nKeyOrLevel: string, fallback?: 'primary' | 'secondary'): string => {
    if (!currentTheme) return '#666666';

    const adapter = createThemeAdapter(currentTheme);
    return getIconColor(adapter, i18nKeyOrLevel, fallback);
  };
};
