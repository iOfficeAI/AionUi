/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme, ThemeColors } from './types';
import { ipcBridge } from '@/common';

/**
 * 外部主题文件的JSON格式规范
 *
 * 文件命名：{themeName}.json
 * 文件位置：用户指定的主题目录
 *
 * JSON结构：
 * {
 *   "id": "custom-theme-1",           // 唯一标识符
 *   "name": "Custom Theme Name",      // 显示名称
 *   "mode": "light" | "dark",         // 主题模式
 *   "colors": {                       // 颜色配置
 *     "primary": "#1890ff",
 *     "primaryHover": "#40a9ff",
 *     ...                             // 完整的ThemeColors接口
 *   },
 *   "textColorMap": {                 // 可选：文本颜色映射
 *     "custom.key": "#color"
 *   },
 *   "iconColorMap": {                 // 可选：图标颜色映射
 *     "custom.icon": "#color"
 *   }
 * }
 */

export interface ExternalThemeFile {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  colors: ThemeColors;
  textColorMap?: Record<string, string>;
  iconColorMap?: Record<string, string>;
}

/**
 * 验证外部主题文件格式
 */
export function validateExternalTheme(themeData: any): themeData is ExternalThemeFile {
  if (!themeData || typeof themeData !== 'object') {
    return false;
  }

  // 必需字段检查
  if (typeof themeData.id !== 'string' || !themeData.id.trim()) {
    return false;
  }

  if (typeof themeData.name !== 'string' || !themeData.name.trim()) {
    return false;
  }

  if (themeData.mode !== 'light' && themeData.mode !== 'dark') {
    return false;
  }

  if (!themeData.colors || typeof themeData.colors !== 'object') {
    return false;
  }

  // 必需的颜色字段检查
  const requiredColors: (keyof ThemeColors)[] = ['primary', 'primaryHover', 'primaryActive', 'background', 'backgroundSecondary', 'backgroundTertiary', 'surface', 'surfaceHover', 'surfaceSelected', 'textPrimary', 'textSecondary', 'textTertiary', 'textDisabled', 'border', 'borderHover', 'borderActive', 'success', 'warning', 'error', 'info', 'sidebarBackground', 'sidebarHover', 'logoBackground', 'logoForeground', 'searchHighlight', 'searchHighlightBackground', 'codeBlockTheme', 'iconPrimary', 'iconSecondary'];

  for (const colorKey of requiredColors) {
    if (typeof themeData.colors[colorKey] !== 'string') {
      return false;
    }
  }

  // 可选字段检查
  if (themeData.textColorMap && typeof themeData.textColorMap !== 'object') {
    return false;
  }

  if (themeData.iconColorMap && typeof themeData.iconColorMap !== 'object') {
    return false;
  }

  return true;
}

/**
 * 将外部主题文件转换为内部主题格式
 */
export function convertExternalTheme(externalTheme: ExternalThemeFile): Theme {
  return {
    id: externalTheme.id,
    name: externalTheme.name,
    mode: externalTheme.mode,
    colors: externalTheme.colors,
    textColorMap: externalTheme.textColorMap,
    iconColorMap: externalTheme.iconColorMap,
  };
}

/**
 * 从目录加载外部主题
 */
export async function loadExternalThemes(themeDir: string): Promise<Theme[]> {
  const themes: Theme[] = [];

  try {
    if (!themeDir) {
      return themes;
    }

    const files = await ipcBridge.fs.readDir.invoke({ dirPath: themeDir });

    for (const file of files) {
      if (!file.toLowerCase().endsWith('.json')) {
        continue;
      }

      try {
        const filePath = `${themeDir}/${file}`;
        const fileContent = await ipcBridge.fs.readFile.invoke({ filePath });
        const themeData = JSON.parse(fileContent);

        if (validateExternalTheme(themeData)) {
          const theme = convertExternalTheme(themeData);
          // 添加前缀以避免与内置主题冲突
          theme.id = `external-${theme.id}`;
          themes.push(theme);
        } else {
          console.warn(`Invalid theme file format: ${file}`);
        }
      } catch (error) {
        console.error(`Failed to load theme file ${file}:`, error);
      }
    }
  } catch (error) {
    console.error(`Failed to read theme directory ${themeDir}:`, error);
  }

  return themes;
}

/**
 * 创建外部主题文件示例
 */
export function createExampleThemeFile(): ExternalThemeFile {
  return {
    id: 'custom-blue-theme',
    name: 'Custom Blue Theme',
    mode: 'light',
    colors: {
      primary: '#1890ff',
      primaryHover: '#40a9ff',
      primaryActive: '#096dd9',
      background: '#ffffff',
      backgroundSecondary: '#fafafa',
      backgroundTertiary: '#f5f5f5',
      surface: '#ffffff',
      surfaceHover: '#f5f5f5',
      surfaceSelected: '#e6f7ff',
      textPrimary: '#262626',
      textSecondary: '#595959',
      textTertiary: '#8c8c8c',
      textDisabled: '#bfbfbf',
      border: '#d9d9d9',
      borderHover: '#40a9ff',
      borderActive: '#1890ff',
      success: '#52c41a',
      warning: '#faad14',
      error: '#ff4d4f',
      info: '#1890ff',
      sidebarBackground: '#001529',
      sidebarHover: '#1c2433',
      logoBackground: '#1890ff',
      logoForeground: '#ffffff',
      searchHighlight: '#ffe58f',
      searchHighlightBackground: '#fff2d6',
      codeBlockTheme: 'github',
      iconPrimary: '#595959',
      iconSecondary: '#8c8c8c',
    },
    textColorMap: {
      'settings.custom': '#1890ff',
    },
    iconColorMap: {
      'settings.customIcon': '#1890ff',
    },
  };
}
