import { describe, expect, it } from 'vitest';
import { FONT_SIZE_SPECS, FONT_SIZE_KEYS, clampFontSize, defaultFontSizes } from '@/common/config/fontSizes';

describe('fontSizes', () => {
  it('exposes three keys with sane defaults', () => {
    expect(FONT_SIZE_KEYS).toEqual(['chat', 'markdown', 'code']);
    expect(defaultFontSizes()).toEqual({ chat: 14, markdown: 13, code: 12 });
  });

  it('clamps below min and above max per key', () => {
    expect(clampFontSize('chat', 4)).toBe(FONT_SIZE_SPECS.chat.min);
    expect(clampFontSize('chat', 999)).toBe(FONT_SIZE_SPECS.chat.max);
    expect(clampFontSize('code', 4)).toBe(10);
    expect(clampFontSize('code', 999)).toBe(18);
  });

  it('rounds to integer px and falls back to default on NaN', () => {
    expect(clampFontSize('markdown', 15.6)).toBe(16);
    expect(clampFontSize('markdown', Number.NaN)).toBe(13);
    expect(clampFontSize('markdown', Infinity)).toBe(FONT_SIZE_SPECS.markdown.max);
  });
});
