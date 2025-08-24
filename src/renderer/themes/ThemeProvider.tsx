/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { ThemePackageManager, type ThemePackageFile } from './themePackage';
import { ConfigStorage } from '@/common/storage';
import type { ThemeMode } from './types';

interface ThemeContextType {
  currentTheme: ThemePackageFile | null;
  themeMode: ThemeMode;
  isAutoMode: boolean;
  systemTheme: 'light' | 'dark';
  availableThemes: ThemePackageFile[];
  setTheme: (themeId: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleAutoMode: () => void;
  refreshThemes: () => Promise<void>;
  installThemePackage: (themePackage: ThemePackageFile) => boolean;
  uninstallTheme: (themeId: string) => void;
  exportTheme: (themeId: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// 默认内置主题包列表
const BUILTIN_THEMES: ThemePackageFile[] = [
  {
    manifest: {
      name: 'Default Light',
      id: 'default-light-modernized',
      version: '2.0.0',
      author: 'AionUI Official',
      description: '默认浅色主题 - 清新简洁的设计风格',
      mode: 'light',
      baseTheme: 'default-light',
      variables: {
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
      },
      modules: {
        components: ['button', 'form', 'dropdown', 'modal'],
        layouts: ['sidebar', 'main'],
        overrides: true,
      },
      unocss: {
        safelist: ['bg-theme-primary', 'bg-theme-surface', 'bg-theme-background', 'text-theme-text-primary'],
        shortcuts: {},
      },
    },
    styles: {
      variables: '',
      components: {},
      layouts: {},
      overrides: '',
    },
  },
  {
    manifest: {
      name: 'IDEA Dark',
      id: 'idea-dark-modernized',
      version: '2.0.0',
      author: 'AionUI Official',
      description: 'IDEA风格暗色主题 - 专业开发者首选',
      mode: 'dark',
      baseTheme: 'idea-dark',
      variables: {
        primary: '#6494ED',
        primaryHover: '#5B85D6',
        primaryActive: '#4A75C2',
        background: '#1E1E1E',
        backgroundSecondary: '#252526',
        backgroundTertiary: '#2D2D30',
        surface: '#252526',
        surfaceHover: '#2D2D30',
        surfaceSelected: '#37373D',
        textPrimary: '#E8E8E8',
        textSecondary: '#C0C0C0',
        textTertiary: '#909090',
        textDisabled: '#606060',
        border: '#3E3E42',
        borderHover: '#464647',
        borderActive: '#6494ED',
        success: '#6A8759',
        warning: '#BBB529',
        error: '#BC3F3C',
        info: '#6897BB',
        sidebarBackground: '#1E1E1E',
        sidebarHover: '#2D2D30',
        logoBackground: '#6494ED',
        logoForeground: '#FFFFFF',
        searchHighlight: '#FFD700',
        searchHighlightBackground: '#3D3D00',
        codeBlockTheme: 'tomorrow-night',
        iconPrimary: '#B0B0B0',
        iconSecondary: '#808080',
      },
      modules: {
        components: ['button', 'form', 'dropdown', 'modal'],
        layouts: ['sidebar', 'main'],
        overrides: true,
      },
      unocss: {
        safelist: ['bg-theme-primary', 'bg-theme-surface', 'bg-theme-background', 'text-theme-text-primary'],
        shortcuts: {},
      },
    },
    styles: {
      variables: '',
      components: {},
      layouts: {},
      overrides: '',
    },
  },
];

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [currentThemeId, setCurrentThemeId] = useState<string>('default-light-modernized');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [isAutoMode, setIsAutoMode] = useState<boolean>(false);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');
  const [availableThemes, setAvailableThemes] = useState<ThemePackageFile[]>(BUILTIN_THEMES);
  const [preferredLightTheme, setPreferredLightTheme] = useState<string>('default-light-modernized');
  const [preferredDarkTheme, setPreferredDarkTheme] = useState<string>('idea-dark-modernized');
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // 获取当前主题
  const currentTheme = availableThemes.find((theme) => theme.manifest.id === currentThemeId) || availableThemes[0];

  // 检测系统主题
  const detectSystemTheme = () => {
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const isDark = mediaQuery.matches;
      setSystemTheme(isDark ? 'dark' : 'light');
      return isDark ? 'dark' : 'light';
    } catch (error) {
      console.warn('Failed to detect system theme:', error);
      return 'light';
    }
  };

  // 加载主题设置
  const loadThemeSettings = async () => {
    try {
      const settings = await ConfigStorage.get('theme.settings');
      if (settings) {
        setCurrentThemeId(settings.currentTheme || 'default-light-modernized');
        setIsAutoMode(settings.autoMode || false);
        setThemeModeState(settings.themeMode || 'light');
        setPreferredLightTheme(settings.preferredLightTheme || 'default-light-modernized');
        setPreferredDarkTheme(settings.preferredDarkTheme || 'idea-dark-modernized');
      }
    } catch (error) {
      console.error('Failed to load theme settings:', error);
    }
  };

  // 保存主题设置
  const saveThemeSettings = async () => {
    if (!isInitialized) return;

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

  // 加载已安装的主题包
  const loadInstalledThemes = async () => {
    try {
      const installedThemes = await ThemePackageManager.getInstalledThemes();

      // 内置主题ID列表，这些主题不能被替换
      const builtinThemeIds = new Set(BUILTIN_THEMES.map((theme) => theme.manifest.id));

      // 过滤掉与内置主题ID冲突的已安装主题
      const filteredInstalledThemes = installedThemes.filter((theme) => !builtinThemeIds.has(theme.manifest.id));

      // 合并内置主题和过滤后的已安装主题
      const allThemes = [...BUILTIN_THEMES, ...filteredInstalledThemes];
      setAvailableThemes(allThemes);
    } catch (error) {
      console.error('Failed to load installed themes:', error);
    }
  };

  // 应用CSS变量到文档根元素
  const applyCSSVariables = (theme: ThemePackageFile) => {
    const root = document.documentElement;
    const { variables } = theme.manifest;

    // 应用主题变量
    Object.entries(variables).forEach(([key, value]) => {
      const cssVarName = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVarName, value);
    });

    // 设置主题属性
    root.setAttribute('data-theme-mode', theme.manifest.mode);
    root.setAttribute('data-theme-id', theme.manifest.id);

    // 处理滤镜暗色模式
    if (themeMode === 'filter-dark') {
      root.setAttribute('data-theme', 'filter-dark');
      root.classList.remove('arco-theme-light', 'arco-theme-dark');
      root.classList.add('arco-theme-light');
    } else {
      root.removeAttribute('data-theme');
      root.classList.remove('arco-theme-light', 'arco-theme-dark');
      root.classList.add(`arco-theme-${theme.manifest.mode}`);
    }

    // 应用主题包样式
    ThemePackageManager.applyThemePackage(theme);
  };

  // 设置主题
  const setTheme = (themeId: string) => {
    const selectedTheme = availableThemes.find((theme) => theme.manifest.id === themeId);
    if (!selectedTheme) return;

    setCurrentThemeId(themeId);

    // 根据主题模式更新偏好设置
    if (selectedTheme.manifest.mode === 'dark') {
      setPreferredDarkTheme(themeId);
    } else {
      setPreferredLightTheme(themeId);
    }

    // 如果不在自动模式，则关闭自动模式
    if (!isAutoMode) {
      setIsAutoMode(false);
    }
  };

  // 设置主题模式
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    if (mode === 'auto') {
      setIsAutoMode(true);
      const themeId = systemTheme === 'dark' ? preferredDarkTheme : preferredLightTheme;
      setCurrentThemeId(themeId);
    } else if (mode === 'filter-dark') {
      setIsAutoMode(false);
      setCurrentThemeId(preferredLightTheme);
    } else {
      setIsAutoMode(false);
      const themeId = mode === 'dark' ? preferredDarkTheme : preferredLightTheme;
      setCurrentThemeId(themeId);
    }
  };

  // 切换自动模式
  const toggleAutoMode = () => {
    setIsAutoMode(!isAutoMode);
  };

  // 刷新主题列表
  const refreshThemes = async () => {
    await loadInstalledThemes();
  };

  // 安装主题包
  const installThemePackage = (themePackage: ThemePackageFile): boolean => {
    const success = ThemePackageManager.installThemePackage(themePackage);
    if (success) {
      refreshThemes();
    }
    return success;
  };

  // 卸载主题
  const uninstallTheme = (themeId: string) => {
    ThemePackageManager.uninstallTheme(themeId);
    refreshThemes();
  };

  // 导出主题
  const exportTheme = (themeId: string) => {
    const theme = availableThemes.find((t) => t.manifest.id === themeId);
    if (theme) {
      ThemePackageManager.exportThemePackage(theme);
    }
  };

  // 初始化主题系统
  useEffect(() => {
    const initializeThemes = async () => {
      detectSystemTheme();
      await loadInstalledThemes();
      await loadThemeSettings();
      setIsInitialized(true);
    };

    initializeThemes();

    // 监听系统主题变化
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

  // 应用主题变化
  useEffect(() => {
    if (currentTheme && isInitialized) {
      applyCSSVariables(currentTheme);
      saveThemeSettings();
    }
  }, [currentTheme, isAutoMode, currentThemeId, preferredLightTheme, preferredDarkTheme, themeMode, isInitialized]);

  // 自动模式下根据系统主题切换
  useEffect(() => {
    if (isAutoMode && isInitialized) {
      const themeId = systemTheme === 'dark' ? preferredDarkTheme : preferredLightTheme;
      setCurrentThemeId(themeId);
    }
  }, [systemTheme, isAutoMode, preferredDarkTheme, preferredLightTheme, isInitialized]);

  const contextValue: ThemeContextType = {
    currentTheme,
    themeMode,
    isAutoMode,
    systemTheme,
    availableThemes,
    setTheme,
    setThemeMode,
    toggleAutoMode,
    refreshThemes,
    installThemePackage,
    uninstallTheme,
    exportTheme,
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
