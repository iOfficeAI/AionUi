/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import MentionMenuShell from '@/renderer/components/chat/MentionMenuShell';
import classNames from 'classnames';
import React from 'react';

export interface SlashCommandMenuItem {
  key: string;
  label: string;
  description?: string;
  badge?: string;
  highlightIndices?: number[];
}

interface SlashCommandMenuProps {
  title: string;
  hint?: string;
  items: SlashCommandMenuItem[];
  activeIndex: number;
  loading?: boolean;
  loadingText?: string;
  onHoverItem: (index: number) => void;
  onSelectItem: (item: SlashCommandMenuItem) => void;
  emptyText: string;
}

const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  title,
  hint,
  items,
  activeIndex,
  loading = false,
  loadingText = 'Loading...',
  onHoverItem,
  onSelectItem,
  emptyText,
}) => {
  const renderLabel = (item: SlashCommandMenuItem) => {
    if (!item.highlightIndices?.length) {
      return item.label;
    }

    const highlighted = new Set(item.highlightIndices);
    const parts: Array<{ text: string; highlighted: boolean; start: number }> = [];
    let current = '';
    let currentHighlighted = highlighted.has(0);
    let currentStart = 0;

    Array.from(item.label).forEach((char, index) => {
      const isHighlighted = highlighted.has(index);
      if (index > 0 && isHighlighted !== currentHighlighted) {
        parts.push({ text: current, highlighted: currentHighlighted, start: currentStart });
        current = '';
        currentStart = index;
        currentHighlighted = isHighlighted;
      }
      current += char;
    });

    if (current) {
      parts.push({ text: current, highlighted: currentHighlighted, start: currentStart });
    }

    return parts.map((part) => (
      <span
        key={`${part.start}-${part.text}`}
        data-slash-highlight={part.highlighted ? 'true' : undefined}
        className={part.highlighted ? 'rounded-3px bg-aou-2 px-1px text-aou-7 font-semibold' : undefined}
      >
        {part.text}
      </span>
    ));
  };

  return (
    <MentionMenuShell
      activeIndex={activeIndex}
      itemCount={items.length}
      label={title}
      loading={loading}
      title={title}
      hint={hint}
    >
      {loading && <div className='px-10px py-12px text-13px text-t-secondary'>{loadingText}</div>}
      {!loading && items.length === 0 && <div className='px-10px py-12px text-13px text-t-secondary'>{emptyText}</div>}
      {!loading &&
        items.map((item, index) => (
          <button
            key={item.key}
            type='button'
            role='option'
            aria-selected={index === activeIndex}
            className={classNames(
              'w-full text-start px-10px py-6px rounded-8px transition-all border border-solid outline-none cursor-pointer mb-2px last:mb-0',
              {
                'border-[var(--color-border-2)]': index === activeIndex,
                'border-transparent hover:bg-[var(--color-fill-1)]': index !== activeIndex,
              }
            )}
            style={{
              minHeight: '38px',
              background: index === activeIndex ? 'color-mix(in srgb, var(--aou-2) 88%, transparent)' : 'transparent',
              boxShadow: undefined,
            }}
            onMouseEnter={() => onHoverItem(index)}
            onClick={() => onSelectItem(item)}
          >
            <div className='flex items-center justify-between gap-8px'>
              <div className='min-w-0 flex items-baseline gap-10px'>
                <div
                  className={classNames(
                    'text-14px whitespace-nowrap',
                    index === activeIndex ? 'text-t-primary font-semibold' : 'text-t-primary font-medium'
                  )}
                >
                  {renderLabel(item)}
                </div>
                {item.description && <div className='text-12px text-t-secondary truncate'>{item.description}</div>}
              </div>
              {item.badge && (
                <span
                  className={classNames(
                    'text-10px rounded-999px px-6px py-1px shrink-0',
                    index === activeIndex
                      ? 'text-t-primary bg-[var(--color-bg-1)]'
                      : 'text-t-secondary bg-[var(--color-bg-1)]'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </div>
          </button>
        ))}
    </MentionMenuShell>
  );
};

export default SlashCommandMenu;
