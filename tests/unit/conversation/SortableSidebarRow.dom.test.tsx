/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import SortableSidebarRow from '@/renderer/pages/conversation/GroupedHistory/SortableSidebarRow';

const renderRow = (id: string, onInnerClick = vi.fn()) => {
  render(
    <DndContext>
      <SortableContext items={[id]} strategy={verticalListSortingStrategy}>
        <SortableSidebarRow id={id}>
          {(dragHandle) => (
            <div className='group' onClick={onInnerClick} data-testid='inner-row'>
              {/* Inner rows place the handle into their leading-icon slot. */}
              {dragHandle}
              <span>row body</span>
            </div>
          )}
        </SortableSidebarRow>
      </SortableContext>
    </DndContext>
  );
  return { onInnerClick };
};

describe('SortableSidebarRow', () => {
  it('hands the same drag handle to a conversation row', () => {
    renderRow('conversation:conv-1');
    expect(screen.getByTestId('sidebar-drag-handle-conversation:conv-1')).toBeInTheDocument();
  });

  it('hands the same drag handle to a team row', () => {
    renderRow('team:team-1');
    expect(screen.getByTestId('sidebar-drag-handle-team:team-1')).toBeInTheDocument();
  });

  it('does not fire the row click when the drag handle is clicked', () => {
    const { onInnerClick } = renderRow('conversation:conv-1');
    fireEvent.click(screen.getByTestId('sidebar-drag-handle-conversation:conv-1'));
    expect(onInnerClick).not.toHaveBeenCalled();
  });
});
