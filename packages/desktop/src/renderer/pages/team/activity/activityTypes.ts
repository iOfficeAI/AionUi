/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ITeamMailboxMessage, ITeamTaskItem } from '@/common/types/team/teamTypes';

/** Lane bucket for items that have no resolvable member (owner/recipient is
 * null, the special "user"/"*" identity, or a removed member). */
export const ACTIVITY_FALLBACK_LANE = '__activity_fallback__';

/** The synthetic "user/external" identity used by mailbox rows. */
export const ACTIVITY_USER_IDENTITY = 'user';

/** Broadcast recipient marker used by team_send_message(to="*"). */
export const ACTIVITY_BROADCAST_TARGET = '*';

export type ActivitySortDirection = 'desc' | 'asc';

/** A rendered lane/column: a team member or the shared fallback bucket. */
export type ActivityLane = {
  slotId: string;
  name: string;
  color: string;
  isFallback: boolean;
  /** Assistant backend for the column-header icon (absent on the fallback lane). */
  backend?: string;
  /** Optional custom assistant icon override. */
  icon?: string;
  /** Conversation id, enabling preset-aware avatars in the header. */
  conversationId?: string;
};

/** A unified, lane-positioned activity entry (message or task). */
export type ActivityItem =
  | { kind: 'message'; id: string; laneSlotId: string; createdAt: number; message: ITeamMailboxMessage }
  | { kind: 'task'; id: string; laneSlotId: string; createdAt: number; task: ITeamTaskItem };

/** True when a message is a broadcast to the whole team (to="*"). */
export const isBroadcastMessage = (message: ITeamMailboxMessage): boolean =>
  message.to_agent_id === ACTIVITY_BROADCAST_TARGET;

/**
 * Resolves the swimlane/column a message belongs to.
 *
 * Messages sit in their recipient's lane. Broadcasts (to="*") have no single
 * recipient, so they sit in the sender's lane. Anything targeting "user", a
 * missing slot, or a removed member falls back to the shared "unassigned /
 * external" lane so no item is ever dropped.
 */
export const resolveMessageLane = (message: ITeamMailboxMessage, knownSlots: ReadonlySet<string>): string => {
  const target = isBroadcastMessage(message) ? message.from_agent_id : message.to_agent_id;
  if (target && target !== ACTIVITY_USER_IDENTITY && knownSlots.has(target)) {
    return target;
  }
  return ACTIVITY_FALLBACK_LANE;
};

/**
 * Resolves the swimlane/column a task belongs to (its owner's lane), falling
 * back for unassigned tasks and tasks owned by a removed member.
 */
export const resolveTaskLane = (task: ITeamTaskItem, knownSlots: ReadonlySet<string>): string => {
  const owner = task.owner;
  if (owner && owner !== ACTIVITY_USER_IDENTITY && knownSlots.has(owner)) {
    return owner;
  }
  return ACTIVITY_FALLBACK_LANE;
};

export const messageToActivityItem = (message: ITeamMailboxMessage, knownSlots: ReadonlySet<string>): ActivityItem => ({
  kind: 'message',
  id: message.id,
  laneSlotId: resolveMessageLane(message, knownSlots),
  createdAt: message.created_at,
  message,
});

export const taskToActivityItem = (task: ITeamTaskItem, knownSlots: ReadonlySet<string>): ActivityItem => ({
  kind: 'task',
  id: task.id,
  laneSlotId: resolveTaskLane(task, knownSlots),
  createdAt: task.created_at,
  task,
});

/**
 * Builds the unified item list from message/task maps, positioned into lanes
 * and sorted by `created_at` with `id` as a stable secondary key so ordering
 * is deterministic regardless of WS arrival order.
 */
export const buildActivityItems = (
  messages: ReadonlyArray<ITeamMailboxMessage>,
  tasks: ReadonlyArray<ITeamTaskItem>,
  knownSlots: ReadonlySet<string>,
  direction: ActivitySortDirection
): ActivityItem[] => {
  const items: ActivityItem[] = [
    ...messages.map((message) => messageToActivityItem(message, knownSlots)),
    ...tasks.map((task) => taskToActivityItem(task, knownSlots)),
  ];
  return sortActivityItems(items, direction);
};

/** Stable sort by `createdAt` (respecting direction) then `id` as tiebreak. */
export const sortActivityItems = (
  items: ReadonlyArray<ActivityItem>,
  direction: ActivitySortDirection
): ActivityItem[] => {
  const factor = direction === 'asc' ? 1 : -1;
  return [...items].toSorted((a, b) => {
    if (a.createdAt !== b.createdAt) return (a.createdAt - b.createdAt) * factor;
    return a.id < b.id ? -factor : a.id > b.id ? factor : 0;
  });
};

/** Terminal task statuses hidden by default in the activity view. */
export const isTerminalTaskStatus = (status: string): boolean => status === 'completed' || status === 'deleted';

/** System message types hidden by default in the activity view. */
export const isSystemMessageType = (msgType: string): boolean =>
  msgType === 'idle_notification' || msgType === 'shutdown_request';
