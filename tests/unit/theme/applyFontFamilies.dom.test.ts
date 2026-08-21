import { describe, expect, it, beforeEach } from 'vitest';
import { applyFontFamilies } from '@renderer/utils/theme/applyFontFamilies';
import { defaultFontFamilies } from '@/common/config/fontFamilies';

beforeEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('applyFontFamilies', () => {
  it('writes a quoted font-family with the monospace fallback for the code region', () => {
    applyFontFamilies({ ...defaultFontFamilies(), code: 'Fira Code' });
    expect(document.documentElement.style.getPropertyValue('--code-font-family')).toBe('"Fira Code", monospace');
  });

  it('uses the sans-serif fallback and correct CSS var for each non-code region', () => {
    applyFontFamilies({ app: 'Roboto', chat: 'Inter', markdown: 'Lora', code: '' });
    expect(document.documentElement.style.getPropertyValue('--app-font-family')).toBe('"Roboto", sans-serif');
    expect(document.documentElement.style.getPropertyValue('--chat-font-family')).toBe('"Inter", sans-serif');
    expect(document.documentElement.style.getPropertyValue('--md-font-family')).toBe('"Lora", sans-serif');
  });

  it('removes the property for the no-override sentinel so the CSS default takes over', () => {
    applyFontFamilies({ ...defaultFontFamilies(), chat: 'Inter' });
    expect(document.documentElement.style.getPropertyValue('--chat-font-family')).toBe('"Inter", sans-serif');
    applyFontFamilies(defaultFontFamilies());
    expect(document.documentElement.style.getPropertyValue('--chat-font-family')).toBe('');
  });

  it('treats a whitespace-only family as no override (removes the property)', () => {
    applyFontFamilies({ ...defaultFontFamilies(), app: '   ' });
    expect(document.documentElement.style.getPropertyValue('--app-font-family')).toBe('');
  });
});
