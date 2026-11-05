/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  darkTerminalTheme,
  getTerminalTheme,
  lightTerminalTheme,
} from '@/renderer/pages/conversation/Terminal/terminalTheme';

describe('terminalTheme', () => {
  it('returns darkTerminalTheme when isDark is true', () => {
    const theme = getTerminalTheme(true);
    expect(theme).toBe(darkTerminalTheme);
    expect(theme.background).toBe('#18181c');
    expect(theme.foreground).toBe('#f3f4f6');
  });

  it('returns lightTerminalTheme when isDark is false', () => {
    const theme = getTerminalTheme(false);
    expect(theme).toBe(lightTerminalTheme);
    expect(theme.background).toBe('#f9f9fb');
    expect(theme.foreground).toBe('#1f2937');
  });

  it('provides complete ANSI color mappings in both themes', () => {
    for (const theme of [darkTerminalTheme, lightTerminalTheme]) {
      expect(theme.black).toBeTruthy();
      expect(theme.red).toBeTruthy();
      expect(theme.green).toBeTruthy();
      expect(theme.yellow).toBeTruthy();
      expect(theme.blue).toBeTruthy();
      expect(theme.magenta).toBeTruthy();
      expect(theme.cyan).toBeTruthy();
      expect(theme.white).toBeTruthy();
    }
  });
});
