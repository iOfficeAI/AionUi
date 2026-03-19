/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';

const SORT_ORDER_GAP = 1000;
const MIN_GAP_THRESHOLD = 1;

/**
 * Get sortOrder from conversation extra
 */
export const getConversationSortOrder = (conversation: TChatConversation): number | undefined => {
  const extra = conversation.extra as { sortOrder?: number } | undefined;
  return extra?.sortOrder;
};

/**
 * Compute a sortOrder value for inserting between two adjacent items.
 * - If both are undefined, returns SORT_ORDER_GAP
 * - If only `before` is defined, returns before + SORT_ORDER_GAP
 * - If only `after` is defined, returns after - SORT_ORDER_GAP
 * - Otherwise returns (before + after) / 2
 */
export function computeSortOrder(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) {
    return SORT_ORDER_GAP;
  }
  if (before === undefined) {
    return (after as number) - SORT_ORDER_GAP;
  }
  if (after === undefined) {
    return before + SORT_ORDER_GAP;
  }
  return (before + after) / 2;
}

/**
 * Check if a list of items needs reindexing (when adjacent sortOrder values are too close)
 */
export function needsReindex(items: Array<{ sortOrder?: number }>): boolean {
  const sorted = items.filter((item) => item.sortOrder !== undefined).toSorted((a, b) => a.sortOrder! - b.sortOrder!);

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].sortOrder! - sorted[i - 1].sortOrder!) < MIN_GAP_THRESHOLD) {
      return true;
    }
  }
  return false;
}

/**
 * Batch reindex sortOrders with even spacing
 */
export function reindexSortOrders(
  items: Array<{ id: string; sortOrder?: number }>
): Array<{ id: string; sortOrder: number }> {
  return items.map((item, index) => ({
    id: item.id,
    sortOrder: (index + 1) * SORT_ORDER_GAP,
  }));
}

/**
 * Assign initial sortOrders to a list of items that don't have them yet,
 * preserving their current order.
 */
export function assignInitialSortOrders(
  items: Array<{ id: string; sortOrder?: number }>
): Array<{ id: string; sortOrder: number }> {
  return items.map((item, index) => ({
    id: item.id,
    sortOrder: item.sortOrder ?? (index + 1) * SORT_ORDER_GAP,
  }));
}
