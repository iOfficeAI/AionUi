/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// context/ThemeContext.tsx - Unified Theme Management Context 统一主题管理上下文
import type { PropsWithChildren } from 'react';
import React, { createContext, useContext } from 'react';
import type { Theme } from '../hooks/useTheme';
import useTheme from '../hooks/useTheme';
import type { ColorScheme } from '../hooks/useColorScheme';
import useColorScheme from '../hooks/useColorScheme';
import useFontScale from '../hooks/useFontScale';

/**
 * Theme context value interface 主题上下文值接口
 * Separates light/dark mode from color schemes 分离明暗模式和配色方案
 */
interface ThemeContextValue {
  // Light/Dark mode 明暗模式
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;

  // Color scheme 配色方案
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;

  // Font scaling 字体缩放
  fontScale: number;
  setFontScale: (scale: number) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Theme provider component 主题提供者组件
 * Manages both light/dark mode and color schemes 同时管理明暗模式和配色方案
 */
export const ThemeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [theme, setTheme] = useTheme();
  const [colorScheme, setColorScheme] = useColorScheme();
  const [fontScale, setFontScale] = useFontScale();

  return <ThemeContext.Provider value={{ theme, setTheme, colorScheme, setColorScheme, fontScale, setFontScale }}>{children}</ThemeContext.Provider>;
};

/**
 * Hook to access theme context 访问主题上下文的 Hook
 * @throws {Error} If used outside of ThemeProvider 如果在 ThemeProvider 外使用会抛出错误
 */
export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
};
