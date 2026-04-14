// uno.config.ts
import { defineConfig, presetMini, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss';
import { presetExtra } from 'unocss-preset-extra';

// ==================== 语义化文字颜色 / Semantic Text Colors ====================
// 用途：正文、标题等文字内容（推荐用于文本）
// Usage: Body text, headings, etc. (Recommended for text)
const textColors = {
  // 自定义语义化文字色 / Custom semantic text colors
  't-primary': 'var(--text-primary)', // text-t-primary - 主要文字
  't-secondary': 'var(--text-secondary)', // text-t-secondary - 次要文字
  't-tertiary': 'var(--bg-6)', // text-t-tertiary - 三级说明/提示文字
  't-disabled': 'var(--text-disabled)', // text-t-disabled - 禁用文字
};

// ==================== 语义状态色 / Semantic State Colors ====================
// 用途：状态提示、按钮、标签等
// Usage: Status indicators, buttons, tags, etc.
const semanticColors = {
  primary: 'var(--primary)', // bg-primary, text-primary, border-primary
  success: 'var(--success)', // bg-success, text-success
  warning: 'var(--warning)', // bg-warning, text-warning
  danger: 'var(--danger)', // bg-danger, text-danger
  info: 'var(--info)', // bg-info, text-info
};

// ==================== 背景色系统 / Background Color System ====================
// 用途：背景、容器等布局元素
// Usage: Backgrounds, containers, layout elements
// ⚠️ 数字键同时支持 bg-* 和 border-* (如: bg-1, border-1)
// Numeric keys support bg-* and border-* simultaneously
// 📝 text-1 到 text-4 通过自定义规则支持，指向 Arco 的 --color-text-*
// text-1 to text-4 are supported via custom rules, pointing to Arco's --color-text-*
const backgroundColors = {
  base: 'var(--bg-base)', // bg-base, border-base - 主背景
  1: 'var(--bg-1)', // bg-1, border-1 - 次级背景
  2: 'var(--bg-2)', // bg-2, border-2 - 三级背景
  3: 'var(--bg-3)', // bg-3, border-3 - 边框/分隔
  4: 'var(--bg-4)', // bg-4, border-4
  5: 'var(--bg-5)', // bg-5, border-5
  6: 'var(--bg-6)', // bg-6, border-6
  8: 'var(--bg-8)', // bg-8, border-8
  9: 'var(--bg-9)', // bg-9, border-9
  10: 'var(--bg-10)', // bg-10, border-10
  hover: 'var(--bg-hover)', // bg-hover - 悬停背景
  active: 'var(--bg-active)', // bg-active - 激活背景
};

// ==================== 边框颜色 / Border Colors ====================
const borderColors = {
  'b-base': 'var(--border-base)', // border-b-base - 基础边框
  'b-light': 'var(--border-light)', // border-b-light - 浅色边框
  'b-1': 'var(--bg-3)', // border-b-1 - 基于 bg-3
  'b-2': 'var(--bg-4)', // border-b-2 - 基于 bg-4
  'b-3': 'var(--bg-5)', // border-b-3 - 基于 bg-5
};

// ==================== 品牌色 / Brand Colors ====================
const brandColors = {
  brand: 'var(--brand)',
  'brand-light': 'var(--brand-light)',
  'brand-hover': 'var(--brand-hover)',
};

// ==================== AOU 品牌色系 / AOU Brand Colors ====================
const aouColors = {
  aou: {
    1: 'var(--aou-1)',
    2: 'var(--aou-2)',
    3: 'var(--aou-3)',
    4: 'var(--aou-4)',
    5: 'var(--aou-5)',
    6: 'var(--aou-6)',
    7: 'var(--aou-7)',
    8: 'var(--aou-8)',
    9: 'var(--aou-9)',
    10: 'var(--aou-10)',
  },
};

// ==================== UI 组件专用颜色 / UI Component Specific Colors ====================
const componentColors = {
  'message-user': 'var(--message-user-bg)',
  'message-tips': 'var(--message-tips-bg)',
  'workspace-btn': 'var(--workspace-btn-bg)',
};

// ==================== 特殊颜色 / Special Colors ====================
const specialColors = {
  fill: 'var(--fill)',
  inverse: 'var(--inverse)',
};

export default defineConfig({
  presets: [presetMini(), presetExtra(), presetWind3()],
  transformers: [transformerVariantGroup(), transformerDirectives({ enforce: 'pre' })],
  content: {
    pipeline: {
      // Use RegExp instead of glob strings so patterns match against absolute
      // module IDs regardless of the Vite root directory.  electron-vite sets
      // the renderer root to src/renderer/, which causes glob patterns like
      // 'src/**/*.tsx' to resolve to the non-existent src/renderer/src/ path.
      include: [/\.[jt]sx?($|\?)/, /\.vue($|\?)/, /\.css($|\?)/],
      exclude: [/[\\/]node_modules[\\/]/, /\.html($|\?)/],
    },
  },
  // 自定义规则 / Custom rules
  rules: [
    // Arco Design 官方文字颜色 text-1 到 text-4
    // Arco Design official text colors: text-1, text-2, text-3, text-4
    [/^text-([1-4])$/, ([, d]: RegExpExecArray) => ({ color: `var(--color-text-${d})` })],

    // Arco Design 官方填充色 fill-1 到 fill-4
    // Arco Design official fill colors: bg-fill-1, bg-fill-2, bg-fill-3, bg-fill-4
    [/^bg-fill-([1-4])$/, ([, d]: RegExpExecArray) => ({ 'background-color': `var(--color-fill-${d})` })],

    // Arco Design 官方边框色 border-1 到 border-4 (使用 border-arco-* 避免和项目自定义冲突)
    // Arco Design official border colors: border-arco-1, border-arco-2, border-arco-3, border-arco-4
    [/^border-arco-([1-4])$/, ([, d]: RegExpExecArray) => ({ 'border-color': `var(--color-border-${d})` })],

    // Arco Design 官方浅色系 primary/success/warning/danger/link-light-1 到 -light-4
    // Arco Design light variants: bg-primary-light-1, bg-success-light-1, etc.
    [
      /^bg-(primary|success|warning|danger|link)-light-([1-4])$/,
      ([, color, d]: RegExpExecArray) => ({ 'background-color': `var(--color-${color}-light-${d})` }),
    ],

    // Arco Design 官方色阶 primary/success/warning/danger 1-9
    // Arco Design color levels: bg-primary-1, text-primary-1, border-primary-1, etc.
    [
      /^(bg|text|border)-(primary|success|warning|danger)-([1-9])$/,
      ([, prefix, color, d]: RegExpExecArray) => {
        const prop = prefix === 'bg' ? 'background-color' : prefix === 'text' ? 'color' : 'border-color';
        return { [prop]: `rgb(var(--${color}-${d}))` };
      },
    ],

    // Arco Design 官方白色和黑色
    // Arco Design white and black: bg-color-white, text-color-white, bg-color-black, text-color-black
    ['bg-color-white', { 'background-color': 'var(--color-white)' }],
    ['text-color-white', { color: 'var(--color-white)' }],
    ['bg-color-black', { 'background-color': 'var(--color-black)' }],
    ['text-color-black', { color: 'var(--color-black)' }],

    // Arco Design 对话框/弹出层专用背景色
    // Arco Design popup/dialog background color: bg-popup
    ['bg-popup', { 'background-color': 'var(--color-bg-popup)' }],

    // 项目自定义颜色 / Project custom colors
    ['bg-dialog-fill-0', { 'background-color': 'var(--dialog-fill-0)' }],
    ['text-0', { color: 'var(--text-0)' }],
    ['text-white', { color: 'var(--text-white)' }],
    ['bg-fill-0', { 'background-color': 'var(--fill-0)' }],
    ['bg-fill-white-to-black', { 'background-color': 'var(--fill-white-to-black)' }],
    ['border-special', { 'border-color': 'var(--border-special)' }],

    // Wiggle animation for attention indicators (e.g. pending permission badge)
    // Shakes briefly then pauses — 3s cycle, active in first ~20%
    ['animate-wiggle', { animation: 'wiggle 3s ease-in-out infinite' }],
  ],
  // Preflights - Global base styles 全局基础样式
  preflights: [
    {
      getCSS: () => `
        * {
          /* Set default text color to follow theme 所有元素默认使用主题文字颜色 */
          color: inherit;
        }
        @keyframes wiggle {
          0%, 20%, 100% { transform: rotate(0deg); }
          4% { transform: rotate(8deg); }
          8% { transform: rotate(-8deg); }
          12% { transform: rotate(6deg); }
          16% { transform: rotate(-4deg); }
        }
      `,
    },
  ],
  // 基础配置
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
  },
  theme: {
    colors: {
      // 合并所有颜色配置 Merge all color configurations
      ...textColors,
      ...semanticColors,
      ...backgroundColors,
      ...borderColors,
      ...brandColors,
      ...aouColors,
      ...componentColors,
      ...specialColors,
    },
  },
});
