/**
 * 主题适配器 - 统一新旧主题格式的访问
 */

import type { ThemePackageFile } from './themePackage';

export interface ThemeAdapter {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  colors: Record<string, string>;
  textColorMap?: Record<string, string>;
  iconColorMap?: Record<string, string>;
}

/**
 * 将主题包转换为统一的主题适配器格式
 */
export function createThemeAdapter(themePackage: ThemePackageFile): ThemeAdapter {
  return {
    id: themePackage.manifest.id,
    name: themePackage.manifest.name,
    mode: themePackage.manifest.mode,
    colors: themePackage.manifest.variables,
    textColorMap: {},
    iconColorMap: {},
  };
}

/**
 * 获取主题颜色
 */
export function getThemeColor(adapter: ThemeAdapter, colorKey: string): string {
  return adapter.colors[colorKey] || adapter.colors.textPrimary || '#000000';
}

/**
 * 获取文本颜色（支持i18n映射）
 */
export function getTextColor(adapter: ThemeAdapter, i18nKey: string, fallbackColorKey?: string): string {
  // 优先使用textColorMap中配置的颜色
  if (adapter.textColorMap && adapter.textColorMap[i18nKey]) {
    return adapter.textColorMap[i18nKey];
  }

  // 使用fallback颜色
  if (fallbackColorKey && adapter.colors[fallbackColorKey]) {
    return adapter.colors[fallbackColorKey];
  }

  // 最后使用默认的主要文字颜色
  return adapter.colors.textPrimary || '#000000';
}

/**
 * 获取图标颜色（支持i18n映射）
 */
export function getIconColor(adapter: ThemeAdapter, i18nKeyOrLevel: string, fallback?: 'primary' | 'secondary'): string {
  // 如果第一个参数是 'primary' 或 'secondary'，则直接返回对应的默认图标颜色
  if (i18nKeyOrLevel === 'primary') {
    return adapter.colors.iconPrimary || adapter.colors.textSecondary || '#666666';
  }
  if (i18nKeyOrLevel === 'secondary') {
    return adapter.colors.iconSecondary || adapter.colors.textTertiary || '#999999';
  }

  // 否则作为 i18n key 处理，优先使用 iconColorMap 中配置的颜色
  if (adapter.iconColorMap && adapter.iconColorMap[i18nKeyOrLevel]) {
    return adapter.iconColorMap[i18nKeyOrLevel];
  }

  // 如果没有配置特定颜色，使用 fallback 颜色
  if (fallback) {
    return fallback === 'primary' ? adapter.colors.iconPrimary || adapter.colors.textSecondary || '#666666' : adapter.colors.iconSecondary || adapter.colors.textTertiary || '#999999';
  }

  // 最后使用默认的主要图标颜色
  return adapter.colors.iconPrimary || adapter.colors.textSecondary || '#666666';
}
