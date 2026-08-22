import { describe, expect, it, beforeEach } from 'vitest';
import { applyFontWeights } from '@renderer/utils/theme/applyFontWeights';
import { defaultFontWeights } from '@/common/config/fontWeights';

beforeEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('applyFontWeights', () => {
  it('writes the chosen weight to each region CSS var', () => {
    applyFontWeights({ app: '500', chat: '600', markdown: '300', code: '700' });
    expect(document.documentElement.style.getPropertyValue('--app-font-weight')).toBe('500');
    expect(document.documentElement.style.getPropertyValue('--chat-font-weight')).toBe('600');
    expect(document.documentElement.style.getPropertyValue('--md-font-weight')).toBe('300');
    expect(document.documentElement.style.getPropertyValue('--code-font-weight')).toBe('700');
  });

  it('removes the property for the no-override sentinel so the CSS default takes over', () => {
    applyFontWeights({ ...defaultFontWeights(), chat: '600' });
    expect(document.documentElement.style.getPropertyValue('--chat-font-weight')).toBe('600');
    applyFontWeights(defaultFontWeights());
    expect(document.documentElement.style.getPropertyValue('--chat-font-weight')).toBe('');
  });

  it('treats an unknown / out-of-range weight as no override (removes the property)', () => {
    applyFontWeights({ ...defaultFontWeights(), app: '999' });
    expect(document.documentElement.style.getPropertyValue('--app-font-weight')).toBe('');
  });
});
