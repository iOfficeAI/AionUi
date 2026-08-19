/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionMentionTarget } from '@/common/adapter/ipcBridge';
import React from 'react';

type AtSessionMenuProps = {
  activeIndex: number;
  emptyText: string;
  items: SessionMentionTarget[];
  label: string;
  loading: boolean;
  loadingText: string;
  onHoverItem: (index: number) => void;
  onSelectItem: (item: SessionMentionTarget) => void;
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
  formatRelativeTime,
}) => {
  return (
    <div
      className='rounded-14px border border-solid overflow-hidden p-6px flex flex-col gap-2px'
      style={{
        borderColor: 'var(--color-border-2)',
        background: 'color-mix(in srgb, var(--color-bg-1) 94%, transparent)',
        backdropFilter: 'blur(14px) saturate(1.05)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.05)',
      }}
      role='listbox'
      aria-label={label}
    >
      {items.length === 0 ? (
        <div className='px-12px py-10px text-12px text-t-secondary'>{loading ? loadingText : emptyText}</div>
      ) : (
        items.map((item, index) => {
          const isActive = index === activeIndex;
          const subtitle = [item.project, formatRelativeTime(item.modified_at)].filter(Boolean).join(' · ');
          return (
            <div
              key={item.id}
              role='option'
              aria-selected={isActive}
              className='px-12px py-8px rounded-10px cursor-pointer transition-colors'
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
        })
      )}
    </div>
  );
};

export default AtSessionMenu;
