/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DragEndEvent } from '@dnd-kit/core';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SidebarItem } from '@/common/types/sidebar';
import type { TChatConversation } from '@/common/config/storage';

const moveInvoke = vi.fn().mockResolvedValue(undefined);
const emit = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: { order: { pinned: { move: { invoke: (...args: unknown[]) => moveInvoke(...args) } } } },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: (...args: unknown[]) => emit(...args) },
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

import { sortableId, useDragAndDrop } from '@/renderer/pages/conversation/GroupedHistory/hooks/useDragAndDrop';

const conv = (id: string): SidebarItem => ({
  type: 'conversation',
  conversation: { id } as unknown as TChatConversation,
});
const team = (id: string): SidebarItem =>
  ({
    type: 'team',
    team_id: id,
    name: id,
    updated_at: 0,
    pinned: true,
    member_conversation_ids: [],
  }) as unknown as SidebarItem;

// Pinned group is a conversation ∪ team union: [conv A, team T, conv B].
const pinnedRows: SidebarItem[] = [conv('A'), team('T'), conv('B')];

const dragEnd = (activeId: string, overId: string): DragEndEvent =>
  ({ active: { id: activeId }, over: { id: overId } }) as unknown as DragEndEvent;

const setup = () => renderHook(() => useDragAndDrop({ pinnedRows, batchMode: false, collapsed: false }));

describe('useDragAndDrop', () => {
  beforeEach(() => {
    moveInvoke.mockClear();
    moveInvoke.mockResolvedValue(undefined);
    emit.mockClear();
  });

  it('sends the new predecessor as the anchor when dropping into the middle', async () => {
    const { result } = setup();
    // Drag A past B → A lands right after B.
    await result.current.handleDragEnd(dragEnd(sortableId('conversation', 'A'), sortableId('conversation', 'B')));
    expect(moveInvoke).toHaveBeenCalledWith({
      moved: { item_type: 'conversation', item_id: 'A' },
      after: { item_type: 'conversation', item_id: 'B' },
    });
    expect(emit).toHaveBeenCalledWith('chat.history.refresh');
  });

  it('sends after:null when dropping at the very top', async () => {
    const { result } = setup();
    // Drag B onto A (index 0) → B goes to the top.
    await result.current.handleDragEnd(dragEnd(sortableId('conversation', 'B'), sortableId('conversation', 'A')));
    expect(moveInvoke).toHaveBeenCalledWith({
      moved: { item_type: 'conversation', item_id: 'B' },
      after: null,
    });
  });

  it('drags a team row within the union (mixed conversation/team)', async () => {
    const { result } = setup();
    // Drag team T onto A (top).
    await result.current.handleDragEnd(dragEnd(sortableId('team', 'T'), sortableId('conversation', 'A')));
    expect(moveInvoke).toHaveBeenCalledWith({
      moved: { item_type: 'team', item_id: 'T' },
      after: null,
    });
  });

  it('reconciles to server order (refresh) even when the move endpoint rejects', async () => {
    moveInvoke.mockRejectedValueOnce(new Error('stale anchor'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = setup();
    await result.current.handleDragEnd(dragEnd(sortableId('conversation', 'A'), sortableId('conversation', 'B')));
    expect(emit).toHaveBeenCalledWith('chat.history.refresh');
    errSpy.mockRestore();
  });

  it('is a no-op when dropped on itself', async () => {
    const { result } = setup();
    await result.current.handleDragEnd(dragEnd(sortableId('conversation', 'A'), sortableId('conversation', 'A')));
    expect(moveInvoke).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
