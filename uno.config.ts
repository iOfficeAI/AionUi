// uno.config.ts
import { defineConfig, presetMini, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss';
import { presetExtra } from 'unocss-preset-extra';

export default defineConfig({
  envMode: 'build',
  presets: [presetMini(), presetExtra(), presetWind3()], //
  transformers: [transformerVariantGroup(), transformerDirectives({ enforce: 'pre' })],
  content: {
    pipeline: {
      include: ['src/**/*.{ts,tsx,vue,css}'],
    },
  },
  // Preflights - Global base styles 全局基础样式
  preflights: [
    {
      getCSS: () => `
        * {
          /* Set default text color to follow theme 所有元素默认使用主题文字颜色 */
          color: inherit;
        }
      `,
    },
  ],
  // 基础配置
  shortcuts: {
    // 自定义快捷方式
    'flex-center': 'flex items-center justify-center',
  },
  theme: {
    colors: {
      // AOU Brand Colors
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
      // Background Colors (简洁命名)
      base: 'var(--bg-base)', // 主背景 bg-base
      1: 'var(--bg-1)', // 可用 bg-1
      2: 'var(--bg-2)', // 可用 bg-2
      3: 'var(--bg-3)', // 可用 bg-3
      4: 'var(--bg-4)',
      5: 'var(--bg-5)',
      6: 'var(--bg-6)',
      8: 'var(--bg-8)',
      9: 'var(--bg-9)',
      10: 'var(--bg-10)',
      // Interactive State Colors
      hover: 'var(--bg-hover)', // bg-hover, hover:bg-hover
      active: 'var(--bg-active)', // bg-active
      // Text Colors (语义化)
      't-primary': 'var(--text-primary)', // text-t-primary
      't-secondary': 'var(--text-secondary)', // text-t-secondary
      't-disabled': 'var(--text-disabled)', // text-t-disabled
      // Semantic Colors
      primary: 'var(--primary)',
      success: 'var(--success)',
      warning: 'var(--warning)',
      danger: 'var(--danger)',
      // Border Colors
      'b-base': 'var(--border-base)', // border-b-base
      'b-light': 'var(--border-light)', // border-b-light
      // Brand Colors
      brand: 'var(--brand)', // bg-brand, text-brand
      'brand-light': 'var(--brand-light)', // bg-brand-light
      'brand-hover': 'var(--brand-hover)', // bg-brand-hover
      // Message & UI Component Colors
      'message-user': 'var(--message-user-bg)', // bg-message-user
      'message-tips': 'var(--message-tips-bg)', // bg-message-tips
      'workspace-btn': 'var(--workspace-btn-bg)', // bg-workspace-btn
      // Special Colors
      fill: 'var(--fill)',
      inverse: 'var(--inverse)',
    },
  },
});
