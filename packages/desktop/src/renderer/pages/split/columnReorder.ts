/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Where a dragged column lands, decided from the column under the pointer and
 * which half of it the pointer is in. Pure, so the decision is testable
 * without a DndContext: the view only supplies rects and the current order.
 *
 * The order is logical — first column first — and the columns run with the
 * document: left to right, or right to left under an RTL locale. So "the half
 * toward the end" is the right half in LTR and the left half in RTL, and the
 * arrow key that moves a column toward the end is the one pointing that way.
 */

/**
 * Whether the columns inside `element` run right to left: the nearest `dir`
 * that says, else the computed direction (the `dir` the app sets on the
 * document for an RTL locale is the usual answer).
 */
export const columnsRunRightToLeft = (element: Element): boolean => {
  const declared = element.closest('[dir]')?.getAttribute('dir')?.toLowerCase();
  if (declared === 'rtl' || declared === 'ltr') return declared === 'rtl';
  return typeof getComputedStyle === 'function' && getComputedStyle(element).direction === 'rtl';
};

/** The step an arrow key means, in logical slots: toward the end, or toward the start. */
export const arrowStep = (toward: 'left' | 'right', rtl: boolean): -1 | 1 => ((toward === 'right') !== rtl ? 1 : -1);

/** The slot index the dragged column would take, `null` when it is its own. */
export const resolveColumnDropIndex = ({
  activeId,
  overId,
  pointerX,
  overLeft,
  overWidth,
  order,
  rtl = false,
}: {
  activeId: string;
  overId: string;
  pointerX: number;
  overLeft: number;
  overWidth: number;
  order: readonly string[];
  rtl?: boolean;
}): number | null => {
  const from = order.indexOf(activeId);
  const overIndex = order.indexOf(overId);
  if (from < 0 || overIndex < 0) return null;
  // The slot before the column under the pointer, or the one after it: the
  // half of the column toward the end of the row is the slot after it.
  const inRightHalf = overWidth > 0 && pointerX - overLeft > overWidth / 2;
  const after = rtl ? overWidth > 0 && !inRightHalf : inRightHalf;
  const slot = overIndex + (after ? 1 : 0);
  // Removing the dragged column first shifts every later slot down by one;
  // a slot that lands the column back where it is means nothing happened.
  const target = slot > from ? slot - 1 : slot;
  return target === from ? null : slot;
};

/** The order with `id` taken out and put back at `slot` (a slot counted before removal). */
export const reorderColumns = (order: readonly string[], id: string, slot: number): string[] => {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const without = order.filter((member) => member !== id);
  const at = Math.max(0, Math.min(without.length, slot > from ? slot - 1 : slot));
  return [...without.slice(0, at), id, ...without.slice(at)];
};

/** The order with `id` moved one column left or right; unchanged at either edge. */
export const moveColumn = (order: readonly string[], id: string, delta: -1 | 1): string[] => {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
};
