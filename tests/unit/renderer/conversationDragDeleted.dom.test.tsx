/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reconciling a deleted split-group member. The backend "deleted" event is the
 * only thing that starts it, and by the time it arrives the row is usually
 * already out of the list — the refresh won the race, or the delete came from
 * another device. Resolving the group only from the groups currently
 * renderable would miss exactly those cases and leave the survivor tagged.
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';

type ListChangedEvent = { action: string; conversation_id: string };
let emit: (event: ListChangedEvent) => void = () => {};
const listeners = new Set<(event: ListChangedEvent) => void>();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      listChanged: {
        on: (listener: (event: ListChangedEvent) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    },
  },
}));

const reconcileDeleted = vi.fn(async () => {});
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations', () => ({
  useSplitGroupMutations: () => ({
    createGroup: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    reconcileDeleted,
    dissolveIfAlone: vi.fn(),
  }),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useDragAndDrop', () => ({
  usePinnedReorder: () => ({ reorderPinned: vi.fn() }),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationLeadingIcon', () => ({
  default: () => null,
}));

let contextValue: {
  conversations: TChatConversation[];
  groupedHistory: {
    pinnedConversations: TChatConversation[];
    splitGroups: Array<{ id: string; members: TChatConversation[] }>;
  };
};
vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => contextValue,
}));

import { ConversationDragProvider } from '@/renderer/pages/conversation/GroupedHistory/hooks/ConversationDragContext';

const row = (id: string, group_id?: string, order = 0): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    extra: { split_group: group_id ? { id: group_id, order } : null },
  }) as TChatConversation;

const setContext = (
  conversations: TChatConversation[],
  groups: Array<{ id: string; members: TChatConversation[] }>
) => {
  contextValue = {
    conversations,
    groupedHistory: { pinnedConversations: [], splitGroups: groups },
  };
};

describe('ConversationDragProvider: deleted-member reconciliation', () => {
  beforeEach(() => {
    reconcileDeleted.mockClear();
    listeners.clear();
    emit = (event) => listeners.forEach((listener) => listener(event));
  });

  it('reconciles a member already gone from the loaded groups when the event lands', async () => {
    const a = row('a', 'g', 0);
    const b = row('b', 'g', 1);
    setContext([a, b], [{ id: 'g', members: [a, b] }]);
    const view = render(<ConversationDragProvider>{null}</ConversationDragProvider>);

    // The refresh wins the race: b is out of the list and the group is no
    // longer derivable before the deleted event arrives.
    setContext([a], []);
    view.rerender(<ConversationDragProvider>{null}</ConversationDragProvider>);
    emit({ action: 'deleted', conversation_id: 'b' });

    await waitFor(() => expect(reconcileDeleted).toHaveBeenCalledWith('g', 'b'));
  });

  it('ignores a deleted conversation that never carried a tag', async () => {
    const a = row('a');
    setContext([a], []);
    render(<ConversationDragProvider>{null}</ConversationDragProvider>);
    emit({ action: 'deleted', conversation_id: 'a' });
    await waitFor(() => expect(reconcileDeleted).not.toHaveBeenCalled());
  });

  it('ignores every action but a delete', async () => {
    const a = row('a', 'g', 0);
    setContext([a], []);
    render(<ConversationDragProvider>{null}</ConversationDragProvider>);
    emit({ action: 'updated', conversation_id: 'a' });
    await waitFor(() => expect(reconcileDeleted).not.toHaveBeenCalled());
  });

  it('keeps one subscription across list changes, so no event falls in a resubscribe gap', () => {
    const a = row('a', 'g', 0);
    setContext([a], []);
    const view = render(<ConversationDragProvider>{null}</ConversationDragProvider>);
    const subscribed = listeners.size;
    setContext([a, row('b', 'g', 1)], []);
    view.rerender(<ConversationDragProvider>{null}</ConversationDragProvider>);
    expect(listeners.size).toBe(subscribed);
  });
});
