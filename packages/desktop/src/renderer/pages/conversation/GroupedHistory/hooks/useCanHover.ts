/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore } from 'react';

/**
 * "Can anything the user holds hover?" — `any-hover`, not `hover`. The plain
 * `hover` query describes the primary pointer alone, so a tablet with a mouse
 * plugged in answers "no" while its mouse is hovering; `any-hover: hover` is
 * true as soon as one attached input can.
 */
const CAN_HOVER_QUERY = '(any-hover: hover)';

const hasMatchMedia = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * Where the question cannot be asked at all, the answer is "yes": every
 * Chromium renderer (and every browser since IE10) implements `matchMedia`, so
 * this branch is reached only by jsdom, and "yes" keeps that environment on the
 * desktop path the rows are written for.
 */
const readCanHover = (): boolean => (hasMatchMedia() ? window.matchMedia(CAN_HOVER_QUERY).matches : true);

const subscribeToPointer = (onChange: () => void): (() => void) => {
  if (!hasMatchMedia()) return () => undefined;
  const list = window.matchMedia(CAN_HOVER_QUERY);
  list.addEventListener?.('change', onChange);
  return () => list.removeEventListener?.('change', onChange);
};

/**
 * Whether the pointer can hover, kept current rather than sampled once.
 *
 * Viewport width does not answer this — a touch-capable desktop is not
 * "mobile", and a narrow window on a mouse-driven one is not a touch screen —
 * and the answer can change under a running window when a laptop is switched
 * between its touchscreen and its trackpad, or a mouse is plugged into a
 * tablet. Read once and it goes stale until some unrelated state change
 * happens to re-render the row.
 *
 * Every hover-revealed control in the sidebar hangs on this answer: the remove
 * button that replaces a member's icon, the "…" on a member row, and whether a
 * row is a drag source at all — a handle nobody can see is only a scroll hijack.
 */
export const useCanHover = (): boolean => useSyncExternalStore(subscribeToPointer, readCanHover, () => true);
