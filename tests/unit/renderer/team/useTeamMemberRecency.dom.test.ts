/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const configMock = vi.hoisted(() => {
  const state: { value: Record<string, number> | undefined; listeners: Set<() => void> } = {
    value: undefined,
    listeners: new Set(),
  };
  const notify = () => {
    for (const listener of state.listeners) listener();
  };
  return {
    state,
    notify,
    service: {
      get: vi.fn(() => state.value),
      set: vi.fn(async (_key: string, value: Record<string, number> | undefined) => {
        state.value = value;
        notify();
      }),
      setLocal: vi.fn((_key: string, value: Record<string, number> | undefined) => {
        state.value = value;
        notify();
      }),
      subscribe: vi.fn((_key: string, listener: () => void) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      }),
    },
  };
});

vi.mock('@/common/config/configService', () => ({
  configService: configMock.service,
}));

import { useTeamMemberRecency } from '@/renderer/pages/team/hooks/useTeamMemberRecency';

describe('useTeamMemberRecency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMock.state.value = undefined;
    configMock.service.set.mockImplementation(async (_key, value) => {
      configMock.state.value = value;
      configMock.notify();
    });
    configMock.service.setLocal.mockImplementation((_key, value) => {
      configMock.state.value = value;
      configMock.notify();
    });
  });

  it('exposes an empty recency map by default', () => {
    const { result } = renderHook(() => useTeamMemberRecency());
    expect(result.current.recency).toEqual({});
  });

  it('normalizes a raw persisted value', () => {
    configMock.state.value = { writer: 1710000000000, bad: -1 };
    const { result } = renderHook(() => useTeamMemberRecency());
    expect(result.current.recency).toEqual({ writer: 1710000000000 });
  });

  it('recordUse persists the new timestamp merged over existing recency', async () => {
    const { result } = renderHook(() => useTeamMemberRecency());
    await act(async () => {
      await result.current.recordUse('writer');
      await result.current.recordUse('hermes');
    });
    expect(configMock.service.set).toHaveBeenCalledTimes(2);
    expect(Object.keys(configMock.service.set.mock.calls[0][1])).toEqual(['writer']);
    expect(configMock.service.set.mock.calls[1][1]).toMatchObject({ writer: expect.any(Number) });
    // Both entries recorded, timestamps are positive integers (ms epoch).
    const value = result.current.recency;
    expect(Object.keys(value).toSorted()).toEqual(['hermes', 'writer']);
    for (const ts of Object.values(value)) {
      expect(Number.isInteger(ts)).toBe(true);
      expect(ts).toBeGreaterThan(0);
    }
  });

  it('restores the previous cache value when persistence fails', async () => {
    configMock.state.value = { writer: 1710000000000 };
    configMock.service.set.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useTeamMemberRecency());
    let error: unknown;
    await act(async () => {
      try {
        await result.current.recordUse('hermes');
      } catch (caught) {
        error = caught;
      }
    });
    expect(error).toBeInstanceOf(Error);
    expect(configMock.service.setLocal).toHaveBeenCalledWith('team.addMemberRecency', {
      writer: 1710000000000,
    });
    // Recency reverted to the pre-failure value.
    expect(result.current.recency).toEqual({ writer: 1710000000000 });
  });
});
