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

const COL_W = 288;
const LANE_H = 168;
const LABEL_W = 148;

type Props = {
  items: ActivityItem[];
  lanes: ActivityLane[];
  identity: ActivityIdentityResolver;
  showConnectors: boolean;
};

/** Formats a millisecond timestamp to a short YYYY-MM-DD date for the axis. */
const dateKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Swimlane layout with a shared, time-ordered column grid: every lane shares
 * the same ordered set of columns so cross-lane events line up in the same
 * column. An SVG overlay draws message (from→to) and task-dependency
 * connectors when enabled and both endpoints are in the loaded/visible set.
 */
const ActivitySwimlaneLayout: React.FC<Props> = ({ items, lanes, identity, showConnectors }) => {
  const { t } = useTranslation();

  const laneRow = useMemo(() => {
    const map = new Map<string, number>();
    lanes.forEach((lane, index) => map.set(lane.slotId, index));
    return map;
  }, [lanes]);

  const columnOf = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, index) => map.set(item.id, index));
    return map;
  }, [items]);

  const gridWidth = Math.max(items.length * COL_W, COL_W);
  const gridHeight = lanes.length * LANE_H;

  const cx = (col: number): number => col * COL_W + COL_W / 2;
  const cy = (row: number): number => row * LANE_H + LANE_H / 2;

  // Connector segments computed from grid geometry (deterministic, no DOM
  // measurement). Messages link sender lane -> recipient card; tasks link a
  // loaded dependency to the blocked task.
  const connectors = useMemo(() => {
    if (!showConnectors)
      return [] as Array<{ key: string; x1: number; y1: number; x2: number; y2: number; kind: 'message' | 'task' }>;
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; kind: 'message' | 'task' }> = [];
    for (const item of items) {
      const col = columnOf.get(item.id);
      if (col == null) continue;
      const toRow = laneRow.get(item.laneSlotId);
      if (toRow == null) continue;
      if (item.kind === 'message') {
        const fromSlot = item.message.from_agent_id;
        const fromRow = laneRow.get(fromSlot);
        if (fromRow == null || fromRow === toRow) continue;
        lines.push({ key: `m-${item.id}`, x1: cx(col), y1: cy(fromRow), x2: cx(col), y2: cy(toRow), kind: 'message' });
      } else {
        for (const depId of item.task.blocked_by) {
          const depCol = columnOf.get(depId);
          if (depCol == null) continue; // dependency not loaded/visible -> badge only
          const depItem = items[depCol];
          const depRow = laneRow.get(depItem.laneSlotId);
          if (depRow == null) continue;
          lines.push({
            key: `t-${item.id}-${depId}`,
            x1: cx(depCol),
            y1: cy(depRow),
            x2: cx(col),
            y2: cy(toRow),
            kind: 'task',
          });
        }
      }
    }
    return lines;
  }, [showConnectors, items, columnOf, laneRow]);

  if (lanes.length === 0) return null;

  return (
    <div className='flex h-full overflow-hidden' data-testid='activity-swimlane'>
      {/* Sticky lane labels */}
      <div className='shrink-0 border-r border-solid border-[color:var(--border-base)] bg-2' style={{ width: LABEL_W }}>
        {lanes.map((lane) => (
          <div
            key={lane.slotId}
            className='flex items-center gap-6px px-10px border-b border-solid border-[color:var(--border-base)]'
            style={{ height: LANE_H }}
          >
            <span className='inline-block w-8px h-8px rounded-full shrink-0' style={{ backgroundColor: lane.color }} />
            <span className='truncate text-12px text-[color:var(--color-text-1)]' title={lane.name}>
              {lane.name}
            </span>
          </div>
        ))}
      </div>

      {/* Shared-column scroll area */}
      <div className='flex-1 overflow-auto'>
        <div className='relative' style={{ width: gridWidth, height: gridHeight }}>
          {/* Lane row separators */}
          {lanes.map((lane, row) => (
            <div
              key={lane.slotId}
              className='absolute left-0 right-0 border-b border-solid border-[color:var(--border-base)]'
              style={{ top: row * LANE_H, height: LANE_H }}
            />
          ))}

          {/* Cards */}
          {items.map((item) => {
            const col = columnOf.get(item.id) ?? 0;
            const row = laneRow.get(item.laneSlotId);
            if (row == null) return null;
            return (
              <div
                key={item.id}
                className='absolute p-6px'
                style={{ left: col * COL_W, top: row * LANE_H, width: COL_W, height: LANE_H }}
              >
                {item.kind === 'message' ? (
                  <MessageCard message={item.message} identity={identity} />
                ) : (
                  <TaskCard task={item.task} identity={identity} />
                )}
              </div>
            );
          })}

          {/* Connector overlay */}
          {showConnectors && connectors.length > 0 && (
            <svg
              className='absolute inset-0 pointer-events-none'
              width={gridWidth}
              height={gridHeight}
              data-testid='activity-connectors-svg'
            >
              {connectors.map((line) => (
                <line
                  key={line.key}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={line.kind === 'message' ? 'var(--color-text-3)' : 'var(--brand)'}
                  strokeWidth={1.5}
                  strokeDasharray={line.kind === 'task' ? '4 3' : undefined}
                  opacity={0.5}
                />
              ))}
            </svg>
          )}

          {items.length === 0 && (
            <div className='absolute inset-0 flex items-center justify-center text-13px text-[color:var(--color-text-3)]'>
              {t('team.activity.empty', { defaultValue: 'No activity yet' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivitySwimlaneLayout;
export { dateKey };
