/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Custom Monaco themes bound to Chisl's semantic CSS variables. Every Monaco
 * "color contribution point" we can reasonably override is wired through the
 * project's tokens so the editor body, gutters, minimap, scrollbars, find
 * widget, peek view, hover/suggest popups, and inline status decorations all
 * share the look of the surrounding toolbar / tabs / status bar.
 *
 * We resolve actual color values from CSS variables at theme-define time so
 * token tweaks flow through without code changes.
 */

import * as monaco from 'monaco-editor';

export const AIONUI_LIGHT_THEME = 'aionui-light';
export const AIONUI_DARK_THEME = 'aionui-dark';

type Palette = {
  bg: string;
  bg2: string;
  bg3: string;
  fg: string;
  fgSecondary: string;
  fgTertiary: string;
  cursor: string;
  selection: string;
  selectionInactive: string;
  lineHighlight: string;
  gutterFg: string;
  brand: string;
  brandSoft: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  shadow: string;
};

const FALLBACK_LIGHT: Palette = {
  bg: '#ffffff',
  bg2: '#f7f8fa',
  bg3: '#e5e6eb',
  fg: '#1f2329',
  fgSecondary: '#4e5969',
  fgTertiary: '#86909c',
  cursor: '#1f2329',
  selection: '#c6e0ff',
  selectionInactive: '#dfe7f3',
  lineHighlight: '#f7f8fa',
  gutterFg: '#a9aeb8',
  brand: '#165dff',
  brandSoft: '#e8f3ff',
  success: '#00b42a',
  warning: '#ff7d00',
  danger: '#f53f3f',
  info: '#165dff',
  shadow: '#00000014',
};

const FALLBACK_DARK: Palette = {
  bg: '#17171a',
  bg2: '#1d1d1f',
  bg3: '#2a2a2d',
  fg: '#e5e6eb',
  fgSecondary: '#c9cdd4',
  fgTertiary: '#86909c',
  cursor: '#e5e6eb',
  selection: '#1d4f8c',
  selectionInactive: '#244366',
  lineHighlight: '#232324',
  gutterFg: '#5a5e66',
  brand: '#4080ff',
  brandSoft: '#1a2740',
  success: '#23c343',
  warning: '#ff9a2e',
  danger: '#f76560',
  info: '#4080ff',
  shadow: '#00000033',
};

function resolveCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return fallback;
  if (value.startsWith('#')) return value.length === 9 ? value : value; // accept #RGBA too
  if (value.startsWith('rgb')) return rgbToHex(value) ?? fallback;
  // hsl()/oklch()/etc. — Monaco can't parse, fall back rather than ship garbage.
  return fallback;
}

function rgbToHex(rgb: string): string | null {
  // Handles `rgb(r,g,b)` and `rgba(r,g,b,a)`. Alpha → 2-digit hex appended.
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/);
  if (!m) return null;
  const r = Number.parseInt(m[1], 10);
  const g = Number.parseInt(m[2], 10);
  const b = Number.parseInt(m[3], 10);
  const a = m[4] !== undefined ? Math.round(Number.parseFloat(m[4]) * 255) : null;
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}${a !== null ? hex(a) : ''}`;
}

/** Append a 2-digit alpha to a 6-digit hex (`#RRGGBB` → `#RRGGBBAA`). */
function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function loadPalette(fb: Palette): Palette {
  return {
    bg: resolveCssVar('--bg-1', fb.bg),
    bg2: resolveCssVar('--bg-2', fb.bg2),
    bg3: resolveCssVar('--bg-3', fb.bg3),
    fg: resolveCssVar('--text-primary', fb.fg),
    fgSecondary: resolveCssVar('--text-secondary', fb.fgSecondary),
    fgTertiary: resolveCssVar('--bg-6', fb.fgTertiary),
    cursor: resolveCssVar('--text-primary', fb.cursor),
    selection: fb.selection,
    selectionInactive: fb.selectionInactive,
    lineHighlight: resolveCssVar('--bg-2', fb.lineHighlight),
    gutterFg: resolveCssVar('--text-secondary', fb.gutterFg),
    brand: resolveCssVar('--brand', fb.brand),
    brandSoft: resolveCssVar('--brand-light', fb.brandSoft),
    success: fb.success,
    warning: fb.warning,
    danger: fb.danger,
    info: fb.info,
    shadow: fb.shadow,
  };
}

function defineTheme(name: string, base: 'vs' | 'vs-dark', fb: Palette): void {
  const p = loadPalette(fb);

  monaco.editor.defineTheme(name, {
    base,
    inherit: true,
    rules: [],
    colors: {
      // ───── Editor body ─────────────────────────────────────────────────────
      'editor.background': p.bg,
      'editor.foreground': p.fg,
      'editor.lineHighlightBackground': p.lineHighlight,
      'editor.lineHighlightBorder': '#00000000', // suppress the default 1px outline
      'editor.selectionBackground': p.selection,
      'editor.inactiveSelectionBackground': p.selectionInactive,
      'editor.selectionHighlightBackground': withAlpha(p.brand, 0.18),
      'editor.wordHighlightBackground': withAlpha(p.brand, 0.14),
      'editor.wordHighlightStrongBackground': withAlpha(p.brand, 0.22),
      'editor.findMatchBackground': withAlpha(p.warning, 0.55),
      'editor.findMatchHighlightBackground': withAlpha(p.warning, 0.28),
      'editor.findRangeHighlightBackground': withAlpha(p.brand, 0.1),
      'editor.rangeHighlightBackground': withAlpha(p.brand, 0.08),

      // ───── Cursor / whitespace ─────────────────────────────────────────────
      'editorCursor.foreground': p.cursor,
      'editorWhitespace.foreground': withAlpha(p.fgTertiary, 0.5),
      'editorIndentGuide.background': p.bg3,
      'editorIndentGuide.activeBackground': withAlpha(p.brand, 0.5),
      'editorRuler.foreground': p.bg3,

      // ───── Line numbers / gutter ───────────────────────────────────────────
      'editorLineNumber.foreground': p.fgTertiary,
      'editorLineNumber.activeForeground': p.fg,
      'editorGutter.background': p.bg,
      'editorGutter.modifiedBackground': p.warning,
      'editorGutter.addedBackground': p.success,
      'editorGutter.deletedBackground': p.danger,

      // ───── Brackets ────────────────────────────────────────────────────────
      'editorBracketMatch.background': withAlpha(p.brand, 0.18),
      'editorBracketMatch.border': withAlpha(p.brand, 0.6),

      // ───── Diagnostics ─────────────────────────────────────────────────────
      'editorError.foreground': p.danger,
      'editorWarning.foreground': p.warning,
      'editorInfo.foreground': p.info,
      'editorHint.foreground': p.fgSecondary,
      'editorOverviewRuler.errorForeground': p.danger,
      'editorOverviewRuler.warningForeground': p.warning,
      'editorOverviewRuler.infoForeground': p.info,
      'editorOverviewRuler.border': p.bg3,
      'editorOverviewRuler.findMatchForeground': p.warning,
      'editorOverviewRuler.selectionHighlightForeground': p.brand,

      // ───── Minimap ─────────────────────────────────────────────────────────
      'minimap.background': p.bg,
      'minimap.selectionHighlight': withAlpha(p.brand, 0.5),
      'minimap.findMatchHighlight': p.warning,
      'minimap.errorHighlight': p.danger,
      'minimap.warningHighlight': p.warning,
      'minimapSlider.background': withAlpha(p.fgTertiary, 0.2),
      'minimapSlider.hoverBackground': withAlpha(p.fgTertiary, 0.35),
      'minimapSlider.activeBackground': withAlpha(p.fgTertiary, 0.5),
      'minimapGutter.addedBackground': p.success,
      'minimapGutter.modifiedBackground': p.warning,
      'minimapGutter.deletedBackground': p.danger,

      // ───── Scrollbars ──────────────────────────────────────────────────────
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': withAlpha(p.fgTertiary, 0.25),
      'scrollbarSlider.hoverBackground': withAlpha(p.fgTertiary, 0.45),
      'scrollbarSlider.activeBackground': withAlpha(p.fgTertiary, 0.6),

      // ───── Find widget ─────────────────────────────────────────────────────
      // Match Arco popup elevation: bg-2 surface, border-base outline, soft shadow.
      'editorWidget.background': p.bg2,
      'editorWidget.foreground': p.fg,
      'editorWidget.border': p.bg3,
      'editorWidget.resizeBorder': p.brand,

      // Input fields inside widgets (find box, replace box, go-to-line input)
      'input.background': p.bg,
      'input.foreground': p.fg,
      'input.border': p.bg3,
      'input.placeholderForeground': p.fgTertiary,
      'inputOption.activeBackground': withAlpha(p.brand, 0.18),
      'inputOption.activeBorder': p.brand,
      'inputOption.activeForeground': p.brand,
      'inputValidation.errorBackground': withAlpha(p.danger, 0.16),
      'inputValidation.errorBorder': p.danger,
      'inputValidation.warningBackground': withAlpha(p.warning, 0.16),
      'inputValidation.warningBorder': p.warning,
      'inputValidation.infoBackground': withAlpha(p.info, 0.16),
      'inputValidation.infoBorder': p.info,

      // ───── Suggest / hover / parameter-hint widgets ────────────────────────
      'editorSuggestWidget.background': p.bg2,
      'editorSuggestWidget.border': p.bg3,
      'editorSuggestWidget.foreground': p.fg,
      'editorSuggestWidget.selectedBackground': withAlpha(p.brand, 0.18),
      'editorSuggestWidget.selectedForeground': p.fg,
      'editorSuggestWidget.highlightForeground': p.brand,
      'editorSuggestWidget.focusHighlightForeground': p.brand,
      'editorHoverWidget.background': p.bg2,
      'editorHoverWidget.border': p.bg3,
      'editorHoverWidget.foreground': p.fg,
      'editorHoverWidget.statusBarBackground': p.bg3,

      // ───── Lists (used inside suggest / quick-open / go-to-line) ────────────
      'list.hoverBackground': p.bg3,
      'list.hoverForeground': p.fg,
      'list.focusBackground': withAlpha(p.brand, 0.18),
      'list.focusForeground': p.fg,
      'list.activeSelectionBackground': withAlpha(p.brand, 0.2),
      'list.activeSelectionForeground': p.fg,
      'list.inactiveSelectionBackground': withAlpha(p.brand, 0.12),
      'list.inactiveSelectionForeground': p.fg,
      'list.highlightForeground': p.brand,

      // ───── Quick-input (go-to-line / command palette) ──────────────────────
      'quickInput.background': p.bg2,
      'quickInput.foreground': p.fg,
      'quickInputTitle.background': p.bg2,
      'pickerGroup.foreground': p.fgSecondary,
      'pickerGroup.border': p.bg3,

      // ───── Buttons (e.g. find widget toggles) ──────────────────────────────
      'button.background': p.brand,
      'button.foreground': '#ffffff',
      'button.hoverBackground': resolveCssVar('--brand-hover', p.brand),
      'button.secondaryBackground': p.bg3,
      'button.secondaryForeground': p.fg,

      // ───── Peek view (used by go-to-definition) ────────────────────────────
      'peekView.border': p.brand,
      'peekViewEditor.background': p.bg,
      'peekViewEditor.matchHighlightBackground': withAlpha(p.warning, 0.32),
      'peekViewEditorGutter.background': p.bg,
      'peekViewResult.background': p.bg2,
      'peekViewResult.fileForeground': p.fg,
      'peekViewResult.lineForeground': p.fgSecondary,
      'peekViewResult.matchHighlightBackground': withAlpha(p.warning, 0.32),
      'peekViewResult.selectionBackground': withAlpha(p.brand, 0.18),
      'peekViewResult.selectionForeground': p.fg,
      'peekViewTitle.background': p.bg2,
      'peekViewTitleLabel.foreground': p.fg,
      'peekViewTitleDescription.foreground': p.fgSecondary,

      // ───── Misc ────────────────────────────────────────────────────────────
      focusBorder: p.brand,
      foreground: p.fg,
      'icon.foreground': p.fgSecondary,
      'editorLink.activeForeground': p.brand,
      'editorGroup.border': p.bg3,
      'sash.hoverBorder': p.brand,
      contrastBorder: '#00000000',
    },
  });
}

let themesRegistered = false;

export function ensureAionuiThemesRegistered(): void {
  if (themesRegistered) return;
  themesRegistered = true;
  defineTheme(AIONUI_LIGHT_THEME, 'vs', FALLBACK_LIGHT);
  defineTheme(AIONUI_DARK_THEME, 'vs-dark', FALLBACK_DARK);
}

export function themeNameFor(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? AIONUI_DARK_THEME : AIONUI_LIGHT_THEME;
}
