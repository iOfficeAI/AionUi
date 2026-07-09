/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureSessionMock = vi.fn();
// 捕获 agentRuntimeStatusChanged 的订阅回调，供测试手动推送逐个成员事件。
let runtimeListener: ((event: unknown) => void) | undefined;
const runtimeUnsub = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      ensureSession: { invoke: (...args: unknown[]) => ensureSessionMock(...args) },
      agentRuntimeStatusChanged: {
        on: (cb: (event: unknown) => void) => {
          runtimeListener = cb;
          return runtimeUnsub;
        },
      },
    },
  },
}));

import { useTeamWarmup } from '@/renderer/pages/team/hooks/useTeamWarmup';

describe('useTeamWarmup', () => {
  beforeEach(() => {
    ensureSessionMock.mockReset();
    runtimeListener = undefined;
    runtimeUnsub.mockReset();
  });

  it('starts in warming and becomes ready when the team session resolves', async () => {
    ensureSessionMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    expect(result.current.phase).toBe('warming');
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(ensureSessionMock).toHaveBeenCalledWith({ team_id: 'team-1' });
  });

  it('goes to error when the team session fails to start', async () => {
    ensureSessionMock.mockRejectedValue(new Error('leader failed'));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    expect(result.current.phase).toBe('warming');
    await waitFor(() => expect(result.current.phase).toBe('error'));
  });

  it('is immediately ready with no team id', () => {
    const { result } = renderHook(() => useTeamWarmup(''));
    expect(result.current.phase).toBe('ready');
    expect(ensureSessionMock).not.toHaveBeenCalled();
  });

  it('tracks per-member runtime status from agentRuntimeStatusChanged events', async () => {
    // ensureSession 挂起，让 hook 停在 warming，便于观察逐个 runtime 信号。
    ensureSessionMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    expect(result.current.runtimeStatus.size).toBe(0);

    act(() => {
      runtimeListener?.({ team_id: 'team-1', slot_id: 'leader', conversation_id: 'c1', status: 'pending' });
    });
    expect(result.current.runtimeStatus.get('leader')).toBe('pending');

    act(() => {
      runtimeListener?.({ team_id: 'team-1', slot_id: 'leader', conversation_id: 'c1', status: 'ready' });
    });
    expect(result.current.runtimeStatus.get('leader')).toBe('ready');
    // 仍未 resolve → 整体闸门仍是 warming（成员就绪不等于团队就绪）。
    expect(result.current.phase).toBe('warming');
  });

  it('ignores runtime events from other teams', async () => {
    ensureSessionMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    act(() => {
      runtimeListener?.({ team_id: 'other-team', slot_id: 'x', conversation_id: 'c', status: 'pending' });
    });
    expect(result.current.runtimeStatus.size).toBe(0);
  });
});
