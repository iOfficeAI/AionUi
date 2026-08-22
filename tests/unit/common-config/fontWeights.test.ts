import { describe, expect, it } from 'vitest';
import {
  FONT_WEIGHT_KEYS,
  FONT_WEIGHT_SPECS,
  FONT_WEIGHT_TIERS,
  SYSTEM_FONT_WEIGHT,
  defaultFontWeights,
  fontWeightConfigKey,
  sanitizeFontWeight,
} from '@/common/config/fontWeights';

describe('sanitizeFontWeight', () => {
  it('accepts a known standard tier unchanged', () => {
    expect(sanitizeFontWeight('400')).toBe('400');
    expect(sanitizeFontWeight('700')).toBe('700');
  });
  it('trims surrounding whitespace before matching', () => {
    expect(sanitizeFontWeight('  500  ')).toBe('500');
  });
  it('normalizes unknown / out-of-range / non-tier values to the no-override sentinel', () => {
    expect(sanitizeFontWeight('999')).toBe('');
    expect(sanitizeFontWeight('450')).toBe('');
    expect(sanitizeFontWeight('bold')).toBe('');
    expect(sanitizeFontWeight('')).toBe('');
  });
});

describe('fontWeightConfigKey', () => {
  it('maps a region to its ui.fontWeight.* config key', () => {
    expect(fontWeightConfigKey('app')).toBe('ui.fontWeight.app');
    expect(fontWeightConfigKey('code')).toBe('ui.fontWeight.code');
  });
});

describe('defaultFontWeights', () => {
  it('sets every region to the no-override sentinel', () => {
    const defaults = defaultFontWeights();
    expect(Object.keys(defaults).toSorted()).toEqual([...FONT_WEIGHT_KEYS].toSorted());
    for (const key of FONT_WEIGHT_KEYS) {
      expect(defaults[key]).toBe(SYSTEM_FONT_WEIGHT);
    }
  });
  it('returns a fresh object each call (no shared mutable state)', () => {
    const first = defaultFontWeights();
    first.chat = '700';
    expect(defaultFontWeights().chat).toBe(SYSTEM_FONT_WEIGHT);
  });
});

describe('FONT_WEIGHT_SPECS', () => {
  it('gives every key a distinct CSS custom property', () => {
    const vars = FONT_WEIGHT_KEYS.map((key) => FONT_WEIGHT_SPECS[key].cssVar);
    expect(new Set(vars).size).toBe(FONT_WEIGHT_KEYS.length);
  });
});

describe('FONT_WEIGHT_TIERS', () => {
  it('every tier is a valid numeric weight accepted by sanitizeFontWeight', () => {
    for (const tier of FONT_WEIGHT_TIERS) {
      expect(sanitizeFontWeight(tier.value)).toBe(tier.value);
      expect(tier.labelKey.startsWith('settings.fontWeight')).toBe(true);
    }
  });
});
