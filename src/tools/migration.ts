/**
 * 主题迁移工具 - 将旧主题转换为新的主题包格式
 */

import type { Theme } from './types';
import type { ThemePackageFile, ThemePackageManifest } from './themePackage';

export class ThemeMigrationTool {
  /**
   * 将旧的主题对象转换为新的主题包格式
   */
  static convertToThemePackage(oldTheme: Theme, version = '2.0.0'): ThemePackageFile {
    const manifest: ThemePackageManifest = {
      name: oldTheme.name,
      id: `${oldTheme.id}-modernized`,
      version,
      author: 'AionUI Official',
      description: `升级版${oldTheme.name}主题 - 现代化主题包格式`,
      mode: oldTheme.mode,
      baseTheme: oldTheme.id,
      variables: oldTheme.colors as unknown as Record<string, string>,
      modules: {
        components: ['button', 'form', 'dropdown', 'modal'],
        layouts: ['sidebar', 'main'],
        overrides: true,
      },
      unocss: {
        safelist: ['bg-theme-primary', 'bg-theme-surface', 'bg-theme-background', 'text-theme-text-primary', 'btn-primary', 'card-base', 'sidebar-base'],
        shortcuts: this.generateShortcuts(oldTheme.id),
      },
    };

    const styles = {
      variables: this.generateVariablesCSS(oldTheme.colors as unknown as Record<string, string>, manifest.id),
      components: this.generateComponentsCSS(manifest.id),
      layouts: this.generateLayoutsCSS(manifest.id),
      overrides: this.generateOverridesCSS(manifest.id, oldTheme.name),
    };

    return { manifest, styles };
  }

  /**
   * 生成CSS变量样式
   */
  private static generateVariablesCSS(colors: Record<string, string>, themeId: string): string {
    let css = `:root[data-theme-id="${themeId}"] {\n  /* ${themeId} 主题变量 */\n`;

    Object.entries(colors).forEach(([key, value]) => {
      const cssVarName = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      css += `  ${cssVarName}: ${value};\n`;
    });

    // 添加语义化变量
    css += `  
  /* 语义化变量 */
  --theme-text-on-primary: var(--theme-logo-foreground);
  --theme-surface-primary: var(--theme-surface);
  --theme-surface-secondary: var(--theme-surface-hover);
  
  /* 组件特定变量 */
  --theme-button-radius: 6px;
  --theme-input-radius: 6px;
  --theme-card-radius: 8px;
  --theme-modal-radius: 8px;
  
  /* 间距变量 */
  --theme-spacing-xs: 4px;
  --theme-spacing-sm: 8px;
  --theme-spacing-md: 16px;
  --theme-spacing-lg: 24px;
  --theme-spacing-xl: 32px;
  
  /* 阴影变量 */
  --theme-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.${colors.background?.includes('#0') ? '3' : '05'});
  --theme-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.${colors.background?.includes('#0') ? '3' : '1'});
  --theme-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.${colors.background?.includes('#0') ? '3' : '1'});
`;

    css += '}';
    return css;
  }

  /**
   * 生成组件CSS样式
   */
  private static generateComponentsCSS(themeId: string): Record<string, string> {
    return {
      button: `[data-theme-id="${themeId}"] .aion-button {
  background-color: var(--theme-primary);
  color: var(--theme-text-on-primary);
  border: 1px solid var(--theme-primary);
  border-radius: var(--theme-button-radius);
  padding: var(--theme-spacing-sm) var(--theme-spacing-md);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

[data-theme-id="${themeId}"] .aion-button:hover {
  background-color: var(--theme-primary-hover);
  border-color: var(--theme-primary-hover);
}

[data-theme-id="${themeId}"] .aion-button--secondary {
  background-color: transparent;
  color: var(--theme-text-primary);
  border-color: var(--theme-border);
}

[data-theme-id="${themeId}"] .aion-button--secondary:hover {
  background-color: var(--theme-surface-hover);
  border-color: var(--theme-border-hover);
}`,

      form: `[data-theme-id="${themeId}"] .aion-input {
  background-color: var(--theme-surface);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-input-radius);
  color: var(--theme-text-primary);
  padding: var(--theme-spacing-sm);
  font-size: 14px;
  transition: all 0.2s ease;
}

[data-theme-id="${themeId}"] .aion-input:focus {
  outline: none;
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 2px rgba(var(--theme-primary-rgb, 100, 148, 237), 0.2);
}

[data-theme-id="${themeId}"] .aion-input::placeholder {
  color: var(--theme-text-tertiary);
}`,

      dropdown: `[data-theme-id="${themeId}"] .aion-dropdown {
  background-color: var(--theme-surface);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-input-radius);
  box-shadow: var(--theme-shadow-lg);
  padding: var(--theme-spacing-xs) 0;
  min-width: 160px;
}

[data-theme-id="${themeId}"] .aion-dropdown-item {
  padding: var(--theme-spacing-sm) var(--theme-spacing-md);
  color: var(--theme-text-primary);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

[data-theme-id="${themeId}"] .aion-dropdown-item:hover {
  background-color: var(--theme-surface-hover);
}`,

      modal: `[data-theme-id="${themeId}"] .aion-modal {
  background-color: var(--theme-surface);
  border-radius: var(--theme-modal-radius);
  box-shadow: var(--theme-shadow-lg);
  border: 1px solid var(--theme-border);
  max-width: 600px;
  width: 90vw;
}

[data-theme-id="${themeId}"] .aion-modal-header {
  padding: var(--theme-spacing-lg);
  border-bottom: 1px solid var(--theme-border);
}

[data-theme-id="${themeId}"] .aion-modal-title {
  color: var(--theme-text-primary);
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

[data-theme-id="${themeId}"] .aion-modal-body {
  padding: var(--theme-spacing-lg);
  color: var(--theme-text-primary);
}`,
    };
  }

  /**
   * 生成布局CSS样式
   */
  private static generateLayoutsCSS(themeId: string): Record<string, string> {
    return {
      sidebar: `[data-theme-id="${themeId}"] .theme-sidebar {
  background-color: var(--theme-sidebar-background);
  border-right: 1px solid var(--theme-border);
  color: var(--theme-text-primary);
}

[data-theme-id="${themeId}"] .sidebar-item {
  padding: var(--theme-spacing-sm) var(--theme-spacing-md);
  color: var(--theme-text-primary);
  transition: background-color 0.2s ease;
  cursor: pointer;
}

[data-theme-id="${themeId}"] .sidebar-item:hover {
  background-color: var(--theme-sidebar-hover);
}

[data-theme-id="${themeId}"] .sidebar-item--active {
  background-color: var(--theme-surface-selected);
  color: var(--theme-primary);
}`,

      main: `[data-theme-id="${themeId}"] .theme-main-content {
  background-color: var(--theme-background);
  color: var(--theme-text-primary);
  min-height: 100vh;
  flex: 1;
}

[data-theme-id="${themeId}"] .theme-layout {
  background-color: var(--theme-background);
  color: var(--theme-text-primary);
  min-height: 100vh;
}`,
    };
  }

  /**
   * 生成第三方库覆盖样式
   */
  private static generateOverridesCSS(themeId: string, themeName: string): string {
    return `/* ${themeName} - Arco Design 组件覆盖 */
[data-theme-id="${themeId}"] .arco-btn {
  border-radius: var(--theme-button-radius);
  transition: all 0.2s ease;
}

[data-theme-id="${themeId}"] .arco-btn-primary {
  background-color: var(--theme-primary);
  border-color: var(--theme-primary);
  color: var(--theme-text-on-primary);
}

[data-theme-id="${themeId}"] .arco-btn-primary:hover {
  background-color: var(--theme-primary-hover);
  border-color: var(--theme-primary-hover);
}

[data-theme-id="${themeId}"] .arco-input {
  background-color: var(--theme-surface);
  border-color: var(--theme-border);
  color: var(--theme-text-primary);
  border-radius: var(--theme-input-radius);
}

[data-theme-id="${themeId}"] .arco-input:focus {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 2px rgba(var(--theme-primary-rgb, 100, 148, 237), 0.2);
}

[data-theme-id="${themeId}"] .arco-card {
  background-color: var(--theme-surface);
  border-color: var(--theme-border);
  color: var(--theme-text-primary);
  border-radius: var(--theme-card-radius);
}

[data-theme-id="${themeId}"] .arco-modal {
  background-color: var(--theme-surface);
  border-radius: var(--theme-modal-radius);
  box-shadow: var(--theme-shadow-lg);
}`;
  }

  /**
   * 生成UnoCSS快捷方式
   */
  private static generateShortcuts(themeId: string): Record<string, string> {
    return {
      [`btn-${themeId}-primary`]: 'bg-theme-primary text-theme-text-on-primary border border-theme-primary rounded-theme-button px-theme-spacing-md py-theme-spacing-sm transition-all duration-200 hover:bg-theme-primary-hover',
      [`card-${themeId}`]: 'bg-theme-surface border border-theme-border rounded-theme-card shadow-theme-sm',
      [`sidebar-${themeId}`]: 'bg-theme-sidebar-background border-r border-theme-border text-theme-text-primary',
    };
  }

  /**
   * 批量转换所有内置主题
   */
  static async convertAllBuiltinThemes(themes: Record<string, Theme>): Promise<ThemePackageFile[]> {
    const themePackages: ThemePackageFile[] = [];

    for (const theme of Object.values(themes)) {
      const themePackage = this.convertToThemePackage(theme);
      themePackages.push(themePackage);
    }

    return themePackages;
  }

  /**
   * 导出主题包为JSON文件
   */
  static exportThemePackageAsFile(themePackage: ThemePackageFile, filename?: string): void {
    const jsonContent = JSON.stringify(themePackage, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${themePackage.manifest.name.replace(/\s+/g, '-')}-theme-package.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
