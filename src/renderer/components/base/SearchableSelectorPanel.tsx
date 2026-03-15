/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Empty, Input } from '@arco-design/web-react';
import { IconCheck, IconSearch } from '@arco-design/web-react/icon';
import classNames from 'classnames';
import React from 'react';

export type SearchableSelectorItem = {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  keywords?: string[];
  active?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  onSelect: () => void;
};

export type SearchableSelectorSection = {
  key: string;
  title?: React.ReactNode;
  items: SearchableSelectorItem[];
};

export type SearchableSelectorPanelProps = {
  sections: SearchableSelectorSection[];
  query: string;
  searchPlaceholder: string;
  emptyText: React.ReactNode;
  onQueryChange: (value: string) => void;
  className?: string;
  maxBodyHeight?: number;
};

const normalizeSearchValue = (value: string): string => value.trim().toLowerCase();

const matchesSearch = (item: SearchableSelectorItem, normalizedQuery: string): boolean => {
  if (!normalizedQuery) {
    return true;
  }

  const searchableTexts = [item.label, item.description, ...(item.keywords || [])].filter(Boolean).map((value) => value!.toLowerCase());

  return searchableTexts.some((value) => value.includes(normalizedQuery));
};

const SearchableSelectorPanel: React.FC<SearchableSelectorPanelProps> = ({ sections, query, searchPlaceholder, emptyText, onQueryChange, className, maxBodyHeight = 320 }) => {
  const normalizedQuery = normalizeSearchValue(query);

  const filteredSections = React.useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => matchesSearch(item, normalizedQuery)),
        }))
        .filter((section) => section.items.length > 0),
    [normalizedQuery, sections]
  );

  const firstSelectableItem = React.useMemo(() => filteredSections.flatMap((section) => section.items).find((item) => !item.disabled), [filteredSections]);

  return (
    <div className={classNames('w-360px max-w-[calc(100vw-32px)] overflow-hidden rd-16px border border-solid border-[var(--border-base)] bg-[var(--color-bg-2)] shadow-[0_12px_40px_rgba(15,23,42,0.18)]', className)}>
      <div className='p-12px border-b border-b-base'>
        <Input autoFocus allowClear size='small' value={query} onChange={onQueryChange} onPressEnter={() => firstSelectableItem?.onSelect()} placeholder={searchPlaceholder} prefix={<IconSearch className='text-t-tertiary' />} />
      </div>

      <div className='py-8px overflow-y-auto' style={{ maxHeight: maxBodyHeight }} role='listbox' aria-label={typeof searchPlaceholder === 'string' ? searchPlaceholder : 'selector'}>
        {filteredSections.length > 0 ? (
          filteredSections.map((section) => (
            <div key={section.key} className='last:pb-2px'>
              {section.title ? <div className='px-12px pt-6px pb-4px text-12px text-t-tertiary font-medium'>{section.title}</div> : null}
              <div className='px-6px'>
                {section.items.map((item) => (
                  <button key={item.key} type='button' role='option' aria-selected={item.active ? 'true' : 'false'} disabled={item.disabled} className={classNames('w-full flex items-start gap-10px px-10px py-10px rd-12px text-left border-none bg-transparent transition-colors', item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-[var(--color-fill-2)]', item.active ? 'bg-[var(--color-fill-2)]' : '')} onClick={item.onSelect}>
                    {item.icon ? <span className='mt-2px shrink-0 inline-flex items-center justify-center text-t-secondary'>{item.icon}</span> : null}
                    <span className='min-w-0 flex-1'>
                      <span className='flex items-center gap-8px'>
                        <span className='block text-14px leading-20px text-t-primary truncate'>{item.label}</span>
                      </span>
                      {item.description ? <span className='block mt-2px text-12px leading-18px text-t-secondary break-all'>{item.description}</span> : null}
                    </span>
                    <span className='shrink-0 inline-flex items-center gap-6px text-t-tertiary'>
                      {item.trailing}
                      {item.active ? <IconCheck /> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className='px-12px py-24px'>
            <Empty description={emptyText} />
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchableSelectorPanel;
