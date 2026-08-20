/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => {
  const row = (id: string, extra: Record<string, unknown>) => ({
    id,
    type: 'acp',
    name: id,
    created_at: 1,
    modified_at: 1,
    extra,
  });
  return {
    ipcBridge: {
      database: {
        getUserConversations: {
          invoke: vi.fn().mockResolvedValue({
            items: [
              row('normal', { backend: 'claude' }),
              // Ephemeral side threads live in the side dock, not the sidebar.
              row('side-hidden', { backend: 'claude', side_mode: true, ephemeral: true }),
              // Promoted side threads surface in history with their lineage.
              row('side-kept', { backend: 'claude', side_mode: true, ephemeral: false }),
            ],
            total: 3,
            has_more: false,
          }),
        },
      },
      conversation: {
        listChanged: { on: () => () => {} },
        responseStream: { on: () => () => {} },
        turnCompleted: { on: () => () => {} },
      },
      application: {
        writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) },
      },
    },
  };
});

vi.mock('@/renderer/utils/emitter', () => ({ addEventListener: () => () => {} }));

import { useConversationListSync } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

describe('useConversationListSync side thread filtering', () => {
  it('hides ephemeral side threads but keeps promoted ones', async () => {
    const { result } = renderHook(() => useConversationListSync());

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['normal', 'side-kept']);
    });
  });
});
