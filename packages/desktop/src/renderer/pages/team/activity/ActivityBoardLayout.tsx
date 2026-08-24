/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { ActivityItem, ActivityLane } from './activityTypes';
import type { ActivityIdentityResolver } from './MessageCard';
import MessageCard from './MessageCard';
import TaskCard from './TaskCard';
import TeamAgentIdentity from '../components/TeamAgentIdentity';

type Props = {
  items: ActivityItem[];
  lanes: ActivityLane[];
  identity: ActivityIdentityResolver;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
};

/** Bottom-of-column sentinel: fires `onLoadMore` when scrolled into view. */
const LoadMoreSentinel: React.FC<{
  rootRef: React.RefObject<HTMLElement | null>;
  onLoadMore: () => void;
}> = ({ rootRef, onLoadMore }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root: rootRef.current ?? null }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onLoadMore, rootRef]);
  return <div ref={ref} data-testid='activity-load-sentinel' className='h-1px w-full shrink-0' />;
};

const BoardColumn: React.FC<{
  lane: ActivityLane;
  laneItems: ActivityItem[];
  identity: ActivityIdentityResolver;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void;
  emptyLabel: string;
}> = ({ lane, laneItems, identity, hasMore, isLoadingMore, onLoadMore, emptyLabel }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const showSentinel = hasMore && laneItems.length > 0 && !!onLoadMore;

  return (
    <div
      className='flex flex-col shrink-0 w-288px h-full rounded-8px bg-2 border border-solid border-[color:var(--border-base)]'
      data-testid='activity-board-column'
      data-lane-id={lane.slotId}
    >
      <div className='flex items-center gap-6px px-10px py-8px border-b border-solid border-[color:var(--border-base)]'>
        {lane.isFallback || !lane.backend ? (
          <>
            <span className='inline-block w-8px h-8px rounded-full shrink-0' style={{ backgroundColor: lane.color }} />
            <span className='truncate text-12px font-medium text-[color:var(--color-text-1)]' title={lane.name}>
              {lane.name}
            </span>
          </>
        ) : (
          <div className='flex items-center gap-6px min-w-0 flex-1' data-testid='team-agent-identity'>
            <TeamAgentIdentity
              assistant_name={lane.name}
              assistant_backend={lane.backend}
              icon={lane.icon}
              conversation_id={lane.conversationId}
              logoClassName='w-16px h-16px object-cover rounded-full'
              avatarClassName='w-16px h-16px rounded-full flex items-center justify-center text-10px leading-none bg-fill-2 shrink-0'
              nameClassName='truncate text-12px font-medium text-[color:var(--color-text-1)]'
            />
          </div>
        )}
        <span className='ms-auto text-11px text-[color:var(--color-text-3)]'>{laneItems.length}</span>
      </div>
      <div ref={scrollRef} className='flex-1 overflow-auto flex flex-col gap-8px p-8px'>
        {laneItems.length === 0 ? (
          <div className='text-12px text-[color:var(--color-text-3)] text-center py-12px'>{emptyLabel}</div>
        ) : (
          <>
            {laneItems.map((item) =>
              item.kind === 'message' ? (
                <MessageCard key={item.id} message={item.message} identity={identity} />
              ) : (
                <TaskCard key={item.id} task={item.task} identity={identity} />
              )
            )}
            {showSentinel && <LoadMoreSentinel rootRef={scrollRef} onLoadMore={onLoadMore!} />}
            {isLoadingMore && (
              <div className='flex items-center justify-center py-8px'>
                <Spin size={16} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Board layout: one column per lane (members + fallback). Items are stacked in
 * the incoming sort order (already applied upstream). Each non-empty column
 * carries a bottom sentinel that drives the shared `onLoadMore` (observer root
 * is that column's own vertical scroll container), so scrolling any populated
 * column to its end pages the whole feed.
 */
const ActivityBoardLayout: React.FC<Props> = ({
  items,
  lanes,
  identity,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}) => {
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

  const emptyLabel = t('team.activity.empty', { defaultValue: 'No activity yet' });

  return (
    <div className='flex h-full gap-8px overflow-auto p-8px' data-testid='activity-board'>
      {lanes.map((lane) => (
        <BoardColumn
          key={lane.slotId}
          lane={lane}
          laneItems={itemsByLane.get(lane.slotId) ?? []}
          identity={identity}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
          emptyLabel={emptyLabel}
        />
      ))}
    </div>
  );
};

export default ActivityBoardLayout;
