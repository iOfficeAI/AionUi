/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColumnHeaderActivator } from '@/renderer/pages/conversation/components/ChatLayout/ColumnHeaderActivator';
import type { ColumnHeaderDragHandle } from '@/renderer/pages/conversation/hooks/chatColumnContext';
import React from 'react';

/**
 * The header a column keeps while it has no conversation to show — its read
 * still loading, or come back empty. The same band as the live header, with
 * the same grip on the name, so the column can be grabbed and reordered in
 * every state: a spinner does not take the handle away.
 */
export const SplitColumnPlaceholderHeader: React.FC<{
  name: string;
  headerDragHandle?: ColumnHeaderDragHandle;
  /** What the live header puts at the right end: here, the remove button. */
  actions?: React.ReactNode;
}> = ({ name, headerDragHandle, actions }) => (
  <div
    className='min-h-44px flex items-center justify-between px-16px pt-8px pb-10px gap-16px !bg-2 border-b border-solid border-b-[var(--bg-3)] chat-layout-header chat-layout-header--glass overflow-hidden'
    data-column-header='true'
    data-testid='split-column-placeholder-header'
  >
    <ColumnHeaderActivator handle={headerDragHandle}>
      <span className='block min-w-0 px-8px py-5px overflow-hidden text-ellipsis whitespace-nowrap text-16px font-bold text-t-primary'>
        {name}
      </span>
    </ColumnHeaderActivator>
    <div
      className='flex items-center gap-12px justify-end'
      style={{ flex: '1 100 auto' }}
      data-testid='chat-header-actions'
    >
      {actions}
    </div>
  </div>
);
