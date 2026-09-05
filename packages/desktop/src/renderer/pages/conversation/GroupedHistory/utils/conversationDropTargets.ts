/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What a dropped sidebar conversation does, decided from where it landed.
 *
 * Two gestures share one drag: dropping a row *between* pinned rows reorders
 * them (the behaviour that existed before split groups), dropping it *onto*
 * something fuses. The pointer's vertical position inside the target row tells
 * the two apart; the drop target's kind tells what "fuse" means. Pure so the
 * decision table is testable without a DndContext.
 */

import type { SplitGroup } from './splitGroupHelpers';
import { findSplitGroupOf } from './splitGroupHelpers';

export type DropIntent = 'onto' | 'before' | 'after';

/** Fraction of the row's height, at its top and bottom, that reads as "between". */
const BETWEEN_BAND = 0.25;

/**
 * Where inside a row the pointer let go. Only rows that can actually be
 * reordered have "between" bands; anywhere on any other row is "onto".
 */
export const resolveDropIntent = ({
  pointerY,
  targetTop,
  targetHeight,
  canReorder,
}: {
  pointerY: number;
  targetTop: number;
  targetHeight: number;
  canReorder: boolean;
}): DropIntent => {
  if (!canReorder || targetHeight <= 0) return 'onto';
  const offset = (pointerY - targetTop) / targetHeight;
  if (offset < BETWEEN_BAND) return 'before';
  if (offset > 1 - BETWEEN_BAND) return 'after';
  return 'onto';
};

/** Payload a droppable registers so the drop handler knows what it landed on. */
export type ConversationDropTarget =
  | { kind: 'conversation'; conversation_id: string; surface: 'row' | 'chat' }
  | { kind: 'split_group'; group_id: string };

/** Payload the dragged row carries. */
export type ConversationDragSource = { kind: 'conversation'; conversation_id: string };

export type ConversationDropAction =
  | { type: 'reorder-pinned'; active_id: string; over_id: string }
  | { type: 'create-group'; target_id: string; dragged_id: string }
  | { type: 'add-member'; group_id: string; dragged_id: string }
  | { type: 'none'; reason: 'self' | 'between' | 'already-member' | 'dragged-grouped' | 'unknown-group' };

export const resolveConversationDropAction = ({
  dragged_id,
  target,
  intent,
  groups,
  pinnedIds,
}: {
  dragged_id: string;
  target: ConversationDropTarget;
  intent: DropIntent;
  groups: SplitGroup[];
  pinnedIds: readonly string[];
}): ConversationDropAction => {
  // A row that is already a column somewhere is never a drag source in the UI
  // (its row is folded into a pill), so this is a guard, not a feature.
  if (findSplitGroupOf(groups, dragged_id)) return { type: 'none', reason: 'dragged-grouped' };

  if (target.kind === 'split_group') {
    const group = groups.find((candidate) => candidate.id === target.group_id);
    if (!group) return { type: 'none', reason: 'unknown-group' };
    if (group.members.some((member) => member.id === dragged_id)) return { type: 'none', reason: 'already-member' };
    return { type: 'add-member', group_id: group.id, dragged_id };
  }

  const target_id = target.conversation_id;
  if (target_id === dragged_id) return { type: 'none', reason: 'self' };

  const targetGroup = findSplitGroupOf(groups, target_id);
  if (targetGroup) return { type: 'add-member', group_id: targetGroup.id, dragged_id };

  if (intent === 'onto') return { type: 'create-group', target_id, dragged_id };

  if (target.surface === 'row' && pinnedIds.includes(dragged_id) && pinnedIds.includes(target_id)) {
    return { type: 'reorder-pinned', active_id: dragged_id, over_id: target_id };
  }
  return { type: 'none', reason: 'between' };
};

/** Droppable ids, unique across the one DndContext that spans sidebar and chat area. */
export const splitGroupDropId = (group_id: string): string => `split-group:${group_id}`;
export const chatAreaDropId = (conversation_id: string): string => `chat-area:${conversation_id}`;

/** How far outside a row, vertically, a release still counts as "between" that row and its neighbour. */
export const ROW_GAP_PX = 8;

export type RowRect = { id: string; top: number; height: number; left: number; width: number };

/**
 * The row a pointer is next to when it is over none: only a row whose
 * horizontal span contains the pointer and whose edge is within the list's
 * row gap. A release over blank space — below the last row, beside the list,
 * in the chat area — returns nothing, so nothing gets fused by accident.
 */
export const pickRowInGap = (pointer: { x: number; y: number }, rows: readonly RowRect[]): string | null => {
  let best: { id: string; distance: number } | null = null;
  for (const row of rows) {
    if (pointer.x < row.left || pointer.x > row.left + row.width) continue;
    const distance = pointer.y < row.top ? row.top - pointer.y : pointer.y - (row.top + row.height);
    if (distance > ROW_GAP_PX) continue;
    if (!best || distance < best.distance) best = { id: row.id, distance };
  }
  return best?.id ?? null;
};
