/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { minutes?: number }) => (opts?.minutes ? `${k}:${opts.minutes}` : k),
  }),
}));

const { mockMessage, mockIpcBridge, streamState } = vi.hoisted(() => {
  const streamState = {
    responseStreamHandler: null as (() => void) | null,
    childTurnStartedHandler: null as ((event: any) => void) | null,
  };

  const mockMessage = {
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  };

  const mockIpcBridge = {
    conversation: {
      responseStream: {
        on: vi.fn((fn: () => void) => {
          streamState.responseStreamHandler = fn;
          return vi.fn();
        }),
      },
    },
    acpConversation: {
      responseStream: {
        on: vi.fn((fn: () => void) => {
          streamState.responseStreamHandler = fn;
          return vi.fn();
        }),
      },
    },
    team: {
      slotWorkChanged: { on: vi.fn(() => vi.fn()) },
      runUpdated: { on: vi.fn(() => vi.fn()) },
      runCompleted: { on: vi.fn(() => vi.fn()) },
      runCancelled: { on: vi.fn(() => vi.fn()) },
      runFailed: { on: vi.fn(() => vi.fn()) },
      childTurnStarted: {
        on: vi.fn((fn: (event: any) => void) => {
          streamState.childTurnStartedHandler = fn;
          return vi.fn();
        }),
      },
      childTurnCompleted: { on: vi.fn(() => vi.fn()) },
      attachAgent: { invoke: vi.fn().mockResolvedValue(undefined) },
      cancelRun: { invoke: vi.fn().mockResolvedValue(undefined) },
      pauseSlotWork: { invoke: vi.fn().mockResolvedValue(undefined) },
      restartAgentRuntime: { invoke: vi.fn().mockResolvedValue(undefined) },
      sendMessage: { invoke: vi.fn().mockResolvedValue({ enqueue_status: 'enqueued', message_id: 'm1', run: {} }) },
      sendMessageToAgent: {
        invoke: vi.fn().mockResolvedValue({ enqueue_status: 'enqueued', message_id: 'm1', run: {} }),
      },
    },
  };

  return { mockMessage, mockIpcBridge, streamState };
});

vi.mock('@arco-design/web-react', () => ({
  Message: mockMessage,
}));

vi.mock('@/common', () => ({
  ipcBridge: mockIpcBridge,
}));

import {
  getCachedLastPrompt,
  getWatchdogInterval,
  setCachedLastPrompt,
  setWatchdogInterval,
} from '@/renderer/pages/team/watchdog/teamWatchdogStorage';
import { useTeamWatchdog } from '@/renderer/pages/team/watchdog/useTeamWatchdog';

describe('teamWatchdogStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('reads default 0 when nothing is stored', () => {
    expect(getWatchdogInterval('team-1')).toBe(0);
  });

  it('persists and retrieves valid intervals', () => {
    setWatchdogInterval('team-1', 120_000);
    expect(getWatchdogInterval('team-1')).toBe(120_000);

    setWatchdogInterval('team-1', 300_000);
    expect(getWatchdogInterval('team-1')).toBe(300_000);

    setWatchdogInterval('team-1', 0);
    expect(getWatchdogInterval('team-1')).toBe(0);
  });

  it('stores and retrieves the last sent prompt with files', () => {
    expect(getCachedLastPrompt('team-1')).toBeNull();

    setCachedLastPrompt('team-1', {
      input: 'Build a rust cli',
      files: [],
      slot_id: 'slot-1',
      timestamp: Date.now(),
    });

    const retrieved = getCachedLastPrompt('team-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.input).toBe('Build a rust cli');
    expect(retrieved?.files).toEqual([]);
    expect(retrieved?.slot_id).toBe('slot-1');
    expect(typeof retrieved?.timestamp).toBe('number');

    setCachedLastPrompt('team-1', null);
    expect(getCachedLastPrompt('team-1')).toBeNull();
  });
});

describe('useTeamWatchdog hook', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('initializes with stored interval and permits changing it', () => {
    setWatchdogInterval('team-abc', 300_000);

    const mockTeamRun = {
      state: { slotWorkBySlot: {} },
      reconcile: vi.fn(),
      applyAck: vi.fn(),
      applyLocalPause: vi.fn(),
    };

    const { result } = renderHook(() =>
      useTeamWatchdog({
        team_id: 'team-abc',
        teamRun: mockTeamRun as any,
      })
    );

    expect(result.current.intervalMs).toBe(300_000);
    expect(result.current.isMonitoring).toBe(false);
    expect(result.current.isRecovering).toBe(false);

    act(() => {
      result.current.setIntervalMs(120_000);
    });

    expect(result.current.intervalMs).toBe(120_000);
    expect(getWatchdogInterval('team-abc')).toBe(120_000);
  });

  it('records sent prompt to storage and ref', () => {
    setWatchdogInterval('team-abc', 120_000);

    const mockTeamRun = {
      state: { slotWorkBySlot: {} },
      reconcile: vi.fn(),
      applyAck: vi.fn(),
      applyLocalPause: vi.fn(),
    };

    const { result } = renderHook(() =>
      useTeamWatchdog({
        team_id: 'team-abc',
        teamRun: mockTeamRun as any,
      })
    );

    act(() => {
      result.current.recordSentPrompt({
        input: 'Test watchdog prompt',
        slot_id: 'slot-worker',
      });
    });

    const stored = getCachedLastPrompt('team-abc');
    expect(stored?.input).toBe('Test watchdog prompt');
    expect(stored?.slot_id).toBe('slot-worker');
    expect(result.current.isMonitoring).toBe(true);
  });

  it('detects stall after 2 minutes and auto-triggers recovery and prompt retry', async () => {
    vi.useFakeTimers();
    setWatchdogInterval('team-abc', 120_000);

    const mockTeamRun = {
      state: {
        activeRun: { team_id: 'team-abc', team_run_id: 'run-99' },
        slotWorkBySlot: {
          'slot-lead': { state: 'running', team_run_id: 'run-99' },
        },
      },
      reconcile: vi.fn().mockResolvedValue('applied'),
      applyAck: vi.fn(),
      applyLocalPause: vi.fn(),
    };

    const statusMap = new Map([['slot-lead', { slot_id: 'slot-lead', status: 'active' as const }]]);

    const assistants = [
      { slot_id: 'slot-lead', assistant_name: 'Lead', assistant_backend: 'claude', role: 'leader' as const },
    ];

    const { result } = renderHook(() =>
      useTeamWatchdog({
        team_id: 'team-abc',
        teamRun: mockTeamRun as any,
        statusMap,
        assistants: assistants as any,
      })
    );

    // Prompt was sent
    act(() => {
      result.current.recordSentPrompt({
        input: 'Write a parser',
        slot_id: 'slot-lead',
      });
    });

    expect(result.current.isMonitoring).toBe(true);

    // Fast forward 125 seconds without any responseStream activity
    await act(async () => {
      await vi.advanceTimersByTimeAsync(125_000);
      // Also advance cooldown for recovery
      await vi.advanceTimersByTimeAsync(2_000);
    });

    // Watchdog should have triggered warning toast
    expect(mockMessage.warning).toHaveBeenCalledWith(expect.stringContaining('team.watchdog.triggerToast:2'));

    // Active run should have been cancelled
    expect(mockIpcBridge.team.cancelRun.invoke).toHaveBeenCalledWith({
      team_id: 'team-abc',
      team_run_id: 'run-99',
    });

    // Hung agent runtime restarted
    expect(mockIpcBridge.team.restartAgentRuntime.invoke).toHaveBeenCalledWith({
      team_id: 'team-abc',
      slot_id: 'slot-lead',
    });

    // Reconcile was called
    expect(mockTeamRun.reconcile).toHaveBeenCalledWith('watchdog-recovery');

    // Prompt was retried
    expect(mockIpcBridge.team.sendMessageToAgent.invoke).toHaveBeenCalledWith({
      team_id: 'team-abc',
      slot_id: 'slot-lead',
      input: 'Write a parser',
      files: undefined,
    });
  });

  it('resets idle duration when responseStream receives activity', async () => {
    vi.useFakeTimers();
    setWatchdogInterval('team-abc', 120_000);

    const mockTeamRun = {
      state: {
        activeRun: { team_id: 'team-abc', team_run_id: 'run-99' },
        slotWorkBySlot: {
          'slot-lead': { state: 'running', team_run_id: 'run-99' },
        },
      },
      reconcile: vi.fn(),
      applyAck: vi.fn(),
      applyLocalPause: vi.fn(),
    };

    const statusMap = new Map([['slot-lead', { slot_id: 'slot-lead', status: 'active' as const }]]);

    const assistants = [
      { slot_id: 'slot-lead', assistant_name: 'Lead', assistant_backend: 'claude', role: 'leader' as const },
    ];

    const { result } = renderHook(() =>
      useTeamWatchdog({
        team_id: 'team-abc',
        teamRun: mockTeamRun as any,
        statusMap,
        assistants: assistants as any,
      })
    );

    act(() => {
      result.current.recordSentPrompt({ input: 'Working prompt' });
    });

    // Advance 90s
    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });

    // Stream activity arrives!
    act(() => {
      streamState.responseStreamHandler?.();
    });

    // Advance another 60s (total 150s from start, but only 60s from stream activity)
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    // Recovery should NOT have triggered because only 60s passed since stream activity
    expect(mockMessage.warning).not.toHaveBeenCalled();
    expect(mockIpcBridge.team.cancelRun.invoke).not.toHaveBeenCalled();
  });

  it('handles checkAndRetryNow manually when working', async () => {
    const mockTeamRun = {
      state: {
        activeRun: { team_id: 'team-abc', team_run_id: 'run-99' },
        slotWorkBySlot: {},
      },
      reconcile: vi.fn().mockResolvedValue('applied'),
      applyAck: vi.fn(),
      applyLocalPause: vi.fn(),
    };

    setCachedLastPrompt('team-abc', {
      input: 'Manual retry prompt',
      timestamp: Date.now(),
    });

    const { result } = renderHook(() =>
      useTeamWatchdog({
        team_id: 'team-abc',
        teamRun: mockTeamRun as any,
      })
    );

    await act(async () => {
      await result.current.checkAndRetryNow();
    });

    expect(mockIpcBridge.team.cancelRun.invoke).toHaveBeenCalled();
    expect(mockIpcBridge.team.sendMessage.invoke).toHaveBeenCalledWith({
      team_id: 'team-abc',
      input: 'Manual retry prompt',
      files: undefined,
    });
  });
});
