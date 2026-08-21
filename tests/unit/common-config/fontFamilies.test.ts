import { describe, expect, it } from 'vitest';
import {
  FONT_FAMILY_KEYS,
  FONT_FAMILY_SPECS,
  SYSTEM_FONT_FAMILY,
  cssFontFamilyValue,
  defaultFontFamilies,
  fontFamilyConfigKey,
  sanitizeFontFamily,
} from '@/common/config/fontFamilies';

describe('sanitizeFontFamily', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeFontFamily('  Fira Code  ')).toBe('Fira Code');
  });
  it('collapses CR/LF runs into a single space so the CSS string cannot break', () => {
    expect(sanitizeFontFamily('Fira\nCode')).toBe('Fira Code');
    expect(sanitizeFontFamily('a\r\n\r\nb')).toBe('a b');
  });
  it('normalizes an all-whitespace value to the empty (no-override) string', () => {
    expect(sanitizeFontFamily('   ')).toBe('');
    expect(sanitizeFontFamily('\n\n')).toBe('');
  });
});

describe('cssFontFamilyValue', () => {
  it('quotes the family and appends the region generic', () => {
    expect(cssFontFamilyValue('code', 'Fira Code')).toBe('"Fira Code", monospace');
    expect(cssFontFamilyValue('chat', 'Inter')).toBe('"Inter", sans-serif');
  });
  it('returns "" for an empty / whitespace family (caller removes the property)', () => {
    expect(cssFontFamilyValue('app', '')).toBe('');
    expect(cssFontFamilyValue('app', '   ')).toBe('');
  });
  it('escapes double quotes and backslashes so the value cannot escape the CSS string', () => {
    expect(cssFontFamilyValue('markdown', 'Ev"il')).toBe('"Ev\\"il", sans-serif');
    expect(cssFontFamilyValue('markdown', 'back\\slash')).toBe('"back\\\\slash", sans-serif');
  });
  it('uses monospace only for the code region, sans-serif elsewhere', () => {
    for (const key of FONT_FAMILY_KEYS) {
      const value = cssFontFamilyValue(key, 'X');
      expect(value.endsWith(key === 'code' ? 'monospace' : 'sans-serif')).toBe(true);
    }
  });
});

describe('fontFamilyConfigKey', () => {
  it('maps a region to its ui.fontFamily.* config key', () => {
    expect(fontFamilyConfigKey('app')).toBe('ui.fontFamily.app');
    expect(fontFamilyConfigKey('code')).toBe('ui.fontFamily.code');
  });
});

describe('defaultFontFamilies', () => {
  it('sets every region to the no-override sentinel', () => {
    const defaults = defaultFontFamilies();
    expect(Object.keys(defaults).toSorted()).toEqual([...FONT_FAMILY_KEYS].toSorted());
    for (const key of FONT_FAMILY_KEYS) {
      expect(defaults[key]).toBe(SYSTEM_FONT_FAMILY);
    }
  });
  it('returns a fresh object each call (no shared mutable state)', () => {
    const first = defaultFontFamilies();
    first.chat = 'X';
    expect(defaultFontFamilies().chat).toBe(SYSTEM_FONT_FAMILY);
  });
});

describe('FONT_FAMILY_SPECS', () => {
  it('gives every key a distinct CSS custom property', () => {
    const vars = FONT_FAMILY_KEYS.map((key) => FONT_FAMILY_SPECS[key].cssVar);
    expect(new Set(vars).size).toBe(FONT_FAMILY_KEYS.length);
  });
});
