/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// context/ThemeContext.tsx - Unified Theme Management Context 统一主题管理上下文
import type { PropsWithChildren } from 'react';
import React, { createContext, useContext } from 'react';
import type { Theme } from '@renderer/hooks/system/useTheme';
import useTheme from '@renderer/hooks/system/useTheme';
import type { ColorScheme } from '@renderer/hooks/ui/useColorScheme';
import useColorScheme from '@renderer/hooks/ui/useColorScheme';
import useFontScale from '@renderer/hooks/ui/useFontScale';
import useChatFontScale from '@renderer/hooks/ui/useChatFontScale';

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

  /**
   * Electron-level zoom (a.k.a. UI scale). Scales every pixel in the renderer
   * uniformly. Historical name `fontScale` is kept for API stability.
   */
  fontScale: number;
  setFontScale: (scale: number) => Promise<void>;

  /**
   * Chat content font scale. Multiplies font-size of message text, markdown,
   * and the sendbox input only — does not change UI chrome dimensions.
   */
  chatFontScale: number;
  setChatFontScale: (scale: number) => Promise<void>;
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
  const [chatFontScale, setChatFontScale] = useChatFontScale();

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        colorScheme,
        setColorScheme,
        fontScale,
        setFontScale,
        chatFontScale,
        setChatFontScale,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
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
