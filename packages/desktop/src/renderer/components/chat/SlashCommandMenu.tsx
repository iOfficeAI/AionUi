/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useEffect, useRef } from 'react';

export interface SlashCommandMenuItem {
  key: string;
  label: string;
  description?: string;
  badge?: string;
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
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const current = itemRefs.current[activeIndex];
    if (current) {
      current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, items.length]);

  return (
    <div
      className='rounded-14px border border-solid shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden'
      style={{
        borderColor: 'var(--color-border-2)',
        background: 'color-mix(in srgb, var(--color-bg-1) 78%, transparent)',
        backdropFilter: 'blur(14px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.1)',
      }}
    >
      <div
        className='px-12px py-8px border-b border-solid flex items-center justify-between gap-8px'
        style={{
          borderColor: 'color-mix(in srgb, var(--color-border-2) 56%, transparent)',
          background: 'color-mix(in srgb, var(--color-bg-1) 84%, transparent)',
        }}
      >
        <div className='text-13px font-semibold text-t-primary'>{title}</div>
        {hint && <div className='text-13px text-t-secondary truncate'>{hint}</div>}
      </div>
      <div
        role='listbox'
        aria-busy={loading}
        className='overflow-y-auto p-6px'
        style={{ maxHeight: 'min(34vh, 260px)' }}
      >
        {loading && <div className='px-10px py-12px text-13px text-t-secondary'>{loadingText}</div>}
        {!loading && items.length === 0 && (
          <div className='px-10px py-12px text-13px text-t-secondary'>{emptyText}</div>
        )}
        {!loading &&
          items.map((item, index) => (
            <button
              key={item.key}
              type='button'
              role='option'
              aria-selected={index === activeIndex}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className={classNames(
                'w-full text-left px-10px py-6px rounded-8px transition-all border border-solid outline-none cursor-pointer mb-2px last:mb-0',
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
                    {item.label}
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
      </div>
    </div>
  );
};

export default SlashCommandMenu;
