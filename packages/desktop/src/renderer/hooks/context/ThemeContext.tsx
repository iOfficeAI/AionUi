/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// context/ThemeContext.tsx - Unified Theme Management Context 统一主题管理上下文
import type { PropsWithChildren } from 'react';
import React, { createContext, useCallback, useContext } from 'react';
import type { Theme, ThemeAppearance } from '@/common/theme/types';
import useTheme from '@renderer/hooks/system/useTheme';
import { LIGHT_THEME_ID, DARK_THEME_ID } from '@/common/theme/constants';
import useFontScale from '@renderer/hooks/ui/useFontScale';
import useFontSizes from '@renderer/hooks/ui/useFontSizes';
import type { FontSizeKey, FontSizes } from '@/common/config/fontSizes';

interface ThemeContextValue {
  // Light/Dark appearance of the active theme (back-compat for existing consumers)
  theme: ThemeAppearance;
  // Back-compat light/dark toggle → selects the Light or Dark built-in theme
  setTheme: (appearance: ThemeAppearance) => Promise<void>;
  // The full unified active theme + selector by id (used by the new gallery)
  activeTheme: Theme | null;
  // Raw selected id from config — may be the `system` sentinel (gallery check mark uses this)
  activeId: string | null;
  selectTheme: (id: string) => Promise<void>;
  // Font scaling (unchanged)
  fontScale: number;
  setFontScale: (scale: number) => Promise<void>;
  // Per-region font sizes (px)
  fontSizes: FontSizes;
  setFontSize: (key: FontSizeKey, px: number) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [activeTheme, selectTheme, activeId] = useTheme();
  const [fontScale, setFontScale] = useFontScale();
  const { fontSizes, setFontSize } = useFontSizes();
  const theme: ThemeAppearance = activeTheme?.appearance ?? 'light';
  const setTheme = useCallback(
    (appearance: ThemeAppearance) => selectTheme(appearance === 'dark' ? DARK_THEME_ID : LIGHT_THEME_ID),
    [selectTheme]
  );

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, activeTheme, activeId, selectTheme, fontScale, setFontScale, fontSizes, setFontSize }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
};
