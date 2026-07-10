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
let sessionStatusListener: ((event: unknown) => void) | undefined;
const runtimeUnsub = vi.fn();
const sessionStatusUnsub = vi.fn();

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
      sessionStatusChanged: {
        on: (cb: (event: unknown) => void) => {
          sessionStatusListener = cb;
          return sessionStatusUnsub;
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
    sessionStatusListener = undefined;
    runtimeUnsub.mockReset();
    sessionStatusUnsub.mockReset();
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
    expect(result.current.runtimeStatus.get('leader')?.status).toBe('pending');

    act(() => {
      runtimeListener?.({ team_id: 'team-1', slot_id: 'leader', conversation_id: 'c1', status: 'ready' });
    });
    expect(result.current.runtimeStatus.get('leader')?.status).toBe('ready');
    // 仍未 resolve → 整体闸门仍是 warming（成员就绪不等于团队就绪）。
    expect(result.current.phase).toBe('warming');
  });

  it('stays warming without a terminal team event instead of timing out', () => {
    vi.useFakeTimers();
    try {
      ensureSessionMock.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useTeamWarmup('team-1'));

      act(() => {
        vi.advanceTimersByTime(20_001);
      });

      expect(result.current.phase).toBe('warming');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays warming while the team session is starting', () => {
    ensureSessionMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    act(() => {
      sessionStatusListener?.({ team_id: 'team-1', status: 'starting', phase: 'attaching_agents' });
    });

    expect(result.current.phase).toBe('warming');
  });

  it('becomes ready from the team session ready event', () => {
    ensureSessionMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    act(() => {
      sessionStatusListener?.({ team_id: 'team-1', status: 'ready', server_count: 3 });
    });

    expect(result.current.phase).toBe('ready');
  });

  it('goes to error from the team session failed event', () => {
    ensureSessionMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    act(() => {
      sessionStatusListener?.({
        team_id: 'team-1',
        status: 'failed',
        phase: 'attaching_agents',
        error: 'attach failed',
      });
    });

    expect(result.current.phase).toBe('error');
  });

  it('accepts ready to failed when dynamic reconciliation fails', () => {
    ensureSessionMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    act(() => {
      sessionStatusListener?.({ team_id: 'team-1', status: 'ready', server_count: 2 });
    });
    expect(result.current.phase).toBe('ready');

    act(() => {
      sessionStatusListener?.({
        team_id: 'team-1',
        status: 'failed',
        phase: 'attaching_agents',
        error: 'Agent runtime failed to start',
      });
    });
    expect(result.current.phase).toBe('error');
  });

  it('retries ensureSession in place and transitions error to warming to ready', async () => {
    ensureSessionMock.mockRejectedValueOnce(new Error('attach failed')).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useTeamWarmup('team-1'));
    await waitFor(() => expect(result.current.phase).toBe('error'));

    act(() => result.current.retry());
    expect(result.current.phase).toBe('warming');
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(ensureSessionMock).toHaveBeenCalledTimes(2);
    expect(ensureSessionMock).toHaveBeenNthCalledWith(2, { team_id: 'team-1' });
  });

  it('returns to error when an in-place retry fails', async () => {
    ensureSessionMock
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('retry failure'));
    const { result } = renderHook(() => useTeamWarmup('team-1'));
    await waitFor(() => expect(result.current.phase).toBe('error'));

    act(() => result.current.retry());
    expect(result.current.phase).toBe('warming');
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(ensureSessionMock).toHaveBeenCalledTimes(2);
  });

  it('ignores session status events from other teams', () => {
    ensureSessionMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    act(() => {
      sessionStatusListener?.({ team_id: 'other-team', status: 'ready' });
    });

    expect(result.current.phase).toBe('warming');
  });

  it('captures the failure reason on a failed member', () => {
    ensureSessionMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    act(() => {
      runtimeListener?.({
        team_id: 'team-1',
        slot_id: 'gemini',
        conversation_id: 'c2',
        status: 'failed',
        error: 'ACP error',
      });
    });
    const member = result.current.runtimeStatus.get('gemini');
    expect(member?.status).toBe('failed');
    expect(member?.error).toBe('ACP error');
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
