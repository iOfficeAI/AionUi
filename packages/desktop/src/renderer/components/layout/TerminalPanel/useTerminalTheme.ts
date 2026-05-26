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

/** Reasonable ANSI palette aligned with Arco-style brand hues. */
const ANSI_PALETTE_DARK = {
  black: '#1f2329',
  red: '#f76560',
  green: '#5fb878',
  yellow: '#f7ba1e',
  blue: '#3491fa',
  magenta: '#a871df',
  cyan: '#86e8ff',
  white: '#c2c7d0',
  brightBlack: '#4e5969',
  brightRed: '#f76965',
  brightGreen: '#7be188',
  brightYellow: '#fadc6b',
  brightBlue: '#5aa6ff',
  brightMagenta: '#c990ff',
  brightCyan: '#a3eeff',
  brightWhite: '#f2f3f5',
} as const;

const ANSI_PALETTE_LIGHT = {
  black: '#1f2329',
  red: '#cb272d',
  green: '#187a3a',
  yellow: '#a06000',
  blue: '#1d4ed8',
  magenta: '#7c3aed',
  cyan: '#0891b2',
  white: '#4e5969',
  brightBlack: '#86909c',
  brightRed: '#e02c2c',
  brightGreen: '#1e8a3c',
  brightYellow: '#b97000',
  brightBlue: '#2563eb',
  brightMagenta: '#9333ea',
  brightCyan: '#0e7490',
  brightWhite: '#1f2329',
} as const;

const FALLBACK_BG_DARK = '#17171a';
const FALLBACK_BG_LIGHT = '#ffffff';
const FALLBACK_FG_DARK = '#e5e6eb';
const FALLBACK_FG_LIGHT = '#1d2129';

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
    const cursor = resolveVar('--brand', isDark ? '#5aa6ff' : '#3491fa');

    return {
      background,
      foreground,
      cursor,
      cursorAccent: background,
      selectionBackground: isDark ? 'rgba(90, 166, 255, 0.35)' : 'rgba(52, 145, 250, 0.25)',
      ...palette,
    };
    // `tick` participates so the memo re-runs on CSS variable updates.
  }, [theme, tick]);
}
