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
  // 基础配置
  shortcuts: {
    // 自定义快捷方式
    'flex-center': 'flex items-center justify-center',
  },
  theme: {
    colors: {
      // 自定义颜色
    },
  },
});
