/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { migrateThemeConfig } from '@/common/theme/migrateThemeConfig';
import { LIGHT_THEME_ID, DARK_THEME_ID } from '@/common/theme/constants';

describe('migrateThemeConfig', () => {
  it('maps old css.activeThemeId default-theme to Light', () => {
    const out = migrateThemeConfig({
      theme: 'light',
      'css.activeThemeId': 'default-theme',
      'css.themes': [],
      customCss: '',
    });
    expect(out['theme.activeId']).toBe(LIGHT_THEME_ID);
  });
  it('maps a preset id through unchanged', () => {
    const out = migrateThemeConfig({
      theme: 'light',
      'css.activeThemeId': 'hello-kitty',
      'css.themes': [],
      customCss: '',
    });
    expect(out['theme.activeId']).toBe('hello-kitty');
  });
  it('uses dark toggle when no active css theme', () => {
    const out = migrateThemeConfig({ theme: 'dark', 'css.activeThemeId': '', 'css.themes': [], customCss: '' });
    expect(out['theme.activeId']).toBe(DARK_THEME_ID);
  });
  it('wraps old user themes verbatim as css-only', () => {
    const out = migrateThemeConfig({
      theme: 'dark',
      'css.activeThemeId': '',
      customCss: '',
      'css.themes': [{ id: 'u1', name: 'Mine', css: 'body{color:red}', created_at: 5, updated_at: 6 }],
    });
    const u = out['theme.userThemes'].find((t) => t.id === 'u1')!;
    expect(u.css).toBe('body{color:red}');
    expect(u.tokens).toBeUndefined();
    expect(u.appearance).toBe('dark');
    expect(u.builtin).toBe(false);
  });
});
