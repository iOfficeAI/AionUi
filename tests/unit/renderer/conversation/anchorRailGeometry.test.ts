/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MAX_VIEWPORT_HEIGHT,
  MAX_VISIBLE_TICKS,
  SEARCH_BUTTON_BAND,
  TICK_GAP,
  TICK_HEIGHT,
  needsScroll,
  resolveScrollTopForIndex,
  resolveSearchButtonTop,
  resolveStackTop,
  resolveTickIndexAtOffset,
  resolveViewportHeight,
  tickCenterOffset,
  tickStackHeight,
} from '@/renderer/pages/conversation/Messages/anchorRail/geometry';
import { describe, expect, it } from 'vitest';

const STRIDE = TICK_HEIGHT + TICK_GAP;

describe('tickStackHeight', () => {
  it('is zero when there is nothing to render', () => {
    expect(tickStackHeight(0)).toBe(0);
    expect(tickStackHeight(-1)).toBe(0);
  });

  it('charges no gap for a single tick', () => {
    expect(tickStackHeight(1)).toBe(TICK_HEIGHT);
  });

  it('counts one gap between each pair of ticks', () => {
    expect(tickStackHeight(2)).toBe(TICK_HEIGHT * 2 + TICK_GAP);
    expect(tickStackHeight(5)).toBe(TICK_HEIGHT * 5 + TICK_GAP * 4);
  });

  it('grows linearly with the tick count — spacing never compresses', () => {
    // This is the whole point of the fixed gap: 50 ticks take exactly the room
    // 50 ticks need, and a short rail scrolls rather than squeezing them.
    expect(tickStackHeight(50)).toBe(TICK_HEIGHT * 50 + TICK_GAP * 49);
    expect(tickStackHeight(100) - tickStackHeight(50)).toBe(STRIDE * 50);
  });
});

describe('tickCenterOffset', () => {
  it('centres the first tick on its own height', () => {
    expect(tickCenterOffset(0)).toBe(TICK_HEIGHT / 2);
  });

  it('advances by one stride per tick', () => {
    expect(tickCenterOffset(1)).toBe(STRIDE + TICK_HEIGHT / 2);
    expect(tickCenterOffset(4)).toBe(STRIDE * 4 + TICK_HEIGHT / 2);
  });
});

describe('resolveViewportHeight', () => {
  it('caps the strip so a tall window never becomes a wall of ticks', () => {
    // The rail has ~1000px of room here, but the strip stays compact on purpose.
    expect(resolveViewportHeight(1024, 500)).toBe(MAX_VIEWPORT_HEIGHT);
    expect(resolveViewportHeight(1024, 500)).toBe(tickStackHeight(MAX_VISIBLE_TICKS));
  });

  it('shrinks to fit a short conversation rather than reserving the cap', () => {
    expect(resolveViewportHeight(1024, 3)).toBe(tickStackHeight(3));
  });

  it('still yields to a rail too short for the cap', () => {
    const railHeight = SEARCH_BUTTON_BAND + 40;
    expect(resolveViewportHeight(railHeight, 500)).toBe(40);
  });

  it('never goes negative on a rail shorter than the button band', () => {
    expect(resolveViewportHeight(10, 500)).toBe(0);
    expect(resolveViewportHeight(0, 500)).toBe(0);
  });
});

describe('needsScroll', () => {
  it('is false while the conversation fits the capped strip', () => {
    expect(needsScroll(1024, 2)).toBe(false);
    expect(needsScroll(1024, MAX_VISIBLE_TICKS)).toBe(false);
  });

  it('is true as soon as the conversation outgrows the cap, however tall the rail', () => {
    // A tall window must not defeat the cap by simply showing more ticks.
    expect(needsScroll(1024, MAX_VISIBLE_TICKS + 1)).toBe(true);
    expect(needsScroll(2000, 50)).toBe(true);
  });

  it('is true for a long conversation on a short rail', () => {
    // The case that used to overflow the rail and make later anchors unreachable.
    expect(needsScroll(238, 51)).toBe(true);
  });
});

describe('resolveStackTop / resolveSearchButtonTop', () => {
  const RAIL = 600;

  it('keeps the viewport directly below the button, never overlapping it', () => {
    for (const count of [2, 10, 50, 200]) {
      expect(resolveStackTop(RAIL, count) - resolveSearchButtonTop(RAIL, count)).toBe(SEARCH_BUTTON_BAND);
    }
  });

  it('centres button and strip as one group, short conversation or long', () => {
    for (const count of [10, 200]) {
      const buttonTop = resolveSearchButtonTop(RAIL, count);
      const stackTop = resolveStackTop(RAIL, count);
      const viewport = resolveViewportHeight(RAIL, count);
      expect(buttonTop).toBeGreaterThan(0);
      // Equal breathing room above the button and below the strip.
      expect(buttonTop).toBeCloseTo(RAIL - (stackTop + viewport));
    }
  });

  it('keeps the strip compact rather than filling a tall rail', () => {
    const tall = 1024;
    expect(resolveViewportHeight(tall, 200)).toBe(MAX_VIEWPORT_HEIGHT);
    // ...and it sits centred, not stretched from the top edge.
    expect(resolveSearchButtonTop(tall, 200)).toBeGreaterThan(0);
  });

  it('never lets the viewport ride up under the button', () => {
    expect(resolveStackTop(40, 200)).toBe(SEARCH_BUTTON_BAND);
    expect(resolveStackTop(0, 2)).toBe(SEARCH_BUTTON_BAND);
  });
});

describe('resolveScrollTopForIndex', () => {
  const COUNT = 100;
  const VIEWPORT = MAX_VIEWPORT_HEIGHT;
  const MAX_SCROLL = tickStackHeight(COUNT) - VIEWPORT;

  it('never scrolls above the top of the stack', () => {
    expect(resolveScrollTopForIndex(0, COUNT, VIEWPORT)).toBe(0);
    expect(resolveScrollTopForIndex(1, COUNT, VIEWPORT)).toBe(0);
  });

  it('never scrolls past the end of the stack', () => {
    expect(resolveScrollTopForIndex(COUNT - 1, COUNT, VIEWPORT)).toBe(MAX_SCROLL);
  });

  it('centres a mid-stack tick in the viewport', () => {
    const index = 50;
    const scrollTop = resolveScrollTopForIndex(index, COUNT, VIEWPORT);
    // The tick lands on the viewport's midline...
    expect(tickCenterOffset(index) - scrollTop).toBeCloseTo(VIEWPORT / 2);
    // ...and stays inside the scrollable range.
    expect(scrollTop).toBeGreaterThanOrEqual(0);
    expect(scrollTop).toBeLessThanOrEqual(MAX_SCROLL);
  });

  it('stays at zero when the stack does not overflow', () => {
    // Nothing to scroll, so every index resolves to the top.
    expect(resolveScrollTopForIndex(3, 5, 400)).toBe(0);
  });
});

describe('resolveTickIndexAtOffset', () => {
  it('returns null when there are no anchors to select', () => {
    expect(resolveTickIndexAtOffset(40, 0)).toBeNull();
  });

  it('snaps to the nearest tick rather than requiring a direct hit', () => {
    // Just past the first tick's centre still belongs to the first tick.
    expect(resolveTickIndexAtOffset(TICK_HEIGHT / 2 + 1, 5)).toBe(0);
    // Landing in the gap picks whichever tick is closer.
    expect(resolveTickIndexAtOffset(STRIDE * 2 + TICK_HEIGHT / 2, 5)).toBe(2);
  });

  it('clamps to the ends instead of returning an out-of-range index', () => {
    expect(resolveTickIndexAtOffset(-500, 5)).toBe(0);
    expect(resolveTickIndexAtOffset(50_000, 5)).toBe(4);
  });

  it('stays consistent with tickCenterOffset for every tick', () => {
    const count = 60;
    for (let index = 0; index < count; index += 1) {
      expect(resolveTickIndexAtOffset(tickCenterOffset(index), count)).toBe(index);
    }
  });

  it('keeps every tick of a long conversation selectable', () => {
    // The regression this replaces: ticks used to be compressed and then clipped,
    // so the tail of a long conversation could not be hovered at all.
    const count = 200;
    expect(resolveTickIndexAtOffset(tickCenterOffset(count - 1), count)).toBe(count - 1);
  });
});

describe('scroll hint visibility', () => {
  // The hints mirror what the component derives from scroll position. Pinning the
  // arithmetic here documents the rule: a hint shows only while that direction
  // still has anchors left, so a fully-scrolled rail never lies about its extent.
  const RAIL = 400;
  const COUNT = 100;
  const viewport = resolveViewportHeight(RAIL, COUNT);
  const stack = tickStackHeight(COUNT);
  const maxScroll = stack - viewport;

  const hints = (scrollTop: number) => ({
    up: scrollTop > 1,
    down: scrollTop + viewport < stack - 1,
  });

  it('offers only "down" at the very top', () => {
    expect(hints(0)).toEqual({ up: false, down: true });
  });

  it('offers both while in the middle', () => {
    expect(hints(Math.floor(maxScroll / 2))).toEqual({ up: true, down: true });
  });

  it('offers only "up" at the very bottom', () => {
    expect(hints(maxScroll)).toEqual({ up: true, down: false });
  });

  it('offers neither when the stack fits and cannot scroll', () => {
    const shortCount = 3;
    const fitViewport = resolveViewportHeight(RAIL, shortCount);
    expect(needsScroll(RAIL, shortCount)).toBe(false);
    expect(tickStackHeight(shortCount) - fitViewport).toBeLessThanOrEqual(0);
  });
});

describe('pointer selection survives scrolling', () => {
  // Item 3: the pointer does not move, but scrolling slides a different tick under
  // it. Selection must follow the wheel rather than riding away with the stack.
  const COUNT = 100;

  it('resolves a different tick for the same pointer position after scrolling', () => {
    const pointerY = 50;
    const before = resolveTickIndexAtOffset(pointerY + 0, COUNT);
    const after = resolveTickIndexAtOffset(pointerY + 120, COUNT);
    expect(before).not.toBe(after);
    expect(after).toBeGreaterThan(before as number);
  });

  it('keeps tracking the tick actually under the pointer at any scroll offset', () => {
    const pointerY = 30;
    for (const scrollTop of [0, 60, 240, 600]) {
      const index = resolveTickIndexAtOffset(pointerY + scrollTop, COUNT);
      // The selected tick's centre lands within half a stride of the pointer.
      const centreInViewport = tickCenterOffset(index as number) - scrollTop;
      expect(Math.abs(centreInViewport - pointerY)).toBeLessThanOrEqual(STRIDE / 2 + 1);
    }
  });
});

describe('search button band leaves room for the scroll hint', () => {
  // Regression: at 26px the band fitted the 16px button but not the "more above"
  // hint that appears between it and the ticks, so the two overlapped by 4px.
  const BUTTON_HEIGHT = 16;
  const HINT_HEIGHT = 7;

  it('fits the button and the hint without them colliding', () => {
    expect(SEARCH_BUTTON_BAND).toBeGreaterThanOrEqual(BUTTON_HEIGHT + HINT_HEIGHT);
  });

  it('leaves breathing room between the button, the hint and the first tick', () => {
    const slack = SEARCH_BUTTON_BAND - BUTTON_HEIGHT - HINT_HEIGHT;
    // Enough to read as separate elements rather than a smudge...
    expect(slack).toBeGreaterThanOrEqual(4);
    // ...without the button drifting so far it stops reading as the stack's head.
    expect(SEARCH_BUTTON_BAND).toBeLessThanOrEqual(56);
  });

  it('still places the viewport clear of the band', () => {
    for (const count of [2, 20, 200]) {
      expect(resolveStackTop(600, count) - resolveSearchButtonTop(600, count)).toBe(SEARCH_BUTTON_BAND);
    }
  });
});
