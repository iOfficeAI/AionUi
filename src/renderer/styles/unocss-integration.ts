/**
 * UnoCSS与主题系统集成配置
 */

import type { UserConfig } from 'unocss';

/**
 * 生成主题相关的UnoCSS配置
 */
export function generateThemeConfig(): Partial<UserConfig> {
  return {
    // 主题相关的快捷方式
    shortcuts: {
      // 按钮快捷方式
      'btn-primary': 'bg-theme-primary text-theme-text-on-primary border border-theme-primary rounded-theme-button transition-all duration-200 hover:bg-theme-primary-hover',
      'btn-secondary': 'bg-theme-surface text-theme-text-primary border border-theme-border rounded-theme-button transition-all duration-200 hover:bg-theme-surface-hover',
      'btn-danger': 'bg-theme-error text-white border border-theme-error rounded-theme-button transition-all duration-200',

      // 输入框快捷方式
      'input-base': 'bg-theme-surface text-theme-text-primary border border-theme-border rounded-theme-input px-theme-spacing-sm py-theme-spacing-xs focus:border-theme-primary focus:outline-none',

      // 卡片快捷方式
      'card-base': 'bg-theme-surface border border-theme-border rounded-theme-card shadow-theme-sm',
      'card-header': 'px-theme-spacing-lg py-theme-spacing-md border-b border-theme-border',
      'card-body': 'p-theme-spacing-lg',

      // 布局快捷方式
      'layout-sidebar': 'bg-theme-sidebar-background border-r border-theme-border',
      'layout-main': 'bg-theme-background min-h-screen',

      // 文本快捷方式
      'text-primary': 'text-theme-text-primary',
      'text-secondary': 'text-theme-text-secondary',
      'text-tertiary': 'text-theme-text-tertiary',
      'text-disabled': 'text-theme-text-disabled',

      // 交互状态快捷方式
      'hover-surface': 'hover:bg-theme-surface-hover',
      'selected-surface': 'bg-theme-surface-selected',
      'focus-ring': 'focus:ring-2 focus:ring-theme-primary focus:ring-opacity-20',
    },

    // 主题相关的规则
    rules: [
      // 主题背景色规则
      [/^bg-theme-(.+)$/, ([, color]) => ({ 'background-color': `var(--theme-${color.replace(/([A-Z])/g, '-$1').toLowerCase()})` })],

      // 主题文本色规则
      [/^text-theme-(.+)$/, ([, color]) => ({ color: `var(--theme-${color.replace(/([A-Z])/g, '-$1').toLowerCase()})` })],

      // 主题边框色规则
      [/^border-theme-(.+)$/, ([, color]) => ({ 'border-color': `var(--theme-${color.replace(/([A-Z])/g, '-$1').toLowerCase()})` })],

      // 主题圆角规则
      [/^rounded-theme-(.+)$/, ([, type]) => ({ 'border-radius': `var(--theme-${type}-radius)` })],

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

      // 主题阴影规则
      [/^shadow-theme-(.+)$/, ([, size]) => ({ 'box-shadow': `var(--theme-shadow-${size})` })],
    ],

    // 主题相关的变体
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

      // 主题ID变体
      (matcher) => {
        const match = matcher.match(/^theme-id-([^:]+):(.+)$/);
        if (!match) return matcher;

        const [, themeId, rest] = match;
        return {
          matcher: rest,
          selector: (s) => `[data-theme-id="${themeId}"] ${s}`,
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
      'border-theme-border',

      // 快捷方式类
      'btn-primary',
      'btn-secondary',
      'input-base',
      'card-base',
      'layout-sidebar',
      'layout-main',

      // 状态类
      'hover-surface',
      'selected-surface',
      'focus-ring',

      // 主题模式类
      'theme-light:bg-white',
      'theme-dark:bg-gray-900',
    ],
  };
}

/**
 * 动态更新UnoCSS配置以支持新主题
 */
export function updateUnoConfigForTheme(themeId: string, variables: Record<string, string>) {
  // 动态添加主题特定的快捷方式
  const themeShortcuts: Record<string, string> = {};

  // 为每个主题变量创建对应的快捷方式
  Object.keys(variables).forEach((key) => {
    const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    themeShortcuts[`${themeId}-${key}`] = `theme-id-${themeId}:bg-theme-${cssVar}`;
  });

  return themeShortcuts;
}

/**
 * 主题感知的UnoCSS预设
 */
export function createThemePreset(): any {
  const config = generateThemeConfig();
  return {
    name: 'aion-theme',
    shortcuts: config.shortcuts || {},
    rules: config.rules || [],
    variants: config.variants || [],
    safelist: config.safelist || [],
  };
}
