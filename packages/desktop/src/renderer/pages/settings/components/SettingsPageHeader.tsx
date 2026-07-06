/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SettingsPageHeader — the shared header paradigm for settings pages.
 *
 * Layout (top to bottom):
 *   1. Title row: page title + description on the left, action slot on the right.
 *   2. Tabs (optional): underline tabs with an optional count badge.
 *
 * Pages own everything below the header (their list/content). This keeps the
 * title sizing, description, action placement, tab styling and responsive
 * breakpoints identical across Agents / Skills / Tools.
 */

import classNames from 'classnames';
import React from 'react';

export type SettingsPageTab = {
  key: string;
  label: string;
  /** Optional count badge shown after the label. */
  count?: number;
};

type SettingsPageHeaderProps = {
  title: React.ReactNode;
  /** Secondary description under the title; may contain inline links. */
  description?: React.ReactNode;
  /** Right-aligned action slot (search, create button, dropdowns, …). */
  actions?: React.ReactNode;
  tabs?: SettingsPageTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /** Extra testid for the whole header block. */
  'data-testid'?: string;
};

const SettingsPageHeader: React.FC<SettingsPageHeaderProps> = ({
  title,
  description,
  actions,
  tabs,
  activeTab,
  onTabChange,
  'data-testid': dataTestId,
}) => {
  return (
    <div data-testid={dataTestId}>
      <div className='flex items-center justify-between gap-12px sm:gap-16px'>
        <h1 className='m-0 min-w-0 flex-1 text-22px md:text-24px font-bold leading-[1.2] text-t-primary'>{title}</h1>
        {actions ? <div className='shrink-0 flex flex-wrap items-center justify-end gap-8px'>{actions}</div> : null}
      </div>
      {description ? <p className='m-0 mt-8px text-13px leading-relaxed text-t-secondary'>{description}</p> : null}

      {tabs && tabs.length > 0 ? (
        <div className='mt-18px flex gap-26px border-b border-border-2' role='tablist'>
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type='button'
                role='tab'
                aria-selected={isActive}
                data-testid={`settings-tab-${tab.key}`}
                onClick={() => onTabChange?.(tab.key)}
                className={classNames(
                  'relative inline-flex cursor-pointer items-center border-none bg-transparent px-2px pb-12px text-14px leading-none transition-colors',
                  isActive ? 'font-600 text-t-primary' : 'font-500 text-t-tertiary hover:text-t-secondary'
                )}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' ? (
                  <span
                    className={classNames(
                      'ml-6px inline-flex h-16px min-w-16px items-center justify-center rounded-999px px-5px text-10px font-500 leading-none',
                      isActive ? 'bg-primary-1 text-primary-6' : 'bg-fill-2 text-t-quaternary'
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
                {isActive ? <span className='absolute inset-x-0 -bottom-1px h-2px rounded-2px bg-primary-6' /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default SettingsPageHeader;
