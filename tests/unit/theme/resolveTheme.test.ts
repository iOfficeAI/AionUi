import { describe, it, expect } from 'vitest';
import { resolveActiveTheme } from '@/common/theme/resolveTheme';
import { LIGHT_THEME_ID, DARK_THEME_ID, SYSTEM_THEME_ID } from '@/common/theme/constants';
import type { Theme } from '@/common/theme/types';

const mk = (id: string, appearance: 'light' | 'dark' = 'light'): Theme => ({
  id,
  name: id,
  appearance,
  builtin: true,
  created_at: 0,
  updated_at: 0,
});
const light = mk(LIGHT_THEME_ID);
const dark = mk(DARK_THEME_ID, 'dark');
const userTheme: Theme = {
  id: 'u1',
  name: 'Mine',
  appearance: 'dark',
  css: 'body{}',
  builtin: false,
  created_at: 1,
  updated_at: 1,
};
const themes = [light, dark, userTheme];

describe('resolveActiveTheme', () => {
  it('returns a theme by id', () => {
    expect(resolveActiveTheme(DARK_THEME_ID, themes).id).toBe(DARK_THEME_ID);
  });
  it('returns a user theme by id', () => {
    expect(resolveActiveTheme('u1', themes).id).toBe('u1');
  });
  it('falls back to Light when id is unknown', () => {
    expect(resolveActiveTheme('nope', themes).id).toBe(LIGHT_THEME_ID);
  });
  it('falls back to Light when id is empty', () => {
    expect(resolveActiveTheme('', themes).id).toBe(LIGHT_THEME_ID);
  });
  it('falls back to first theme when no Light present', () => {
    expect(resolveActiveTheme('nope', [dark, userTheme]).id).toBe(DARK_THEME_ID);
  });
  it('resolves system to Dark when prefersDark is true', () => {
    expect(resolveActiveTheme(SYSTEM_THEME_ID, themes, true).id).toBe(DARK_THEME_ID);
  });
  it('resolves system to Light when prefersDark is false', () => {
    expect(resolveActiveTheme(SYSTEM_THEME_ID, themes, false).id).toBe(LIGHT_THEME_ID);
  });
  it('resolves system to Light when prefersDark is undefined', () => {
    expect(resolveActiveTheme(SYSTEM_THEME_ID, themes).id).toBe(LIGHT_THEME_ID);
  });
  it('ignores prefersDark for non-system ids', () => {
    expect(resolveActiveTheme('u1', themes, true).id).toBe('u1');
    expect(resolveActiveTheme(LIGHT_THEME_ID, themes, true).id).toBe(LIGHT_THEME_ID);
  });
  it('falls back to Light when system resolves to a missing Dark theme', () => {
    expect(resolveActiveTheme(SYSTEM_THEME_ID, [light, userTheme], true).id).toBe(LIGHT_THEME_ID);
  });
});
