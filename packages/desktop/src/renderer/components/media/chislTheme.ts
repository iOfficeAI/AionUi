/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Custom Shiki/Pierre theme pair for Chisl.
 *
 * Pierre's `FileDiff` / `MultiFileDiff` accept any Shiki `ThemeRegistration` (see
 * `@pierre/diffs/dist/types.d.ts` `DiffsThemeNames`). The package itself ships
 * `pierre-light` / `pierre-dark` (Flexoki-derived), but we want our warm
 * parchment/ink/rust palette to flow through syntax highlighting too. We
 * register two themes — `chisl-light` and `chisl-dark` — by mirroring the
 * Pierre theme JSON shape and then assign it to the diff component via
 * `theme={{ light: 'chisl-light', dark: 'chisl-dark' }}` and
 * `themeType={'light' | 'dark' | 'system'}`.
 *
 * The colors are sourced from `chisl-color-scheme.css` (the canonical Chisl
 * palette). Keep this file in sync with that file when tokens change.
 */
// The runtime contract is whatever Shiki accepts as a `ThemeRegistration`.
// We don't depend on `shiki` directly (it's a transitive dep of @pierre/diffs),
// so we model the structural shape we use ourselves and let the loader
// signature match `registerCustomTheme`'s parameter type.
type TextMateScope = string | string[];
interface TokenColorSetting {
  scope?: TextMateScope;
  settings: { foreground?: string; background?: string; fontStyle?: string };
}
type ThemeRegistration = {
  name: string;
  type?: 'light' | 'dark';
  colors?: Record<string, string>;
  tokenColors?: TokenColorSetting[];
};

const CHISL_LIGHT: ThemeRegistration = {
  name: 'chisl-light',
  type: 'light',
  colors: {
    'editor.background': '#f6ecc8', // bg-base — parchment
    'editor.foreground': '#303024', // text-primary — olive ink
    foreground: '#303024',
    focusBorder: '#b4480c', // brand — signature rust
    'selection.background': 'rgba(180, 72, 12, 0.18)',
    'editor.selectionBackground': 'rgba(180, 72, 12, 0.18)',
    'editor.lineHighlightBackground': 'rgba(232, 216, 168, 0.5)', // bg-2
    'editorCursor.foreground': '#b4480c',
    'editorLineNumber.foreground': '#80694a', // text-disabled
    'editorLineNumber.activeForeground': '#303024',
    'editorIndentGuide.background': '#d8c088', // bg-3
    'editorIndentGuide.activeBackground': '#c4a978', // bg-4
    'diffEditor.insertedTextBackground': 'rgba(96, 120, 72, 0.22)', // success/olive @ 22%
    'diffEditor.deletedTextBackground': 'rgba(155, 53, 20, 0.22)', // danger/rust @ 22%
    'sideBar.background': '#f0e4b4', // bg-1
    'sideBar.foreground': '#4a4434',
    'sideBar.border': '#d0b878',
    'sideBarTitle.foreground': '#303024',
    'tab.activeBackground': '#f6ecc8',
    'tab.activeForeground': '#303024',
    'tab.activeBorderTop': '#b4480c',
    'tab.inactiveBackground': '#ecdfb6',
    'tab.inactiveForeground': '#80694a',
    'tab.border': '#d0b878',
    'editorGroupHeader.tabsBackground': '#ecdfb6',
    'editorGroupHeader.tabsBorder': '#d0b878',
    'panel.background': '#ecdfb6',
    'panel.border': '#d0b878',
    'panelTitle.activeBorder': '#b4480c',
    'panelTitle.activeForeground': '#303024',
    'panelTitle.inactiveForeground': '#80694a',
    'statusBar.background': '#ecdfb6',
    'statusBar.foreground': '#4a4434',
    'statusBar.border': '#d0b878',
    'input.background': '#f0e4b4',
    'input.border': '#d0b878',
    'input.foreground': '#303024',
    'input.placeholderForeground': '#80694a',
    'dropdown.background': '#f0e4b4',
    'dropdown.border': '#d0b878',
    'dropdown.foreground': '#303024',
    'button.background': '#b4480c',
    'button.foreground': '#f6ecc8',
    'button.hoverBackground': '#cc6018',
    'textLink.foreground': '#b4480c',
    'textLink.activeForeground': '#9b3514',
    'gitDecoration.addedResourceForeground': '#607848', // success
    'gitDecoration.conflictingResourceForeground': '#9b3514',
    'gitDecoration.modifiedResourceForeground': '#b4480c',
    'gitDecoration.deletedResourceForeground': '#9b3514',
    'gitDecoration.untrackedResourceForeground': '#607848',
    'gitDecoration.ignoredResourceForeground': '#80694a',
  },
  tokenColors: [
    // Comments — muted, paper-printed feel
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#80694a' } },
    { scope: 'comment markup.link', settings: { foreground: '#80694a' } },
    // Strings — olive green (success)
    { scope: ['string', 'constant.other.symbol'], settings: { foreground: '#607848' } },
    {
      scope: ['punctuation.definition.string.begin', 'punctuation.definition.string.end'],
      settings: { foreground: '#607848' },
    },
    // Numbers / booleans — slate teal (info)
    { scope: ['constant.numeric', 'constant.language.boolean'], settings: { foreground: '#3c786c' } },
    // Other constants — mustard (warning)
    { scope: 'constant', settings: { foreground: '#c08418' } },
    // Keywords / storage — rust (brand)
    {
      scope: ['keyword', 'keyword.control', 'storage', 'storage.type', 'storage.modifier'],
      settings: { foreground: '#b4480c' },
    },
    // Identifiers / variables — warm brown
    {
      scope: [
        'variable',
        'identifier',
        'meta.definition.variable',
        'variable.other.readwrite',
        'meta.object-literal.key',
      ],
      settings: { foreground: '#7a3f10' },
    },
    // Function names — muted purple
    {
      scope: ['support.function', 'entity.name.function', 'meta.function-call', 'variable.function'],
      settings: { foreground: '#7a4a8a' },
    },
    // Types / classes — deeper purple
    {
      scope: ['support.type', 'entity.name.type', 'entity.name.class', 'storage.type'],
      settings: { foreground: '#693acf' },
    },
    // Operators — olive ink
    { scope: ['keyword.operator', 'punctuation'], settings: { foreground: '#5b4d36' } },
    // Punctuation group
    {
      scope: ['meta.brace', 'punctuation.separator', 'punctuation.terminator', 'function.brace'],
      settings: { foreground: '#5b4d36' },
    },
  ],
};

const CHISL_DARK: ThemeRegistration = {
  name: 'chisl-dark',
  type: 'dark',
  colors: {
    'editor.background': '#1f1c17', // bg-base — warm ink
    'editor.foreground': '#ecdfb6', // text-primary — cream
    foreground: '#ecdfb6',
    focusBorder: '#e07820', // lifted rust
    'selection.background': 'rgba(224, 120, 32, 0.28)',
    'editor.selectionBackground': 'rgba(224, 120, 32, 0.28)',
    'editor.lineHighlightBackground': 'rgba(50, 44, 34, 0.5)', // bg-2
    'editorCursor.foreground': '#e07820',
    'editorLineNumber.foreground': '#80694a',
    'editorLineNumber.activeForeground': '#ecdfb6',
    'editorIndentGuide.background': '#3d3528', // bg-3
    'editorIndentGuide.activeBackground': '#4a4030', // bg-4
    'diffEditor.insertedTextBackground': 'rgba(138, 168, 96, 0.25)', // success/olive @ 25%
    'diffEditor.deletedTextBackground': 'rgba(214, 88, 44, 0.25)', // danger/rust @ 25%
    'sideBar.background': '#28241d', // bg-1
    'sideBar.foreground': '#d6c08c',
    'sideBar.border': '#3d3528',
    'sideBarTitle.foreground': '#ecdfb6',
    'tab.activeBackground': '#1f1c17',
    'tab.activeForeground': '#ecdfb6',
    'tab.activeBorderTop': '#e07820',
    'tab.inactiveBackground': '#28241d',
    'tab.inactiveForeground': '#b8a378',
    'tab.border': '#3d3528',
    'editorGroupHeader.tabsBackground': '#28241d',
    'editorGroupHeader.tabsBorder': '#3d3528',
    'panel.background': '#28241d',
    'panel.border': '#3d3528',
    'panelTitle.activeBorder': '#e07820',
    'panelTitle.activeForeground': '#ecdfb6',
    'panelTitle.inactiveForeground': '#b8a378',
    'statusBar.background': '#28241d',
    'statusBar.foreground': '#d6c08c',
    'statusBar.border': '#3d3528',
    'input.background': '#28241d',
    'input.border': '#3d3528',
    'input.foreground': '#ecdfb6',
    'input.placeholderForeground': '#80694a',
    'dropdown.background': '#28241d',
    'dropdown.border': '#3d3528',
    'dropdown.foreground': '#ecdfb6',
    'button.background': '#e07820',
    'button.foreground': '#1f1c17',
    'button.hoverBackground': '#cc6018',
    'textLink.foreground': '#e07820',
    'textLink.activeForeground': '#d6582c',
    'gitDecoration.addedResourceForeground': '#8aa860',
    'gitDecoration.conflictingResourceForeground': '#d6582c',
    'gitDecoration.modifiedResourceForeground': '#e07820',
    'gitDecoration.deletedResourceForeground': '#d6582c',
    'gitDecoration.untrackedResourceForeground': '#8aa860',
    'gitDecoration.ignoredResourceForeground': '#80694a',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#80694a' } },
    { scope: 'comment markup.link', settings: { foreground: '#80694a' } },
    { scope: ['string', 'constant.other.symbol'], settings: { foreground: '#8aa860' } },
    {
      scope: ['punctuation.definition.string.begin', 'punctuation.definition.string.end'],
      settings: { foreground: '#8aa860' },
    },
    { scope: ['constant.numeric', 'constant.language.boolean'], settings: { foreground: '#6caa9c' } },
    { scope: 'constant', settings: { foreground: '#e4b430' } },
    {
      scope: ['keyword', 'keyword.control', 'storage', 'storage.type', 'storage.modifier'],
      settings: { foreground: '#e07820' },
    },
    {
      scope: [
        'variable',
        'identifier',
        'meta.definition.variable',
        'variable.other.readwrite',
        'meta.object-literal.key',
      ],
      settings: { foreground: '#d6a06c' },
    },
    {
      scope: ['support.function', 'entity.name.function', 'meta.function-call', 'variable.function'],
      settings: { foreground: '#b896d4' },
    },
    {
      scope: ['support.type', 'entity.name.type', 'entity.name.class', 'storage.type'],
      settings: { foreground: '#a48ad6' },
    },
    { scope: ['keyword.operator', 'punctuation'], settings: { foreground: '#b8a378' } },
    {
      scope: ['meta.brace', 'punctuation.separator', 'punctuation.terminator', 'function.brace'],
      settings: { foreground: '#b8a378' },
    },
  ],
};

export const CHISL_THEME_LIGHT_NAME = 'chisl-light';
export const CHISL_THEME_DARK_NAME = 'chisl-dark';

/**
 * Pair object accepted by Pierre's `theme` prop on `FileDiff` / `MultiFileDiff`.
 * The shape matches `DiffsThemeNames | ThemesType` from `@pierre/diffs`.
 */
export const CHISL_THEMES = {
  light: CHISL_THEME_LIGHT_NAME,
  dark: CHISL_THEME_DARK_NAME,
} as const;

export const CHISL_THEME_LOADERS: Record<string, () => Promise<ThemeRegistration>> = {
  [CHISL_THEME_LIGHT_NAME]: async () => CHISL_LIGHT,
  [CHISL_THEME_DARK_NAME]: async () => CHISL_DARK,
};
