/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// hooks/useColorScheme.ts - Color Scheme Management Hook 配色方案管理
import { ConfigStorage } from '@/common/storage';
import { useCallback, useEffect, useState } from 'react';

// Supported color schemes 支持的配色方案类型
export type ColorScheme = 'default';

const DEFAULT_COLOR_SCHEME: ColorScheme = 'default';

/**
 * Initialize color scheme immediately when module loads
 * 在模块加载时立即初始化配色方案，避免页面闪烁
 */
const initColorScheme = async () => {
  try {
    const scheme = (await ConfigStorage.get('colorScheme')) as ColorScheme;
    const initialScheme = scheme || DEFAULT_COLOR_SCHEME;
    document.documentElement.setAttribute('data-color-scheme', initialScheme);
    return initialScheme;
  } catch (error) {
    console.error('Failed to load initial color scheme:', error);
    document.documentElement.setAttribute('data-color-scheme', DEFAULT_COLOR_SCHEME);
    return DEFAULT_COLOR_SCHEME;
  }
};

// Run color scheme initialization immediately 立即运行配色方案初始化
let initialColorSchemePromise: Promise<ColorScheme> | null = null;
if (typeof window !== 'undefined') {
  initialColorSchemePromise = initColorScheme();
}

/**
 * Color scheme management hook 配色方案管理 Hook
 * @returns [colorScheme, setColorScheme] - Current color scheme and setter function 当前配色方案和设置函数
 */
const useColorScheme = (): [ColorScheme, (scheme: ColorScheme) => Promise<void>] => {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(DEFAULT_COLOR_SCHEME);

  /**
   * Apply color scheme to DOM 应用配色方案到 DOM
   * Switch CSS variables by setting data-color-scheme attribute 通过设置 data-color-scheme 属性切换 CSS 变量
   */
  const applyColorScheme = useCallback((newScheme: ColorScheme) => {
    document.documentElement.setAttribute('data-color-scheme', newScheme);
  }, []);

  /**
   * Set color scheme with persistence 设置配色方案并持久化
   * Updates state, DOM attribute and local storage 同时更新状态、DOM 属性和本地存储
   */
  const setColorScheme = useCallback(
    async (newScheme: ColorScheme) => {
      try {
        setColorSchemeState(newScheme);
        applyColorScheme(newScheme);
        await ConfigStorage.set('colorScheme', newScheme);
      } catch (error) {
        console.error('Failed to save color scheme:', error);
        // Revert on error 保存失败时回滚
        setColorSchemeState(colorScheme);
        applyColorScheme(colorScheme);
      }
    },
    [colorScheme, applyColorScheme]
  );

  /**
   * Initialize color scheme state from early initialization
   * 从早期初始化中读取配色方案状态，确保组件挂载时获取正确的值
   */
  useEffect(() => {
    if (initialColorSchemePromise) {
      initialColorSchemePromise
        .then((initialScheme) => {
          setColorSchemeState(initialScheme);
        })
        .catch((error) => {
          console.error('Failed to initialize color scheme:', error);
        });
    }
  }, []);

  return [colorScheme, setColorScheme];
};

export default useColorScheme;
