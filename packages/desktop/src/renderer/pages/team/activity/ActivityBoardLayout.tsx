/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityItem, ActivityLane } from './activityTypes';
import type { ActivityIdentityResolver } from './MessageCard';
import MessageCard from './MessageCard';
import TaskCard from './TaskCard';

type Props = {
  items: ActivityItem[];
  lanes: ActivityLane[];
  identity: ActivityIdentityResolver;
};

/**
 * Board layout: one column per lane (members + fallback). Items are stacked in
 * the incoming sort order (already applied upstream). Dependencies are shown as
 * `blocked by #id` badges on the task cards rather than drawn connectors.
 */
const ActivityBoardLayout: React.FC<Props> = ({ items, lanes, identity }) => {
  const { t } = useTranslation();

  const itemsByLane = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const lane of lanes) map.set(lane.slotId, []);
    for (const item of items) {
      const bucket = map.get(item.laneSlotId);
      if (bucket) bucket.push(item);
    }
    return map;
  }, [items, lanes]);

  if (lanes.length === 0) return null;

  return (
    <div className='flex h-full gap-8px overflow-auto p-8px' data-testid='activity-board'>
      {lanes.map((lane) => {
        const laneItems = itemsByLane.get(lane.slotId) ?? [];
        return (
          <div
            key={lane.slotId}
            className='flex flex-col shrink-0 w-288px h-full rounded-8px bg-2 border border-solid border-[color:var(--border-base)]'
            data-testid='activity-board-column'
            data-lane-id={lane.slotId}
          >
            <div className='flex items-center gap-6px px-10px py-8px border-b border-solid border-[color:var(--border-base)]'>
              <span
                className='inline-block w-8px h-8px rounded-full shrink-0'
                style={{ backgroundColor: lane.color }}
              />
              <span className='truncate text-12px font-medium text-[color:var(--color-text-1)]' title={lane.name}>
                {lane.name}
              </span>
              <span className='ml-auto text-11px text-[color:var(--color-text-3)]'>{laneItems.length}</span>
            </div>
            <div className='flex-1 overflow-auto flex flex-col gap-8px p-8px'>
              {laneItems.length === 0 ? (
                <div className='text-12px text-[color:var(--color-text-3)] text-center py-12px'>
                  {t('team.activity.empty', { defaultValue: 'No activity yet' })}
                </div>
              ) : (
                laneItems.map((item) =>
                  item.kind === 'message' ? (
                    <MessageCard key={item.id} message={item.message} identity={identity} />
                  ) : (
                    <TaskCard key={item.id} task={item.task} identity={identity} />
                  )
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ActivityBoardLayout;
