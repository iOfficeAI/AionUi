/**
 * 主题包管理系统 - 导入导出功能
 */

export interface ThemePackageManifest {
  name: string;
  id: string;
  version: string;
  author?: string;
  description?: string;
  mode: 'light' | 'dark';
  baseTheme?: string;
  variables: Record<string, string>;
  modules: {
    components?: string[];
    layouts?: string[];
    overrides?: boolean;
  };
  unocss?: {
    safelist?: string[];
    shortcuts?: Record<string, string>;
  };
}

export interface ThemePackageFile {
  manifest: ThemePackageManifest;
  styles: {
    variables?: string;
    components?: Record<string, string>;
    layouts?: Record<string, string>;
    overrides?: string;
  };
}

export class ThemePackageManager {
  private static readonly STORAGE_KEY = 'aion-installed-themes';
  private static instance: ThemePackageManager;

  public static getInstance(): ThemePackageManager {
    if (!ThemePackageManager.instance) {
      ThemePackageManager.instance = new ThemePackageManager();
    }
    return ThemePackageManager.instance;
  }

  /**
   * 获取已安装的主题包列表
   */
  static async getInstalledThemes(): Promise<ThemePackageFile[]> {
    try {
      const installed = localStorage.getItem(this.STORAGE_KEY);
      return installed ? JSON.parse(installed) : [];
    } catch (error) {
      console.error('Failed to get installed themes:', error);
      return [];
    }
  }

  /**
   * 安装主题包
   */
  static installThemePackage(themePackage: ThemePackageFile): boolean {
    try {
      // 内置主题ID列表，这些主题不能被覆盖
      const builtinThemeIds = ['default-light-modernized', 'idea-dark-modernized'];

      // 检查是否尝试覆盖内置主题
      if (builtinThemeIds.includes(themePackage.manifest.id)) {
        console.warn(`Cannot install theme with builtin ID: ${themePackage.manifest.id}`);
        return false;
      }

      const installed = this.getInstalledThemesSync();

      // 检查是否已安装
      const existingIndex = installed.findIndex((theme) => theme.manifest.id === themePackage.manifest.id);

      if (existingIndex >= 0) {
        // 更新现有主题
        installed[existingIndex] = themePackage;
      } else {
        // 添加新主题
        installed.push(themePackage);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(installed));
      return true;
    } catch (error) {
      console.error('Failed to install theme package:', error);
      return false;
    }
  }

  /**
   * 卸载主题
   */
  static uninstallTheme(themeId: string): void {
    try {
      const installed = this.getInstalledThemesSync();
      const filtered = installed.filter((theme) => theme.manifest.id !== themeId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to uninstall theme:', error);
    }
  }

  /**
   * 导出主题包
   */
  static exportThemePackage(themePackage: ThemePackageFile): void {
    try {
      const jsonContent = JSON.stringify(themePackage, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${themePackage.manifest.name.replace(/\\s+/g, '-')}-theme-package.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export theme package:', error);
    }
  }

  /**
   * 应用主题包到当前页面
   */
  static applyThemePackage(themePackage: ThemePackageFile): void {
    try {
      // 移除之前的主题样式
      const existingStyle = document.getElementById('theme-package-styles');
      if (existingStyle) {
        existingStyle.remove();
      }

      // 创建新的样式元素
      const styleElement = document.createElement('style');
      styleElement.id = 'theme-package-styles';

      let cssContent = '';

      // 添加变量样式
      if (themePackage.styles.variables) {
        cssContent += themePackage.styles.variables + '\\n';
      }

      // 添加组件样式
      if (themePackage.styles.components) {
        Object.values(themePackage.styles.components).forEach((css) => {
          cssContent += css + '\\n';
        });
      }

      // 添加布局样式
      if (themePackage.styles.layouts) {
        Object.values(themePackage.styles.layouts).forEach((css) => {
          cssContent += css + '\\n';
        });
      }

      // 添加覆盖样式
      if (themePackage.styles.overrides) {
        cssContent += themePackage.styles.overrides + '\\n';
      }

      styleElement.textContent = cssContent;
      document.head.appendChild(styleElement);
    } catch (error) {
      console.error('Failed to apply theme package:', error);
    }
  }

  /**
   * 同步获取已安装的主题包
   */
  private static getInstalledThemesSync(): ThemePackageFile[] {
    try {
      const installed = localStorage.getItem(this.STORAGE_KEY);
      return installed ? JSON.parse(installed) : [];
    } catch (error) {
      console.error('Failed to get installed themes:', error);
      return [];
    }
  }

  /**
   * 导出当前主题为主题包
   */
  async exportThemePackage(themeId: string, packageName: string): Promise<string> {
    try {
      // 获取当前主题配置
      const currentTheme = await this.getCurrentThemeConfig(themeId);

      // 生成主题包数据
      const themePackage: ThemePackageFile = {
        manifest: {
          name: packageName,
          id: `${packageName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          version: '1.0.0',
          author: 'AionUI User',
          description: `Exported theme package: ${packageName}`,
          mode: currentTheme.mode,
          variables: currentTheme.colors,
          modules: {
            components: ['button', 'form', 'dropdown', 'modal'],
            layouts: ['sidebar', 'main'],
            overrides: true,
          },
        },
        styles: {
          variables: await this.generateVariablesCSS(currentTheme.colors),
          components: await this.generateComponentsCSS(),
          overrides: await this.generateOverridesCSS(),
        },
      };

      // 转换为JSON字符串
      return JSON.stringify(themePackage, null, 2);
    } catch (error) {
      console.error('Failed to export theme package:', error);
      throw error;
    }
  }

  /**
   * 导入主题包
   */
  async importThemePackage(packageData: string): Promise<boolean> {
    try {
      const themePackage: ThemePackageFile = JSON.parse(packageData);

      // 验证主题包格式
      this.validateThemePackage(themePackage);

      // 应用主题包
      await this.applyThemePackage(themePackage);

      return true;
    } catch (error) {
      console.error('Failed to import theme package:', error);
      throw error;
    }
  }

  /**
   * 验证主题包格式
   */
  private validateThemePackage(themePackage: ThemePackageFile): void {
    const { manifest, styles } = themePackage;

    if (!manifest || !manifest.name || !manifest.id || !manifest.variables) {
      throw new Error('Invalid theme package format');
    }

    if (!styles || !styles.variables) {
      throw new Error('Theme package missing required styles');
    }
  }

  /**
   * 应用主题包
   */
  private async applyThemePackage(themePackage: ThemePackageFile): Promise<void> {
    const { manifest, styles } = themePackage;

    // 动态创建CSS样式
    const styleId = `theme-package-${manifest.id}`;
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;

    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    // 组合所有CSS
    let css = '';

    // 添加CSS变量
    if (styles.variables) {
      css += styles.variables + '\n';
    }

    // 添加组件样式
    if (styles.components) {
      Object.values(styles.components).forEach((componentCSS) => {
        css += componentCSS + '\n';
      });
    }

    // 添加覆盖样式
    if (styles.overrides) {
      css += styles.overrides + '\n';
    }

    // 应用样式
    styleElement.textContent = css;

    // 设置主题属性
    document.documentElement.setAttribute('data-theme-id', manifest.id);
    document.documentElement.setAttribute('data-theme-mode', manifest.mode);
  }

  /**
   * 生成CSS变量样式
   */
  private async generateVariablesCSS(variables: Record<string, string>): Promise<string> {
    let css = ':root[data-theme-id="THEME_ID"] {\n';

    Object.entries(variables).forEach(([key, value]) => {
      const cssVarName = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      css += `  ${cssVarName}: ${value};\n`;
    });

    css += '}\n';
    return css;
  }

  /**
   * 生成组件CSS样式
   */
  private async generateComponentsCSS(): Promise<Record<string, string>> {
    // 这里可以读取已有的组件CSS模块
    return {
      button: await this.loadCSSModule('components/button.css'),
      form: await this.loadCSSModule('components/form.css'),
      dropdown: await this.loadCSSModule('components/dropdown.css'),
      modal: await this.loadCSSModule('components/modal.css'),
    };
  }

  /**
   * 生成覆盖样式
   */
  private async generateOverridesCSS(): Promise<string> {
    // 生成针对第三方库的覆盖样式
    return `
/* Arco Design 组件覆盖 */
[data-theme-id="THEME_ID"] .arco-btn {
  border-radius: var(--theme-button-radius);
}

[data-theme-id="THEME_ID"] .arco-input {
  background-color: var(--theme-surface);
  border-color: var(--theme-border);
  color: var(--theme-text-primary);
}
    `.trim();
  }

  /**
   * 加载CSS模块
   */
  private async loadCSSModule(modulePath: string): Promise<string> {
    try {
      // 在实际实现中，这里应该从文件系统加载CSS模块
      // 现在返回示例CSS
      return `/* ${modulePath} */\n/* CSS content would be loaded here */`;
    } catch (error) {
      console.warn(`Failed to load CSS module: ${modulePath}`, error);
      return '';
    }
  }

  /**
   * 获取当前主题配置
   */
  private async getCurrentThemeConfig(themeId: string): Promise<any> {
    // 这里应该从主题系统获取当前主题配置
    // 现在返回示例配置
    return {
      id: themeId,
      mode: 'light',
      colors: {
        primary: '#1677ff',
        background: '#ffffff',
        surface: '#ffffff',
        textPrimary: '#1f2937',
        border: '#e5e7eb',
      },
    };
  }

  /**
   * 列出已安装的主题包
   */
  async getInstalledThemePackages(): Promise<ThemePackageManifest[]> {
    // 从localStorage或其他存储获取已安装的主题包列表
    const packages = localStorage.getItem('aion-theme-packages');
    return packages ? JSON.parse(packages) : [];
  }

  /**
   * 保存主题包到本地存储
   */
  async saveThemePackage(themePackage: ThemePackageFile): Promise<void> {
    const packages = await this.getInstalledThemePackages();
    const existingIndex = packages.findIndex((p) => p.id === themePackage.manifest.id);

    if (existingIndex >= 0) {
      packages[existingIndex] = themePackage.manifest;
    } else {
      packages.push(themePackage.manifest);
    }

    localStorage.setItem('aion-theme-packages', JSON.stringify(packages));
    localStorage.setItem(`aion-theme-package-${themePackage.manifest.id}`, JSON.stringify(themePackage));
  }

  /**
   * 删除主题包
   */
  async removeThemePackage(themeId: string): Promise<void> {
    const packages = await this.getInstalledThemePackages();
    const filteredPackages = packages.filter((p) => p.id !== themeId);

    localStorage.setItem('aion-theme-packages', JSON.stringify(filteredPackages));
    localStorage.removeItem(`aion-theme-package-${themeId}`);

    // 移除样式元素
    const styleElement = document.getElementById(`theme-package-${themeId}`);
    if (styleElement) {
      styleElement.remove();
    }
  }
}
