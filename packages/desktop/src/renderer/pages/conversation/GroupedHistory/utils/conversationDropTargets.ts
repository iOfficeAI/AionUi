/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What a dropped sidebar conversation does, decided from where it landed.
 *
 * Three gestures share one drag: dropping a row *between* pinned rows reorders
 * them (the behaviour that existed before split groups), dropping it *onto*
 * something fuses, and dropping a row that is already a split-group member
 * anywhere else takes it out of its group. The pointer's vertical position
 * inside the target row tells the first two apart; the drop target's kind
 * tells what "fuse" means; whether the dragged row is already a member decides
 * between fusing and leaving. Pure so the decision table is testable without a
 * DndContext.
 */

import type { SplitGroup } from './splitGroupHelpers';
import { findSplitGroupOf } from './splitGroupHelpers';

export type DropIntent = 'onto' | 'before' | 'after';

/** Fraction of the row's height, at its top and bottom, that reads as "between". */
const BETWEEN_BAND = 0.25;

/**
 * Where the pointer let go, relative to the target it resolved to.
 *
 * A release in the *gap* beside a target — collision detection picked the
 * nearest row-like target because the pointer was over none — is "between"
 * no matter what the target is or whether anything can be reordered: that is
 * what a gap means. A release *inside* a row is "onto", except that rows which
 * can actually be reordered have "between" bands at their top and bottom.
 */
export const resolveDropIntent = ({
  pointerY,
  targetTop,
  targetHeight,
  canReorder,
  inGap = false,
}: {
  pointerY: number;
  targetTop: number;
  targetHeight: number;
  canReorder: boolean;
  /** The target was chosen for the pointer sitting in the gap beside it. */
  inGap?: boolean;
}): DropIntent => {
  if (inGap) return pointerY < targetTop + targetHeight / 2 ? 'before' : 'after';
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

/** Where a member being moved out of its group lands. */
export type SplitGroupMoveTarget =
  | { kind: 'group'; group_id: string }
  /** A plain conversation: the two of them become a new group. */
  | { kind: 'conversation'; conversation_id: string };

export type ConversationDropAction =
  | { type: 'reorder-pinned'; active_id: string; over_id: string }
  | { type: 'create-group'; target_id: string; dragged_id: string }
  | { type: 'add-member'; group_id: string; dragged_id: string }
  /** A member let go somewhere that is not a fuse target: it leaves its group. */
  | { type: 'remove-member'; group_id: string; dragged_id: string }
  /** A member let go on another group or another row: it leaves and joins in one batch. */
  | { type: 'move-member'; from_group_id: string; dragged_id: string; to: SplitGroupMoveTarget }
  | { type: 'none'; reason: 'self' | 'between' | 'nowhere' | 'already-member' | 'unknown-group' };

export const resolveConversationDropAction = ({
  dragged_id,
  target,
  intent,
  inGap = false,
  groups,
  pinnedIds,
}: {
  dragged_id: string;
  /** `null` when the pointer was over nothing a drop could mean anything on. */
  target: ConversationDropTarget | null;
  intent: DropIntent;
  /**
   * The target was picked for the pointer being in the gap *beside* it, not
   * over it. A "between" band inside a reorderable row is a different thing:
   * it still counts as landing on that row for anything that is not a reorder.
   */
  inGap?: boolean;
  groups: SplitGroup[];
  pinnedIds: readonly string[];
}): ConversationDropAction => {
  const sourceGroup = findSplitGroupOf(groups, dragged_id);

  // A member of a group is the one row whose drag can *undo* something:
  // anywhere that is not a fuse target means "take me out of here", and a
  // fuse target means "take me out of here and put me there".
  if (sourceGroup) {
    const leave = (to: SplitGroupMoveTarget): ConversationDropAction => ({
      type: 'move-member',
      from_group_id: sourceGroup.id,
      dragged_id,
      to,
    });
    if (!target) return { type: 'remove-member', group_id: sourceGroup.id, dragged_id };
    // Beside anything — a plain row, a block, a row inside one — is not a fuse
    // either, whatever it is beside and whether or not anything there can be
    // reordered: the member still leaves. So is a "between" band on any row.
    // Only a release *onto* a target moves it.
    if (inGap || (target.kind === 'conversation' && intent !== 'onto')) {
      return { type: 'remove-member', group_id: sourceGroup.id, dragged_id };
    }
    if (target.kind === 'split_group') {
      if (target.group_id === sourceGroup.id) return { type: 'none', reason: 'self' };
      const group = groups.find((candidate) => candidate.id === target.group_id);
      if (!group) return { type: 'none', reason: 'unknown-group' };
      return leave({ kind: 'group', group_id: group.id });
    }
    if (target.conversation_id === dragged_id) return { type: 'none', reason: 'self' };
    const targetGroup = findSplitGroupOf(groups, target.conversation_id);
    if (targetGroup) {
      return targetGroup.id === sourceGroup.id
        ? { type: 'none', reason: 'self' }
        : leave({ kind: 'group', group_id: targetGroup.id });
    }
    return leave({ kind: 'conversation', conversation_id: target.conversation_id });
  }

  // A plain row released over nothing keeps the old behaviour: nothing happens.
  if (!target) return { type: 'none', reason: 'nowhere' };

  if (target.kind === 'split_group') {
    // Beside a block is not a drop on it.
    if (inGap) return { type: 'none', reason: 'between' };
    const group = groups.find((candidate) => candidate.id === target.group_id);
    if (!group) return { type: 'none', reason: 'unknown-group' };
    if (group.members.some((member) => member.id === dragged_id)) return { type: 'none', reason: 'already-member' };
    return { type: 'add-member', group_id: group.id, dragged_id };
  }

  const target_id = target.conversation_id;
  if (target_id === dragged_id) return { type: 'none', reason: 'self' };

  const targetGroup = findSplitGroupOf(groups, target_id);
  if (targetGroup) {
    // Beside a row inside a block is not a drop on it; a band inside the row is.
    return inGap ? { type: 'none', reason: 'between' } : { type: 'add-member', group_id: targetGroup.id, dragged_id };
  }

  if (intent === 'onto') return { type: 'create-group', target_id, dragged_id };

  if (target.surface === 'row' && pinnedIds.includes(dragged_id) && pinnedIds.includes(target_id)) {
    return { type: 'reorder-pinned', active_id: dragged_id, over_id: target_id };
  }
  return { type: 'none', reason: 'between' };
};

/**
 * Whether the target under the pointer should light up for this action. Only
 * an action that would *use* the target does — a fuse, a join, a reorder. A
 * member leaving its group uses nothing; lighting the row or block it happens
 * to be beside would say "drop here" while the ghost says "take it out".
 */
export const dropActionHighlightsTarget = (action: ConversationDropAction): boolean =>
  action.type !== 'remove-member' && action.type !== 'none';

/** Droppable ids, unique across the one DndContext that spans sidebar and chat area. */
export const splitGroupDropId = (group_id: string): string => `split-group:${group_id}`;
export const chatAreaDropId = (conversation_id: string): string => `chat-area:${conversation_id}`;

/** How wide the space between two rows may be for a release there to count as "between" them. */
export const ROW_GAP_PX = 8;

export type RowRect = { id: string; top: number; height: number; left: number; width: number };

/**
 * The row a pointer is next to when it is over none: only when the pointer
 * sits in the gap *between* two row-like targets (one ending just above it,
 * one starting just below, within the list's row gap of each other), and
 * within their horizontal span. Blank space — below the last row, above the
 * first, beside the list, in the chat area — returns nothing, so nothing gets
 * fused by accident.
 */
export const pickRowInGap = (pointer: { x: number; y: number }, rows: readonly RowRect[]): string | null => {
  let above: RowRect | null = null;
  let below: RowRect | null = null;
  for (const row of rows) {
    if (pointer.x < row.left || pointer.x > row.left + row.width) continue;
    const bottom = row.top + row.height;
    if (bottom <= pointer.y && (!above || bottom > above.top + above.height)) above = row;
    if (row.top >= pointer.y && (!below || row.top < below.top)) below = row;
  }
  if (!above || !below) return null;
  if (below.top - (above.top + above.height) > ROW_GAP_PX * 2) return null;
  const toAbove = pointer.y - (above.top + above.height);
  const toBelow = below.top - pointer.y;
  return toAbove <= toBelow ? above.id : below.id;
};
