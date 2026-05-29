/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Custom Monaco themes bound to the UnoCSS semantic tokens (`--bg-*`,
 * `--text-*`, `--brand`). Avoids the default `vs` / `vs-dark` themes which
 * look generic next to the Arco shell. We resolve the actual color values
 * from CSS variables at theme-define time so future token tweaks flow
 * through without code changes here.
 */

import * as monaco from 'monaco-editor';

export const AIONUI_LIGHT_THEME = 'aionui-light';
export const AIONUI_DARK_THEME = 'aionui-dark';

const FALLBACK_LIGHT = {
  bg: '#ffffff',
  fg: '#1f2329',
  cursor: '#1f2329',
  selection: '#c6e0ff',
  lineHighlight: '#f2f3f5',
  gutterBg: '#ffffff',
  gutterFg: '#a9aeb8',
  brand: '#165dff',
};

const FALLBACK_DARK = {
  bg: '#17171a',
  fg: '#e5e6eb',
  cursor: '#e5e6eb',
  selection: '#1d4f8c',
  lineHighlight: '#232324',
  gutterBg: '#17171a',
  gutterFg: '#86909c',
  brand: '#4080ff',
};

function resolveCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return fallback;
  // Accept already-hex / rgb / hsl values verbatim. Monaco insists on hex with
  // a leading `#`, so when we get an `rgb(...)` value we hand-convert it.
  if (value.startsWith('#')) return value;
  if (value.startsWith('rgb')) return rgbToHex(value) ?? fallback;
  if (value.startsWith('hsl')) return fallback;
  return value;
}

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((c) => Number.parseInt(c, 10));
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function defineTheme(
  name: string,
  base: 'vs' | 'vs-dark',
  fb: typeof FALLBACK_LIGHT
): void {
  monaco.editor.defineTheme(name, {
    base,
    inherit: true,
    rules: [],
    colors: {
      'editor.background': resolveCssVar('--bg-1', fb.bg),
      'editor.foreground': resolveCssVar('--text-primary', fb.fg),
      'editorCursor.foreground': resolveCssVar('--text-primary', fb.cursor),
      'editor.selectionBackground': fb.selection,
      'editor.lineHighlightBackground': resolveCssVar('--bg-2', fb.lineHighlight),
      'editorLineNumber.foreground': resolveCssVar('--text-secondary', fb.gutterFg),
      'editorLineNumber.activeForeground': resolveCssVar('--text-primary', fb.fg),
      'editorGutter.background': resolveCssVar('--bg-1', fb.gutterBg),
      'editorIndentGuide.background': resolveCssVar('--bg-3', fb.lineHighlight),
      'editorWhitespace.foreground': resolveCssVar('--bg-3', fb.lineHighlight),
      focusBorder: resolveCssVar('--brand', fb.brand),
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
