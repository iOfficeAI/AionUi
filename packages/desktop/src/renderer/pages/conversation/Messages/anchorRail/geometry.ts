/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Rendered height of one tick, in px. Mirrors `.tick` in the rail stylesheet. */
export const TICK_HEIGHT = 2;

/**
 * Spacing between ticks. Fixed, never derived from the rail's height.
 *
 * The rail is a jump target, not an overview: what matters is that a pointer can
 * land on a tick comfortably, not that the whole conversation fits on screen at
 * once. Squeezing the gap to fit more ticks makes them read as one solid bar and
 * makes the lifted selection impossible to pick out — so instead of compressing,
 * a long conversation scrolls (see `resolveStackTop` / the rail's scroll host).
 */
export const TICK_GAP = 10;

/**
 * Vertical space the search button occupies at the head of the stack.
 *
 * The band is carved out of the rail rather than overlaid on it, so the button
 * never sits on top of a tick and hovering it cannot magnet-select one.
 *
 * Sized to fit the 16px button *plus* the "more above" hint that appears between
 * it and the ticks once the rail scrolls. At 26px the hint collided with the
 * button by 4px; the band now reserves room for both so the two never overlap.
 */
export const SEARCH_BUTTON_BAND = 38;

/**
 * Most ticks the rail will ever show at once.
 *
 * A rail that grows to full height becomes a wall of near-identical lines: it
 * stops reading as a short list of jump targets and starts reading as noise, and
 * picking one out of fifty is harder than picking one out of twenty. So the strip
 * stays deliberately compact and anything beyond this scrolls, regardless of how
 * tall the window is.
 */
export const MAX_VISIBLE_TICKS = 20;

const TICK_STRIDE = TICK_HEIGHT + TICK_GAP;

/** Tallest the tick viewport is ever allowed to get. */
export const MAX_VIEWPORT_HEIGHT = MAX_VISIBLE_TICKS * TICK_HEIGHT + (MAX_VISIBLE_TICKS - 1) * TICK_GAP;

/**
 * Total height the tick stack occupies. There is one gap *between* ticks, so a
 * single tick takes no gap at all.
 */
export const tickStackHeight = (count: number): number => {
  if (count <= 0) return 0;
  return count * TICK_HEIGHT + Math.max(0, count - 1) * TICK_GAP;
};

/** Offset of a tick's vertical centre, measured from the top of the stack. */
export const tickCenterOffset = (index: number): number => index * TICK_STRIDE + TICK_HEIGHT / 2;

/**
 * Height the rail's scroll viewport gets.
 *
 * Bounded twice over: it never exceeds what the search button leaves behind (so
 * it cannot overflow a short rail), and never exceeds `MAX_VIEWPORT_HEIGHT` (so a
 * tall window does not turn the strip into a wall of ticks). Whichever limit is
 * tighter wins, and a short conversation shrinks below both.
 */
export const resolveViewportHeight = (railHeight: number, count = MAX_VISIBLE_TICKS): number => {
  const available = Math.max(0, railHeight - SEARCH_BUTTON_BAND);
  return Math.min(available, MAX_VIEWPORT_HEIGHT, Math.max(0, tickStackHeight(count)));
};

/**
 * Whether the stack has to scroll to stay at a comfortable gap.
 *
 * Short conversations sit static; only once the ticks genuinely exceed the
 * (capped) viewport do we hand over to scrolling, so the common case never grows
 * a scrollbar it does not need.
 */
export const needsScroll = (railHeight: number, count: number): boolean =>
  tickStackHeight(count) > resolveViewportHeight(railHeight, count);

/**
 * Top offset of the search button.
 *
 * The button leads the strip and the pair is always centred in the rail: because
 * the viewport is capped, the group stays compact even for a long conversation,
 * so there is no case where centring would strand the button far from its ticks.
 */
export const resolveSearchButtonTop = (railHeight: number, count: number): number => {
  const group = SEARCH_BUTTON_BAND + resolveViewportHeight(railHeight, count);
  return Math.max(0, (railHeight - group) / 2);
};

/**
 * Top offset of the tick viewport: directly under the search button.
 */
export const resolveStackTop = (railHeight: number, count: number): number =>
  resolveSearchButtonTop(railHeight, count) + SEARCH_BUTTON_BAND;

/**
 * Map a pointer offset (relative to the top of the tick *stack*, i.e. already
 * corrected for any scroll) onto the nearest tick. This is what makes the rail
 * forgiving: the pointer never has to land on a tick, only somewhere in the
 * rail's column, and the closest tick wins.
 * Returns null only when there is nothing to select.
 */
export const resolveTickIndexAtOffset = (offsetY: number, count: number): number | null => {
  if (count <= 0) return null;
  const raw = Math.round((offsetY - TICK_HEIGHT / 2) / TICK_STRIDE);
  return Math.min(count - 1, Math.max(0, raw));
};

/**
 * Scroll offset that brings `index` into view, clamped to the scrollable range.
 * Used to follow the conversation as new turns arrive and to keep a
 * keyboard-focused tick on screen.
 */
export const resolveScrollTopForIndex = (index: number, count: number, viewportHeight: number): number => {
  const maxScroll = Math.max(0, tickStackHeight(count) - viewportHeight);
  const centred = tickCenterOffset(index) - viewportHeight / 2;
  return Math.min(maxScroll, Math.max(0, centred));
};
