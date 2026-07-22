/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { ensureConversationRuntime } from '@/renderer/pages/conversation/utils/ensureConversationRuntime';

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      responseStream: {
        on: vi.fn(() => vi.fn()),
      },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/ensureConversationRuntime', () => ({
  ensureConversationRuntime: vi.fn(),
}));

vi.mock('swr', () => ({
  default: () => ({ data: null, mutate: vi.fn(), isLoading: false }),
  useSWR: () => ({ data: null, mutate: vi.fn(), isLoading: false }),
  mutate: vi.fn(),
}));

describe('useAcpConfigOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConversationOrNull).mockResolvedValue(null);
    vi.mocked(ensureConversationRuntime).mockResolvedValue({ config_options: [] });
  });

  it('does not ensure standalone runtime for promoted leader source conversations', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue({
      extra: { teamId: 'team-leader' },
    } as unknown as Awaited<ReturnType<typeof getConversationOrNull>>);

    renderHook(() => useAcpConfigOptions({ conversation_id: 'conv-leader', enabled: true }));

    await waitFor(() => {
      expect(getConversationOrNull).toHaveBeenCalledWith('conv-leader');
    });
    expect(ensureConversationRuntime).not.toHaveBeenCalled();
  });
});
