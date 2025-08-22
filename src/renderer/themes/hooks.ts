/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTheme } from './ThemeProvider';
import type { ThemeColors } from './types';

/**
 * Hook to get theme colors for easy usage in components
 */
export const useThemeColors = (): ThemeColors => {
  const { currentTheme } = useTheme();
  return currentTheme.colors;
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
  return currentTheme.mode === 'dark';
};

/**
 * Hook to get theme-aware class names
 * Returns className utilities for theme-specific styling
 */
export const useThemeClasses = () => {
  const { currentTheme } = useTheme();
  const isDark = currentTheme.mode === 'dark';

  return {
    isDark,
    themeMode: currentTheme.mode,
    themeId: currentTheme.id,
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
    // 优先使用textColorMap中配置的颜色
    if (currentTheme.textColorMap && currentTheme.textColorMap[i18nKey]) {
      return currentTheme.textColorMap[i18nKey];
    }

    // 如果没有配置特定颜色，使用fallback颜色
    if (fallback) {
      return currentTheme.colors[fallback];
    }

    // 最后使用默认的主要文字颜色
    return currentTheme.colors.textPrimary;
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
    // 如果第一个参数是 'primary' 或 'secondary'，则直接返回对应的默认图标颜色
    if (i18nKeyOrLevel === 'primary') {
      return currentTheme.colors.iconPrimary;
    }
    if (i18nKeyOrLevel === 'secondary') {
      return currentTheme.colors.iconSecondary;
    }

    // 否则作为 i18n key 处理，优先使用 iconColorMap 中配置的颜色
    if (currentTheme.iconColorMap && currentTheme.iconColorMap[i18nKeyOrLevel]) {
      return currentTheme.iconColorMap[i18nKeyOrLevel];
    }

    // 如果没有配置特定颜色，使用 fallback 颜色
    if (fallback) {
      return fallback === 'primary' ? currentTheme.colors.iconPrimary : currentTheme.colors.iconSecondary;
    }

    // 最后使用默认的主要图标颜色
    return currentTheme.colors.iconPrimary;
  };
};
