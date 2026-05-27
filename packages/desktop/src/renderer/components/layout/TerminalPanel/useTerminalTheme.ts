/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Maps the active AionUi theme to an xterm.js `ITheme`.
 *
 * Reads CSS variables (`--bg-1`, `--text-primary`, etc.) at render time so the
 * terminal palette stays in sync with the rest of the app. We deliberately
 * resolve to concrete hex values via `getComputedStyle` because xterm.js does
 * not accept CSS variable references.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ITheme } from '@xterm/xterm';

import { useThemeContext } from '@renderer/hooks/context/ThemeContext';

const ANSI_PALETTE_DARK = {
  black: '#282828',
  red: '#cc241d',
  green: '#98971a',
  yellow: '#d79921',
  blue: '#458588',
  magenta: '#b16286',
  cyan: '#689d6a',
  white: '#a89984',
  brightBlack: '#928374',
  brightRed: '#fb4934',
  brightGreen: '#b8bb26',
  brightYellow: '#fabd2f',
  brightBlue: '#83a598',
  brightMagenta: '#d3869b',
  brightCyan: '#8ec07c',
  brightWhite: '#ebdbb2',
} as const;

const ANSI_PALETTE_LIGHT = {
  black: '#fbf1c7',
  red: '#9d0006',
  green: '#79740e',
  yellow: '#b57614',
  blue: '#076678',
  magenta: '#8f3f71',
  cyan: '#427b58',
  white: '#3c3836',
  brightBlack: '#928374',
  brightRed: '#9d0006',
  brightGreen: '#79740e',
  brightYellow: '#b57614',
  brightBlue: '#076678',
  brightMagenta: '#8f3f71',
  brightCyan: '#427b58',
  brightWhite: '#282828',
} as const;

const FALLBACK_BG_DARK = '#282828';
const FALLBACK_BG_LIGHT = '#fbf1c7';
const FALLBACK_FG_DARK = '#ebdbb2';
const FALLBACK_FG_LIGHT = '#3c3836';

function resolveVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function useTerminalTheme(): ITheme {
  const { theme } = useThemeContext();
  // Re-resolve when the theme attribute on <html> changes, so the palette
  // updates immediately when the user switches modes.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const obs = new MutationObserver(() => setTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return useMemo<ITheme>(() => {
    const isDark = theme === 'dark';
    const palette = isDark ? ANSI_PALETTE_DARK : ANSI_PALETTE_LIGHT;
    const fallbackBg = isDark ? FALLBACK_BG_DARK : FALLBACK_BG_LIGHT;
    const fallbackFg = isDark ? FALLBACK_FG_DARK : FALLBACK_FG_LIGHT;

    const background = resolveVar('--bg-1', fallbackBg);
    const foreground = resolveVar('--text-primary', fallbackFg);
    const cursor = resolveVar('--brand', isDark ? '#d3869b' : '#8f3f71');

    return {
      background,
      foreground,
      cursor,
      cursorAccent: background,
      selectionBackground: isDark ? 'rgba(211, 134, 155, 0.35)' : 'rgba(143, 63, 113, 0.25)',
      ...palette,
    };
    // `tick` participates so the memo re-runs on CSS variable updates.
  }, [theme, tick]);
}
