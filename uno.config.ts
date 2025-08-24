// uno.config.ts
import { defineConfig, presetMini, transformerVariantGroup, transformerDirectives, presetWind3 } from 'unocss';
import { presetExtra } from 'unocss-preset-extra';
import { createThemePreset } from './src/renderer/styles/unocss-integration';

export default defineConfig({
  envMode: 'build',
  presets: [
    presetMini(),
    presetExtra(),
    presetWind3(),
    createThemePreset(), // 集成主题预设
  ],
  transformers: [transformerVariantGroup(), transformerDirectives()],
  content: {
    pipeline: {
      include: ['src/**/*.{ts,tsx,vue,css}'],
    },
  },
  // 基础配置
  shortcuts: {
    // 原有快捷方式
    'flex-center': 'flex items-center justify-center',

    // 主题感知的快捷方式
    'btn-primary': 'bg-theme-primary text-theme-text-on-primary border border-theme-primary rounded-theme-button px-theme-spacing-md py-theme-spacing-sm transition-all duration-200 hover:bg-theme-primary-hover focus:ring-2 focus:ring-theme-primary focus:ring-opacity-20',
    'btn-secondary': 'bg-theme-surface text-theme-text-primary border border-theme-border rounded-theme-button px-theme-spacing-md py-theme-spacing-sm transition-all duration-200 hover:bg-theme-surface-hover focus:ring-2 focus:ring-theme-primary focus:ring-opacity-20',
    'btn-danger': 'bg-theme-error text-white border border-theme-error rounded-theme-button px-theme-spacing-md py-theme-spacing-sm transition-all duration-200 hover:opacity-80',

    'input-base': 'bg-theme-surface text-theme-text-primary border border-theme-border rounded-theme-input px-theme-spacing-sm py-theme-spacing-xs focus:border-theme-primary focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-opacity-20',
    'textarea-base': 'bg-theme-surface text-theme-text-primary border border-theme-border rounded-theme-input px-theme-spacing-sm py-theme-spacing-xs focus:border-theme-primary focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-opacity-20 resize-none',

    'card-base': 'bg-theme-surface border border-theme-border rounded-theme-card shadow-theme-sm overflow-hidden',
    'card-header': 'px-theme-spacing-lg py-theme-spacing-md border-b border-theme-border bg-theme-surface',
    'card-body': 'p-theme-spacing-lg text-theme-text-primary',

    'modal-overlay': 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50',
    'modal-base': 'bg-theme-surface rounded-theme-modal shadow-theme-lg border border-theme-border max-w-2xl w-full mx-4',

    'sidebar-base': 'bg-theme-sidebar-background border-r border-theme-border text-theme-text-primary',
    'sidebar-item': 'px-theme-spacing-md py-theme-spacing-sm text-theme-text-primary hover:bg-theme-sidebar-hover cursor-pointer transition-colors duration-200',
    'sidebar-item-active': 'bg-theme-surface-selected text-theme-text-primary',

    'dropdown-base': 'bg-theme-surface border border-theme-border rounded-theme-input shadow-theme-lg py-theme-spacing-xs min-w-32',
    'dropdown-item': 'px-theme-spacing-md py-theme-spacing-sm text-theme-text-primary hover:bg-theme-surface-hover cursor-pointer transition-colors duration-200',
    'dropdown-item-selected': 'bg-theme-surface-selected text-theme-text-primary',

    'text-primary': 'text-theme-text-primary',
    'text-secondary': 'text-theme-text-secondary',
    'text-tertiary': 'text-theme-text-tertiary',
    'text-disabled': 'text-theme-text-disabled',

    'surface-primary': 'bg-theme-surface',
    'surface-secondary': 'bg-theme-surface-hover',
    'surface-selected': 'bg-theme-surface-selected',

    'border-primary': 'border-theme-border',
    'border-hover': 'border-theme-border-hover',
    'border-active': 'border-theme-border-active',
  },

  // 主题相关规则
  rules: [
    // 主题CSS变量规则
    [/^bg-theme-(.+)$/, ([, color]) => ({ 'background-color': `var(--theme-${color.replace(/([A-Z])/g, '-$1').toLowerCase()})` })],
    [/^text-theme-(.+)$/, ([, color]) => ({ color: `var(--theme-${color.replace(/([A-Z])/g, '-$1').toLowerCase()})` })],
    [/^border-theme-(.+)$/, ([, color]) => ({ 'border-color': `var(--theme-${color.replace(/([A-Z])/g, '-$1').toLowerCase()})` })],
    [/^rounded-theme-(.+)$/, ([, type]) => ({ 'border-radius': `var(--theme-${type}-radius)` })],
    [/^shadow-theme-(.+)$/, ([, size]) => ({ 'box-shadow': `var(--theme-shadow-${size})` })],

    // 主题间距规则
    [
      /^([mp][trblxy]?)-theme-spacing-(.+)$/,
      ([, prefix, size]) => {
        const property = prefix.startsWith('m') ? 'margin' : 'padding';
        const direction = prefix.slice(1) || '';
        const directions: Record<string, string[]> = {
          '': [''],
          t: ['-top'],
          r: ['-right'],
          b: ['-bottom'],
          l: ['-left'],
          x: ['-left', '-right'],
          y: ['-top', '-bottom'],
        };

        const result: Record<string, string> = {};
        (directions[direction] || ['']).forEach((suffix) => {
          result[`${property}${suffix}`] = `var(--theme-spacing-${size})`;
        });
        return result;
      },
    ],
  ],

  // 主题相关变体
  variants: [
    // 主题模式变体
    (matcher) => {
      if (!matcher.startsWith('theme-light:') && !matcher.startsWith('theme-dark:')) {
        return matcher;
      }

      const [mode, rest] = matcher.split(':', 2);
      const themeMode = mode === 'theme-light' ? 'light' : 'dark';

      return {
        matcher: rest,
        selector: (s) => `[data-theme-mode="${themeMode}"] ${s}`,
      };
    },
  ],

  // 确保主题相关的类被包含
  safelist: [
    // 主题变量类
    'bg-theme-primary',
    'bg-theme-surface',
    'bg-theme-background',
    'text-theme-text-primary',
    'text-theme-text-secondary',
    'text-theme-text-tertiary',
    'border-theme-border',
    'border-theme-border-hover',

    // 快捷方式类
    'btn-primary',
    'btn-secondary',
    'btn-danger',
    'input-base',
    'textarea-base',
    'card-base',
    'card-header',
    'card-body',
    'modal-base',
    'modal-overlay',
    'sidebar-base',
    'sidebar-item',
    'sidebar-item-active',
    'dropdown-base',
    'dropdown-item',
    'dropdown-item-selected',

    // 文本和表面类
    'text-primary',
    'text-secondary',
    'text-tertiary',
    'text-disabled',
    'surface-primary',
    'surface-secondary',
    'surface-selected',
    'border-primary',
    'border-hover',
    'border-active',

    // 主题模式类
    'theme-light:bg-white',
    'theme-dark:bg-gray-900',

    // 间距类
    'p-theme-spacing-xs',
    'p-theme-spacing-sm',
    'p-theme-spacing-md',
    'p-theme-spacing-lg',
    'px-theme-spacing-sm',
    'py-theme-spacing-xs',
    'px-theme-spacing-md',
    'py-theme-spacing-sm',

    // 圆角类
    'rounded-theme-button',
    'rounded-theme-input',
    'rounded-theme-card',
    'rounded-theme-modal',

    // 阴影类
    'shadow-theme-sm',
    'shadow-theme-md',
    'shadow-theme-lg',
  ],

  theme: {
    colors: {
      // 保留原有自定义颜色，主题颜色通过CSS变量处理
    },
  },
});
