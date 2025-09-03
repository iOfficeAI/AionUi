export type ThemeMode = 'light' | 'dark';

export interface CodeHighlightTokens {
  background?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string;
  // syntax elements
  keyword?: string;
  string?: string;
  comment?: string;
  number?: string;
  function?: string;
  variable?: string;
  operator?: string;
  type?: string;
  constant?: string;
  punctuation?: string;
  className?: string;
  property?: string;
  tag?: string;
  attr?: string;
  // UI parts
  headerBackground?: string;
  headerColor?: string;
  lineNumberColor?: string;
  selectedLineBackground?: string;
  borderColor?: string;
  scrollbarColor?: string;
  iconColor?: string;
  inlineCodeBackground?: string;
  inlineCodeBorder?: string;
}

export interface AppStyleDefinition extends I18nKeyStyle {
  hover?: I18nKeyStyle;
  active?: I18nKeyStyle;
  focus?: I18nKeyStyle;
}

export interface ThemeTokens {
  // CSS variables map, e.g., --color-bg-1
  variables: Record<string, string>;
  // Optional Arco Design tokens (subset)
  arco?: {
    primaryColor?: string;
  };
  // Optional i18n key styles mapping
  i18nStyles?: Record<string, I18nKeyStyle>;
  // Optional: code highlight theme tokens
  codeHighlight?: CodeHighlightTokens;
  // Optional: app wide style buckets (keys like o-slider, o-main, etc.)
  appStyles?: Record<string, AppStyleDefinition>;
}

export interface ThemePackMeta {
  author?: string;
  version?: string;
  description?: string;
}

export interface ThemePack {
  id: string;
  name: string;
  meta?: ThemePackMeta;
  defaultMode?: ThemeMode; // 默认模式，切换主题时会自动切换到此模式
  light: ThemeTokens;
  dark: ThemeTokens;
}

export interface ThemeStateSnapshot {
  currentThemeId: string;
  mode: ThemeMode;
}

export interface ThemeStorageShape {
  themes: ThemePack[];
  state: ThemeStateSnapshot;
}

export interface I18nKeyStyle {
  // 文字样式
  colorVar?: string; // CSS 变量，如 --color-text-1
  color?: string; // 直接色值，如 #ff0000, rgb(255,0,0)
  fontSize?: string; // e.g., 14px
  fontWeight?: number; // e.g., 400/500/600
  lineHeight?: string; // e.g., 22px or 1.6
  letterSpacing?: string; // e.g., 0.2px
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';

  // 背景样式
  backgroundColorVar?: string; // CSS 变量，如 --color-bg-1
  backgroundColor?: string; // 直接色值，如 #ffffff
  backgroundImage?: string; // e.g., linear-gradient(...)

  // 边框样式
  borderColorVar?: string; // CSS 变量，如 --color-border-1
  borderColor?: string; // 直接色值，如 #cccccc
  borderWidth?: string; // e.g., 1px, 2px
  borderStyle?: string; // e.g., solid, dashed, dotted
  borderRadius?: string; // e.g., 4px, 8px

  // 间距样式
  padding?: string; // e.g., 8px, 12px 16px
  margin?: string; // e.g., 8px, 12px 16px

  // 尺寸样式
  width?: string; // e.g., 100px, 100%
  height?: string; // e.g., 32px, auto
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;

  // 显示样式
  display?: string; // e.g., block, flex, inline-block
  opacity?: number; // e.g., 0.8, 0.5

  // 阴影样式
  boxShadow?: string; // e.g., 0 2px 8px rgba(0,0,0,0.1)
}
