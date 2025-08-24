/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThemeMigrationTool } from './migration';
import type { Theme } from './types';
import type { ThemePackageFile } from './themePackage';

// 临时的内置主题定义（用于迁移工具）
const defaultLightTheme: Theme = {
  id: 'default-light',
  name: 'Default Light',
  mode: 'light',
  colors: {
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
};

const ideaDarkTheme: Theme = {
  id: 'idea-dark',
  name: 'IDEA Dark',
  mode: 'dark',
  colors: {
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
};

const darkGreenTheme: Theme = {
  id: 'dark-green',
  name: '墨绿深邃',
  mode: 'dark',
  colors: {
    primary: '#D4AF37',
    primaryHover: '#B8941F',
    primaryActive: '#9C7A12',
    background: '#0D1B0D',
    backgroundSecondary: '#132B13',
    backgroundTertiary: '#1A3B1A',
    surface: '#132B13',
    surfaceHover: '#1A3B1A',
    surfaceSelected: '#214B21',
    textPrimary: '#F0F8F0',
    textSecondary: '#D0E0D0',
    textTertiary: '#A0C0A0',
    textDisabled: '#708070',
    border: '#2D4B2D',
    borderHover: '#3D5B3D',
    borderActive: '#D4AF37',
    success: '#4CAF50',
    warning: '#FFA726',
    error: '#EF5350',
    info: '#42A5F5',
    sidebarBackground: '#0D1B0D',
    sidebarHover: '#1A3B1A',
    logoBackground: '#D4AF37',
    logoForeground: '#0D1B0D',
    searchHighlight: '#FFE4B5',
    searchHighlightBackground: '#2D4B2D',
    codeBlockTheme: 'atom-one-dark',
    iconPrimary: '#B8C8B8',
    iconSecondary: '#8B9B8B',
  },
};

/**
 * 一键批量主题迁移工具
 * 将所有内置旧主题迁移到新的主题包格式
 */
export class BatchThemeMigrationTool {
  /**
   * 获取所有内置主题
   */
  static getAllBuiltinThemes(): Record<string, Theme> {
    return {
      'default-light': defaultLightTheme,
      'idea-dark': ideaDarkTheme,
      'dark-green': darkGreenTheme,
    };
  }

  /**
   * 批量迁移所有内置主题
   */
  static async migrateAllThemes(): Promise<{
    themes: ThemePackageFile[];
    summary: {
      total: number;
      success: number;
      failed: string[];
    };
  }> {
    const builtinThemes = this.getAllBuiltinThemes();
    const migratedThemes: ThemePackageFile[] = [];
    const failedThemes: string[] = [];

    console.log('🚀 开始批量迁移主题包...');

    for (const [themeId, theme] of Object.entries(builtinThemes)) {
      try {
        console.log(`📦 迁移主题: ${theme.name} (${themeId})`);

        // 使用迁移工具转换主题
        const themePackage = ThemeMigrationTool.convertToThemePackage(theme, '2.0.0');
        migratedThemes.push(themePackage);

        console.log(`✅ 主题 ${theme.name} 迁移成功`);
      } catch (error) {
        console.error(`❌ 主题 ${theme.name} 迁移失败:`, error);
        failedThemes.push(themeId);
      }
    }

    const summary = {
      total: Object.keys(builtinThemes).length,
      success: migratedThemes.length,
      failed: failedThemes,
    };

    console.log('📊 迁移完成统计:');
    console.log(`- 总计: ${summary.total} 个主题`);
    console.log(`- 成功: ${summary.success} 个主题`);
    console.log(`- 失败: ${summary.failed.length} 个主题`);

    if (summary.failed.length > 0) {
      console.log('失败的主题:', summary.failed);
    }

    return {
      themes: migratedThemes,
      summary,
    };
  }

  /**
   * 导出所有主题包到文件系统
   */
  static async exportAllThemePackages(outputDir?: string): Promise<void> {
    const { themes, summary } = await this.migrateAllThemes();

    if (themes.length === 0) {
      console.warn('⚠️  没有主题需要导出');
      return;
    }

    console.log('💾 开始导出主题包文件...');

    for (const themePackage of themes) {
      try {
        // 生成文件名
        const filename = `${themePackage.manifest.name.replace(/\\s+/g, '-')}-theme-package.json`;

        if (typeof window !== 'undefined') {
          // 浏览器环境：下载文件
          ThemeMigrationTool.exportThemePackageAsFile(themePackage, filename);
          console.log(`📁 已导出: ${filename}`);
        } else {
          // Node.js 环境：写入到指定目录
          const fs = await import('fs/promises');
          const path = await import('path');

          const targetDir = outputDir || './exported-themes';
          const filePath = path.join(targetDir, filename);

          // 确保目录存在
          await fs.mkdir(targetDir, { recursive: true });

          // 写入文件
          const jsonContent = JSON.stringify(themePackage, null, 2);
          await fs.writeFile(filePath, jsonContent, 'utf-8');

          console.log(`📁 已导出到: ${filePath}`);
        }
      } catch (error) {
        console.error(`❌ 导出主题 ${themePackage.manifest.name} 失败:`, error);
      }
    }

    console.log(`🎉 批量导出完成! 共导出 ${themes.length} 个主题包`);
  }

  /**
   * 一键完整迁移流程
   * 迁移所有主题并导出到文件
   */
  static async runFullMigration(options?: { outputDir?: string; exportFiles?: boolean }): Promise<{
    themes: ThemePackageFile[];
    summary: any;
    exported?: boolean;
  }> {
    const { outputDir, exportFiles = true } = options || {};

    console.log('🔧 开始一键主题迁移流程...');

    // 步骤1: 迁移所有主题
    const migrationResult = await this.migrateAllThemes();

    // 步骤2: 可选导出文件
    let exported = false;
    if (exportFiles && migrationResult.themes.length > 0) {
      try {
        await this.exportAllThemePackages(outputDir);
        exported = true;
      } catch (error) {
        console.error('❌ 导出文件失败:', error);
      }
    }

    console.log('🏆 一键迁移流程完成!');

    return {
      ...migrationResult,
      exported,
    };
  }

  /**
   * 获取迁移报告
   */
  static generateMigrationReport(themes: ThemePackageFile[]): string {
    const report = ['# AionUI 主题迁移报告', '', `🗓️ 生成时间: ${new Date().toLocaleString('zh-CN')}`, `📦 迁移版本: 2.0.0`, `🎨 迁移主题数量: ${themes.length}`, '', '## 迁移的主题', ''];

    themes.forEach((theme, index) => {
      report.push(`### ${index + 1}. ${theme.manifest.name}`);
      report.push(`- **ID**: \`${theme.manifest.id}\``);
      report.push(`- **模式**: ${theme.manifest.mode}`);
      report.push(`- **原主题**: \`${theme.manifest.baseTheme}\``);
      report.push(`- **描述**: ${theme.manifest.description}`);
      report.push(`- **组件模块**: ${theme.manifest.modules.components.join(', ')}`);
      report.push(`- **布局模块**: ${theme.manifest.modules.layouts.join(', ')}`);
      report.push('');
    });

    report.push('## 新主题包特性');
    report.push('');
    report.push('✅ **模块化CSS架构** - 组件、布局、覆盖样式分离');
    report.push('✅ **标准化变量系统** - 统一的CSS变量命名规范');
    report.push('✅ **UnoCSS集成** - 主题感知的原子化CSS');
    report.push('✅ **导入导出功能** - 支持主题包的导入和导出');
    report.push('✅ **向后兼容** - 保持与原主题的视觉一致性');
    report.push('');
    report.push('---');
    report.push('*此报告由 AionUI 主题迁移工具自动生成*');

    return report.join('\\n');
  }

  /**
   * 验证所有迁移的主题包
   */
  static validateMigratedThemes(themes: ThemePackageFile[]): {
    valid: ThemePackageFile[];
    invalid: { theme: string; errors: string[] }[];
  } {
    const valid: ThemePackageFile[] = [];
    const invalid: { theme: string; errors: string[] }[] = [];

    for (const theme of themes) {
      const errors: string[] = [];

      // 验证必需字段
      if (!theme.manifest.name) errors.push('缺少主题名称');
      if (!theme.manifest.id) errors.push('缺少主题ID');
      if (!theme.manifest.mode) errors.push('缺少主题模式');
      if (!theme.manifest.variables) errors.push('缺少变量定义');

      // 验证样式
      if (!theme.styles.variables) errors.push('缺少变量样式');
      if (!theme.styles.components) errors.push('缺少组件样式');
      if (!theme.styles.layouts) errors.push('缺少布局样式');

      if (errors.length === 0) {
        valid.push(theme);
      } else {
        invalid.push({
          theme: theme.manifest.name || 'Unknown',
          errors,
        });
      }
    }

    return { valid, invalid };
  }
}

// 如果在Node.js环境中运行，可以直接执行迁移
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  // 检查是否通过命令行直接执行
  if (require.main === module) {
    BatchThemeMigrationTool.runFullMigration({
      outputDir: './example/theme',
      exportFiles: true,
    })
      .then((result) => {
        console.log('✨ 迁移完成!', result.summary);
        if (result.exported) {
          console.log('📁 文件已导出到 ./example/theme 目录');
        }
      })
      .catch((error) => {
        console.error('❌ 迁移失败:', error);
        process.exit(1);
      });
  }
}
