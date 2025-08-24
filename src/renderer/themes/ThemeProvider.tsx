/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Theme, ThemeMode } from './index';
import { themeConfig, defaultLightTheme, ideaDarkTheme } from './index';
import { loadExternalThemes } from './external';
import { ConfigStorage } from '@/common/storage';

interface ThemeContextType {
  currentTheme: Theme;
  themeMode: ThemeMode;
  isAutoMode: boolean;
  systemTheme: 'light' | 'dark';
  availableThemes: Theme[];
  externalThemesCount: number; // 外部主题数量
  setTheme: (themeId: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleAutoMode: () => void;
  refreshExternalThemes: () => Promise<void>; // 添加动态刷新外部主题的方法
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [currentThemeId, setCurrentThemeId] = useState<string>(themeConfig.currentTheme);
  const [isAutoMode, setIsAutoMode] = useState<boolean>(themeConfig.autoMode);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [preferredLightTheme, setPreferredLightTheme] = useState<string>('default-light');
  const [preferredDarkTheme, setPreferredDarkTheme] = useState<string>('idea-dark');
  const [externalThemes, setExternalThemes] = useState<Theme[]>([]);
  const [allThemes, setAllThemes] = useState<Record<string, Theme>>(themeConfig.themes);
  const [isThemeSettingsLoaded, setIsThemeSettingsLoaded] = useState<boolean>(false); // 添加加载状态

  // Get available themes (built-in + external)
  const availableThemes = Object.values(allThemes);

  // Get current theme object
  const getCurrentTheme = (): Theme => {
    if (isAutoMode) {
      const themeId = systemTheme === 'dark' ? preferredDarkTheme : preferredLightTheme;
      return allThemes[themeId] || (systemTheme === 'dark' ? ideaDarkTheme : defaultLightTheme);
    }
    return allThemes[currentThemeId] || defaultLightTheme;
  };

  const currentTheme = getCurrentTheme();

  // Load external themes from custom directory
  const loadCustomThemes = async () => {
    try {
      const config = await ConfigStorage.get('theme.config');

      if (config?.customThemeDir) {
        const customThemes = await loadExternalThemes(config.customThemeDir);
        setExternalThemes(customThemes);

        // Merge built-in and external themes
        const mergedThemes = { ...themeConfig.themes };
        customThemes.forEach((theme) => {
          mergedThemes[theme.id] = theme;
        });
        setAllThemes(mergedThemes);
      } else {
        // 如果没有设置自定义主题目录，只使用内置主题
        setExternalThemes([]);
        setAllThemes(themeConfig.themes);
      }
    } catch (error) {
      console.warn('Failed to load external themes:', error);
    }
  };

  // 动态刷新外部主题的方法，可以被外部调用
  const refreshExternalThemes = async () => {
    await loadCustomThemes();
  };

  // Detect system theme
  const detectSystemTheme = () => {
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
      return mediaQuery.matches ? 'dark' : 'light';
    } catch (error) {
      console.warn('Failed to detect system theme:', error);
      return 'light';
    }
  };

  // Load theme settings from storage
  const loadThemeSettings = async () => {
    try {
      const settings = await ConfigStorage.get('theme.settings');

      if (settings) {
        setCurrentThemeId(settings.currentTheme || themeConfig.currentTheme);
        setIsAutoMode(settings.autoMode ?? themeConfig.autoMode);

        // 设置偏好主题，优先使用保存的值，否则使用配置默认值
        const lightTheme = settings.preferredLightTheme || themeConfig.preferredLightTheme || 'default-light';
        const darkTheme = settings.preferredDarkTheme || themeConfig.preferredDarkTheme || 'idea-dark';
        setPreferredLightTheme(lightTheme);
        setPreferredDarkTheme(darkTheme);

        // 恢复主题模式
        if (settings.themeMode) {
          setThemeModeState(settings.themeMode);
          // 如果是自动模式，需要根据系统主题设置正确的主题ID
          if (settings.themeMode === 'auto' || settings.autoMode) {
            // 获取当前系统主题
            const currentSystemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            const themeId = currentSystemTheme === 'dark' ? settings.preferredDarkTheme || 'idea-dark' : settings.preferredLightTheme || 'default-light';
            setCurrentThemeId(themeId);
          } else if (settings.themeMode === 'filter-dark') {
            // 滤镜暗黑模式使用亮色主题作为基础
            setCurrentThemeId(settings.preferredLightTheme || 'default-light');
          }
        } else if (settings.autoMode) {
          setThemeModeState('auto');
          // 自动模式下根据系统主题设置主题ID
          const currentSystemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          const themeId = currentSystemTheme === 'dark' ? settings.preferredDarkTheme || 'idea-dark' : settings.preferredLightTheme || 'default-light';
          setCurrentThemeId(themeId);
        }
      } else {
        // 没有保存的设置时，使用配置文件的默认值
        setPreferredLightTheme(themeConfig.preferredLightTheme || 'default-light');
        setPreferredDarkTheme(themeConfig.preferredDarkTheme || 'idea-dark');
      }

      // 标记主题设置已加载完成
      setIsThemeSettingsLoaded(true);
    } catch (error) {
      console.error('Failed to load theme settings:', error);
      setIsThemeSettingsLoaded(true); // 即使失败也要标记为已完成
    }
  };

  // Save theme settings to storage
  const saveThemeSettings = async () => {
    // 只有在主题设置加载完成后才保存，避免保存默认值
    if (!isThemeSettingsLoaded) {
      return;
    }

    try {
      const settings = {
        currentTheme: currentThemeId,
        autoMode: isAutoMode,
        themeMode,
        preferredLightTheme,
        preferredDarkTheme,
      };
      await ConfigStorage.set('theme.settings', settings);
    } catch (error) {
      console.warn('Failed to save theme settings:', error);
    }
  };

  // Apply CSS variables to document root
  const applyCSSVariables = (theme: Theme) => {
    const root = document.documentElement;
    const { colors } = theme;

    // Apply all theme colors as CSS custom properties
    Object.entries(colors).forEach(([key, value]) => {
      const cssVarName = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVarName, value);
    });

    // Set theme mode data attribute for conditional styling
    root.setAttribute('data-theme-mode', theme.mode);
    root.setAttribute('data-theme-id', theme.id);

    // Handle filter-dark mode
    if (themeMode === 'filter-dark') {
      root.setAttribute('data-theme', 'filter-dark');
      root.classList.remove('arco-theme-light', 'arco-theme-dark');
      root.classList.add('arco-theme-light'); // Use light theme as base for filter
    } else {
      root.removeAttribute('data-theme');
      // Add/remove theme CSS classes
      root.classList.remove('arco-theme-light', 'arco-theme-dark');
      root.classList.add(`arco-theme-${theme.mode}`);
    }
  };

  // Set theme
  const setTheme = (themeId: string) => {
    const selectedTheme = allThemes[themeId];
    if (!selectedTheme) return;

    setCurrentThemeId(themeId);

    // 根据选择的主题类型，保存为对应模式的偏好主题
    if (selectedTheme.mode === 'dark') {
      setPreferredDarkTheme(themeId);
    } else {
      setPreferredLightTheme(themeId);
    }

    // 如果不在自动模式，则关闭自动模式
    if (!isAutoMode) {
      setIsAutoMode(false);
    }
  };

  // Set theme mode
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    if (mode === 'auto') {
      setIsAutoMode(true);
      // 在自动模式下，根据系统主题使用对应的偏好主题
      const themeId = systemTheme === 'dark' ? preferredDarkTheme : preferredLightTheme;
      setCurrentThemeId(themeId);
    } else if (mode === 'filter-dark') {
      setIsAutoMode(false);
      // 滤镜暗黑模式使用默认亮色主题作为基础
      setCurrentThemeId(preferredLightTheme);
    } else {
      setIsAutoMode(false);
      // 根据选择的模式使用对应的偏好主题
      const themeId = mode === 'dark' ? preferredDarkTheme : preferredLightTheme;
      setCurrentThemeId(themeId);
    }
  };

  // Toggle auto mode
  const toggleAutoMode = () => {
    setIsAutoMode(!isAutoMode);
  };

  // Initialize theme system
  useEffect(() => {
    const initializeThemes = async () => {
      // 首先检测系统主题
      detectSystemTheme();
      await loadCustomThemes();
      await loadThemeSettings();
    };

    initializeThemes();

    // Listen for system theme changes
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setSystemTheme(e.matches ? 'dark' : 'light');
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      }
    } catch (error) {
      console.warn('Failed to setup system theme listener:', error);
    }
  }, []);

  // Apply theme changes
  useEffect(() => {
    applyCSSVariables(currentTheme);
    saveThemeSettings();
  }, [currentTheme, isAutoMode, currentThemeId, preferredLightTheme, preferredDarkTheme, themeMode]);

  // Update theme mode state separately to avoid circular dependency
  useEffect(() => {
    if (isAutoMode) {
      if (themeMode !== 'auto') {
        setThemeModeState('auto');
      }
    } else if (themeMode === 'filter-dark') {
      // Keep filter-dark mode - no need to set again
    } else {
      if (themeMode !== currentTheme.mode) {
        setThemeModeState(currentTheme.mode);
      }
    }
  }, [isAutoMode, currentTheme.mode]);

  // Update theme when system theme changes in auto mode
  useEffect(() => {
    if (isAutoMode) {
      // Trigger re-render to use the correct theme
      setCurrentThemeId((prev) => prev);
    }
  }, [systemTheme, isAutoMode]);

  const contextValue: ThemeContextType = {
    currentTheme,
    themeMode,
    isAutoMode,
    systemTheme,
    availableThemes,
    externalThemesCount: externalThemes.length,
    setTheme,
    setThemeMode,
    toggleAutoMode,
    refreshExternalThemes,
  };

  return React.createElement(ThemeContext.Provider, { value: contextValue }, children);
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
