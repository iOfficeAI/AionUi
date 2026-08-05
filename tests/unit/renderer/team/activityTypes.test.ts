/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import type { ITeamMailboxMessage, ITeamTaskItem } from '@/common/types/team/teamTypes';
import {
  ACTIVITY_FALLBACK_LANE,
  buildActivityItems,
  resolveMessageLane,
  resolveTaskLane,
  sortActivityItems,
  type ActivityItem,
} from '@/renderer/pages/team/activity/activityTypes';

const msg = (over: Partial<ITeamMailboxMessage> = {}): ITeamMailboxMessage => ({
  id: 'm1',
  team_id: 't1',
  from_agent_id: 'lead',
  to_agent_id: 'a1',
  msg_type: 'message',
  content: 'hi',
  files: [],
  read: false,
  created_at: 1000,
  ...over,
});

const task = (over: Partial<ITeamTaskItem> = {}): ITeamTaskItem => ({
  id: 'tk1',
  team_id: 't1',
  subject: 's',
  status: 'pending',
  owner: 'a1',
  blocked_by: [],
  blocks: [],
  created_at: 1000,
  updated_at: 1000,
  ...over,
});

describe('activity lane positioning', () => {
  const known = new Set(['lead', 'a1', 'a2']);

  it('routes a message to its recipient lane', () => {
    expect(resolveMessageLane(msg({ to_agent_id: 'a2' }), known)).toBe('a2');
  });

  it('routes a broadcast message to the sender lane', () => {
    expect(resolveMessageLane(msg({ from_agent_id: 'lead', to_agent_id: '*' }), known)).toBe('lead');
  });

  it('routes a task to its owner lane', () => {
    expect(resolveTaskLane(task({ owner: 'a2' }), known)).toBe('a2');
  });

  it('falls back for user recipient, missing owner, and removed member', () => {
    expect(resolveMessageLane(msg({ to_agent_id: 'user' }), known)).toBe(ACTIVITY_FALLBACK_LANE);
    expect(resolveTaskLane(task({ owner: undefined }), known)).toBe(ACTIVITY_FALLBACK_LANE);
    expect(resolveTaskLane(task({ owner: 'removed-slot' }), known)).toBe(ACTIVITY_FALLBACK_LANE);
    expect(resolveMessageLane(msg({ to_agent_id: 'removed-slot' }), known)).toBe(ACTIVITY_FALLBACK_LANE);
  });
});

describe('activity sorting', () => {
  const items: ActivityItem[] = [
    { kind: 'message', id: 'b', laneSlotId: 'a1', createdAt: 100, message: msg({ id: 'b', created_at: 100 }) },
    { kind: 'message', id: 'a', laneSlotId: 'a1', createdAt: 100, message: msg({ id: 'a', created_at: 100 }) },
    { kind: 'task', id: 'c', laneSlotId: 'a1', createdAt: 200, task: task({ id: 'c', created_at: 200 }) },
  ];

  it('sorts desc by createdAt with id as a stable tiebreak', () => {
    const sorted = sortActivityItems(items, 'desc');
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts asc by createdAt with id as a stable tiebreak', () => {
    const sorted = sortActivityItems(items, 'asc');
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('buildActivityItems merges messages and tasks with positioning', () => {
    const built = buildActivityItems(
      [msg({ id: 'm1', to_agent_id: 'a1', created_at: 10 })],
      [task({ id: 'tk1', owner: 'a2', created_at: 20 })],
      new Set(['a1', 'a2']),
      'desc'
    );
    expect(built.map((i) => i.id)).toEqual(['tk1', 'm1']);
    expect(built.find((i) => i.id === 'm1')?.laneSlotId).toBe('a1');
    expect(built.find((i) => i.id === 'tk1')?.laneSlotId).toBe('a2');
  });
});
