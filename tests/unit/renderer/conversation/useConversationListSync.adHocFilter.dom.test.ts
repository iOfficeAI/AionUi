/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

const { getUserConversationsMock, chatHistoryRefreshListeners } = vi.hoisted(() => ({
  getUserConversationsMock: vi.fn(),
  chatHistoryRefreshListeners: new Set<() => void>(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  addEventListener: (event: string, handler: () => void) => {
    if (event === 'chat.history.refresh') {
      chatHistoryRefreshListeners.add(handler);
    }
    return () => {
      chatHistoryRefreshListeners.delete(handler);
    };
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: {
        invoke: getUserConversationsMock,
      },
    },
    conversation: {
      listChanged: { on: vi.fn(() => vi.fn()) },
      responseStream: { on: vi.fn(() => vi.fn()) },
      turnCompleted: { on: vi.fn(() => vi.fn()) },
    },
    application: {
      writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

const { useConversationListSync } =
  await import('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync');

const makeConv = (id: string, extra: TChatConversation['extra'] = {}): TChatConversation =>
  ({
    id,
    type: 'acp',
    name: id,
    created_at: 1,
    modified_at: 1,
    extra,
    model: {},
  }) as TChatConversation;

describe('useConversationListSync ad-hoc team filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatHistoryRefreshListeners.clear();
    getUserConversationsMock.mockResolvedValue({
      items: [makeConv('source', { teamId: 'team-1' }), makeConv('member', { team_id: 'team-1' }), makeConv('normal')],
    });
  });

  it('excludes team member conversations while keeping promoted source conversations', async () => {
    const { result } = renderHook(() => useConversationListSync());

    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    const ids = result.current.conversations.map((c) => c.id);
    expect(ids).toContain('source');
    expect(ids).toContain('normal');
    expect(ids).not.toContain('member');
  });
});
