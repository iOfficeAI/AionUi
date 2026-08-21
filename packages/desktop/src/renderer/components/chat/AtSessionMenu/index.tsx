/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionMentionTarget } from '@/common/adapter/ipcBridge';
import MentionMenuShell from '@/renderer/components/chat/MentionMenuShell';
import React from 'react';

/** Rows here are two lines tall, so the shell's single-line cap would only show
 *  a handful. */
const MAX_HEIGHT = 'min(40vh, 320px)';

type AtSessionMenuProps = {
  activeIndex: number;
  emptyText: string;
  items: SessionMentionTarget[];
  label: string;
  loading: boolean;
  loadingText: string;
  onHoverItem: (index: number) => void;
  onSelectItem: (item: SessionMentionTarget) => void;
  /** Ask for the next cursor page. Called on approaching the bottom; a no-op
   *  once the results are exhausted. */
  onReachEnd?: () => void;
  /** Relative time renderer, injected so this component stays presentational
   *  and the caller keeps the i18n dependency. */
  formatRelativeTime: (modifiedAt: number) => string;
};

/**
 * The `@@` picker's dropdown. Shape mirrors `AtFileMenu`.
 *
 * Every row carries a secondary line (project · relative time) because a
 * conversation whose `name_source` is unset shows a default placeholder name —
 * those rows are all called the same thing, and name alone is unpickable.
 *
 * Scrolling and the height cap belong to `MentionMenuShell`; a page is 20 rows,
 * which is far taller than the space above the send box.
 */
const AtSessionMenu: React.FC<AtSessionMenuProps> = ({
  activeIndex,
  emptyText,
  items,
  label,
  loading,
  loadingText,
  onHoverItem,
  onSelectItem,
  onReachEnd,
  formatRelativeTime,
}) => {
  return (
    <MentionMenuShell
      activeIndex={activeIndex}
      itemCount={items.length}
      label={label}
      loading={loading}
      maxHeight={MAX_HEIGHT}
      bodyClassName='flex flex-col gap-2px'
      onReachEnd={onReachEnd}
    >
      {items.length === 0 ? (
        <div className='px-12px py-10px text-12px text-t-secondary'>{loading ? loadingText : emptyText}</div>
      ) : (
        <>
          {items.map((item, index) => {
            const isActive = index === activeIndex;
            const subtitle = [item.project, formatRelativeTime(item.modified_at)].filter(Boolean).join(' · ');
            return (
              <div
                key={item.id}
                role='option'
                aria-selected={isActive}
                className='px-12px py-8px rounded-10px cursor-pointer transition-colors shrink-0'
                style={{
                  background: isActive ? 'var(--color-fill-2)' : 'transparent',
                }}
                onMouseEnter={() => {
                  onHoverItem(index);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectItem(item);
                }}
              >
                <div className='text-13px font-medium text-t-primary'>{item.name}</div>
                <div className='text-12px text-t-secondary break-all'>{subtitle}</div>
              </div>
            );
          })}
          {/* A page in flight behind rows already on screen. Not `role=option`:
              it is not selectable, and counting it as one would shift the
              keyboard indices. */}
          {loading && <div className='px-12px py-8px text-12px text-t-secondary shrink-0'>{loadingText}</div>}
        </>
      )}
    </MentionMenuShell>
  );
};

export default AtSessionMenu;
