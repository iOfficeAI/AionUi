/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const onStateChangedHandlers: Array<(payload: { name: string; status: string; error?: string }) => void> = [];

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    hub: {
      getExtensionList: {
        invoke: vi.fn().mockResolvedValue([
          {
            name: 'agent-a',
            display_name: 'Agent A',
            description: 'demo',
            status: 'not_installed',
            hubs: ['acpAdapters'],
          },
        ]),
      },
      onStateChanged: {
        on: vi.fn((handler) => {
          onStateChangedHandlers.push(handler);
          return vi.fn();
        }),
      },
      install: { invoke: vi.fn().mockResolvedValue(undefined) },
      retryInstall: { invoke: vi.fn().mockResolvedValue(undefined) },
      update: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

import { mutate } from 'swr';
import { useHubAgents } from '@/renderer/hooks/agent/useHubAgents';

describe('useHubAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onStateChangedHandlers.length = 0;
  });

  it('refreshes managed-agent and assistant caches when an install completes', async () => {
    renderHook(() => useHubAgents());

    await waitFor(() => {
      expect(onStateChangedHandlers).toHaveLength(1);
    });

    await act(async () => {
      onStateChangedHandlers[0]({ name: 'agent-a', status: 'installed' });
    });

    expect(mutate).toHaveBeenCalledWith('agents.managed');
    expect(mutate).toHaveBeenCalledWith('assistants.list');
    expect(mutate).toHaveBeenCalledWith('assistants');
  });
});
