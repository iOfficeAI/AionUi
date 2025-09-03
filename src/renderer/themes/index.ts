// 统一导出：完整主题系统（Provider + Hooks + 选择器组件）
export { ThemeProvider, useTheme } from './provider';
export type { ThemeMode, ThemePack, ThemeTokens } from './types';
export { default as ThemeSelector } from './components/ThemeSelector';
// 保留代码高亮 hook（复用简单主题实现）
// simple-theme removed; code highlight theming handled by ThemeProvider tokens
