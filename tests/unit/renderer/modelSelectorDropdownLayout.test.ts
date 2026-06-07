import { describe, expect, it } from 'vitest';
import { computeModelListHeight } from '@/renderer/components/agent/modelSelectorDropdownLayout';

describe('computeModelListHeight', () => {
  it('reserves chrome for search and padding', () => {
    expect(computeModelListHeight(520, false)).toBe(458);
  });

  it('reserves extra space when footer is present', () => {
    expect(computeModelListHeight(520, true)).toBe(414);
  });

  it('never returns less than 120px', () => {
    expect(computeModelListHeight(100, true)).toBe(120);
  });
});
