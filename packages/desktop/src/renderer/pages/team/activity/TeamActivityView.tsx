/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useTeamTabs } from '../hooks/TeamTabsContext';
import {
  ACTIVITY_FALLBACK_LANE,
  buildActivityItems,
  isSystemMessageType,
  isTerminalTaskStatus,
  type ActivityItem,
  type ActivityLane,
} from './activityTypes';
import { useTeamActivityFeed } from './useTeamActivityFeed';
import ActivityControlBar, { type ActivityControlsState } from './ActivityControlBar';
import ActivityBoardLayout from './ActivityBoardLayout';
import type { ActivityIdentityResolver } from './MessageCard';

type Props = {
  team: TTeam;
};

const DEFAULT_CONTROLS: ActivityControlsState = {
  sortDirection: 'desc',
  contentFilter: 'all',
  selectedMembers: [],
  showSystemMessages: false,
  showTerminalTasks: false,
};

/**
 * Read-only "message & task" board view for a team. Composes the lazy activity
 * feed, the control bar, and the board layout (one column per member lane).
 */
const TeamActivityView: React.FC<Props> = ({ team }) => {
  const { t } = useTranslation();
  const { assistants, colorOf } = useTeamTabs();
  const [controls, setControls] = useState<ActivityControlsState>(DEFAULT_CONTROLS);

  const { messages, tasks, isLoading } = useTeamActivityFeed(team.id, true);

  const knownSlots = useMemo(() => new Set(assistants.map((a) => a.slot_id)), [assistants]);

  const identity = useMemo<ActivityIdentityResolver>(() => {
    const nameBySlot = new Map(assistants.map((a) => [a.slot_id, a.assistant_name] as const));
    return {
      nameOf: (slotId) => (slotId ? (nameBySlot.get(slotId) ?? slotId) : ''),
      colorOf: (slotId) => colorOf(slotId),
    };
  }, [assistants, colorOf]);

  const allItems = useMemo(
    () => buildActivityItems(messages, tasks, knownSlots, controls.sortDirection),
    [messages, tasks, knownSlots, controls.sortDirection]
  );

  const filteredItems = useMemo(() => {
    const selected = new Set(controls.selectedMembers);
    return allItems.filter((item: ActivityItem) => {
      if (controls.contentFilter === 'messages' && item.kind !== 'message') return false;
      if (controls.contentFilter === 'tasks' && item.kind !== 'task') return false;
      if (item.kind === 'message' && !controls.showSystemMessages && isSystemMessageType(item.message.msg_type))
        return false;
      if (item.kind === 'task' && !controls.showTerminalTasks && isTerminalTaskStatus(item.task.status)) return false;
      // Fallback lane is now a selectable value, so it obeys the same rule.
      if (selected.size > 0 && !selected.has(item.laneSlotId)) return false;
      return true;
    });
  }, [allItems, controls]);

  const lanes = useMemo<ActivityLane[]>(() => {
    const selected = new Set(controls.selectedMembers);
    const memberLanes: ActivityLane[] = assistants
      .filter((a) => selected.size === 0 || selected.has(a.slot_id))
      .map((a) => ({
        slotId: a.slot_id,
        name: a.assistant_name,
        color: colorOf(a.slot_id),
        isFallback: false,
        backend: a.assistant_backend,
        icon: a.icon,
        conversationId: a.conversation_id,
      }));
    const showFallback =
      (selected.size === 0 || selected.has(ACTIVITY_FALLBACK_LANE)) &&
      filteredItems.some((item) => item.laneSlotId === ACTIVITY_FALLBACK_LANE);
    if (showFallback) {
      memberLanes.push({
        slotId: ACTIVITY_FALLBACK_LANE,
        name: t('team.activity.fallbackLane', { defaultValue: 'Unassigned / external' }),
        color: 'var(--color-text-3)',
        isFallback: true,
      });
    }
    return memberLanes;
  }, [assistants, colorOf, controls.selectedMembers, filteredItems, t]);

  const memberOptions = useMemo(
    () => assistants.map((a) => ({ slotId: a.slot_id, name: a.assistant_name })),
    [assistants]
  );

  return (
    <div className='flex flex-col h-full w-full min-w-0' data-testid='team-activity-view'>
      <div className='flex items-center justify-end px-12px pt-8px'>
        <span className='text-11px text-[color:var(--color-text-3)]'>
          {t('team.activity.limitNotice', { defaultValue: 'Showing the latest 500 items' })}
        </span>
      </div>

      <ActivityControlBar value={controls} onChange={setControls} members={memberOptions} />

      <div className='flex-1 min-h-0'>
        {isLoading ? (
          <div className='flex items-center justify-center h-full'>
            <Spin />
          </div>
        ) : (
          <ActivityBoardLayout items={filteredItems} lanes={lanes} identity={identity} />
        )}
      </div>
    </div>
  );
};

export default TeamActivityView;
