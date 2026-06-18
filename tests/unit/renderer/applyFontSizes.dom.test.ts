import { describe, expect, it, beforeEach } from 'vitest';
import { applyFontSizes } from '@renderer/utils/theme/applyFontSizes';

describe('applyFontSizes', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
  });

  it('writes clamped px values to the matching CSS variables', () => {
    applyFontSizes({ chat: 18, markdown: 14, code: 13 });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--chat-font-size')).toBe('18px');
    expect(style.getPropertyValue('--md-font-size')).toBe('14px');
    expect(style.getPropertyValue('--code-font-size')).toBe('13px');
  });

  it('clamps out-of-range values before writing', () => {
    applyFontSizes({ chat: 999, markdown: 1, code: 1 });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--chat-font-size')).toBe('22px');
    expect(style.getPropertyValue('--md-font-size')).toBe('12px');
    expect(style.getPropertyValue('--code-font-size')).toBe('10px');
  });
});
