/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ITheme } from '@xterm/xterm';

export const darkTerminalTheme: ITheme = {
  background: '#18181c',
  foreground: '#f3f4f6',
  cursor: '#818cf8',
  cursorAccent: '#18181c',
  selectionBackground: 'rgba(99, 102, 241, 0.3)',
  selectionInactiveBackground: 'rgba(99, 102, 241, 0.15)',
  black: '#1e1e24',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#f3f4f6',
  brightBlack: '#6b7280',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fde047',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
};

export const lightTerminalTheme: ITheme = {
  background: '#f9f9fb',
  foreground: '#1f2937',
  cursor: '#4f46e5',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(99, 102, 241, 0.25)',
  selectionInactiveBackground: 'rgba(99, 102, 241, 0.12)',
  black: '#1f2937',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#f3f4f6',
  brightBlack: '#9ca3af',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
};

export function getTerminalTheme(isDark: boolean): ITheme {
  return isDark ? darkTerminalTheme : lightTerminalTheme;
}
