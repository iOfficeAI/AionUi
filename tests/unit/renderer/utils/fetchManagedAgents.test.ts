/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/utils/model/agentTypes.ts → fetchManagedAgents.
 * The settings management fetcher must hit the dedicated `getManagedAgents`
 * bridge (`/api/agents/management`) and degrade to [] on failure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getManagedAgents: { invoke: vi.fn() },
    },
  },
}));

import { fetchManagedAgents } from '@/renderer/utils/model/agentTypes';
import { ipcBridge } from '@/common';

describe('fetchManagedAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns rows from the include_disabled (managed) bridge', async () => {
    const rows = [{ id: 'd', name: 'D', agent_type: 'acp', agent_source: 'custom', enabled: false, available: false }];
    (ipcBridge.acpConversation.getManagedAgents.invoke as any).mockResolvedValue(rows);

    await expect(fetchManagedAgents()).resolves.toEqual(rows);
    expect(ipcBridge.acpConversation.getManagedAgents.invoke).toHaveBeenCalledTimes(1);
  });

  it('returns [] when the bridge rejects', async () => {
    (ipcBridge.acpConversation.getManagedAgents.invoke as any).mockRejectedValue(new Error('boom'));

    await expect(fetchManagedAgents()).resolves.toEqual([]);
  });

  it('returns [] when the bridge yields a non-array', async () => {
    (ipcBridge.acpConversation.getManagedAgents.invoke as any).mockResolvedValue(undefined);

    await expect(fetchManagedAgents()).resolves.toEqual([]);
  });
});
