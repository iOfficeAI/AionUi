import { describe, expect, it } from 'vitest';
import { getScrollTopForActiveItem } from '@/renderer/hooks/chat/useSlashCommandController';

describe('getScrollTopForActiveItem', () => {
  it('keeps scroll position when active item is already visible', () => {
    const next = getScrollTopForActiveItem({
      containerScrollTop: 80,
      containerHeight: 200,
      itemOffsetTop: 120,
      itemOffsetHeight: 32,
    });

    expect(next).toBe(80);
  });

  it('scrolls up when active item is above viewport', () => {
    const next = getScrollTopForActiveItem({
      containerScrollTop: 120,
      containerHeight: 200,
      itemOffsetTop: 40,
      itemOffsetHeight: 32,
    });

    expect(next).toBe(40);
  });

  it('scrolls down when active item is below viewport', () => {
    const next = getScrollTopForActiveItem({
      containerScrollTop: 100,
      containerHeight: 200,
      itemOffsetTop: 340,
      itemOffsetHeight: 32,
    });

    expect(next).toBe(172);
  });
});
