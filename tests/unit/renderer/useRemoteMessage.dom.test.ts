/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRemoteMessage } from '@/renderer/pages/conversation/platforms/remote/useRemoteMessage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: vi.fn(() => vi.fn()),
      },
      warmup: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
      getSlashCommands: {
        invoke: vi.fn().mockResolvedValue([]),
      },
    },
  },
}));

describe('useRemoteMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes hydration when the conversation lookup fails', async () => {
    vi.mocked(getConversationOrNull).mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useRemoteMessage('conv-1'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    expect(result.current.running).toBe(false);
    expect(result.current.aiProcessing).toBe(false);
  });

  it('hydrates running/aiProcessing from a running conversation', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue({ status: 'running' } as never);

    const { result } = renderHook(() => useRemoteMessage('conv-2'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    expect(result.current.running).toBe(true);
    expect(result.current.aiProcessing).toBe(true);
  });
});
