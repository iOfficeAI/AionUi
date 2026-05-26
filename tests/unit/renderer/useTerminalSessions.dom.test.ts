/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Behavioral tests for the renderer-side terminal session state.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTerminalSessions } from '@/renderer/components/layout/TerminalPanel/useTerminalSessions';

type ExitListener = (event: { session_id: string; exit_code: number | null }) => void;
let lastExitListener: ExitListener | null = null;

const spawnMock = vi.fn();
const killMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    terminal: {
      spawn: {
        invoke: (...args: unknown[]) => spawnMock(...args),
      },
      kill: {
        invoke: (...args: unknown[]) => killMock(...args),
      },
      exit: {
        on: (cb: ExitListener) => {
          lastExitListener = cb;
          return () => {
            lastExitListener = null;
          };
        },
      },
    },
  },
}));

beforeEach(() => {
  spawnMock.mockReset();
  killMock.mockReset();
  killMock.mockResolvedValue({ success: true });
  lastExitListener = null;
});

describe('useTerminalSessions.openSession', () => {
  it('adds an optimistic tab and patches in the server session_id', async () => {
    spawnMock.mockResolvedValue({
      success: true,
      data: { session_id: 'srv-1', shell: '/bin/zsh', cwd: '/home/x', pid: 42 },
    });

    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await result.current.openSession('/tmp');
    });

    await waitFor(() => {
      expect(result.current.sessions[0]?.session_id).toBe('srv-1');
    });
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]?.shell).toBe('/bin/zsh');
    expect(result.current.activeId).toBe(result.current.sessions[0]?.client_id);
  });

  it('marks the tab as exited when spawn rejects', async () => {
    spawnMock.mockRejectedValue(new Error('shell not found'));

    const { result } = renderHook(() => useTerminalSessions());
    await act(async () => {
      await result.current.openSession();
    });

    await waitFor(() => {
      expect(result.current.sessions[0]?.exited).toBe(true);
    });
  });

  it('marks the tab as exited when spawn returns a failure response', async () => {
    spawnMock.mockResolvedValue({ success: false, msg: 'no shell' });

    const { result } = renderHook(() => useTerminalSessions());
    await act(async () => {
      await result.current.openSession();
    });

    await waitFor(() => {
      expect(result.current.sessions[0]?.exited).toBe(true);
    });
  });
});

describe('useTerminalSessions.closeSession', () => {
  it('kills the PTY and removes the tab', async () => {
    spawnMock.mockResolvedValue({
      success: true,
      data: { session_id: 'srv-1', shell: '/bin/zsh', cwd: '/tmp', pid: 1 },
    });

    const { result } = renderHook(() => useTerminalSessions());
    await act(async () => {
      await result.current.openSession();
    });
    const clientId = result.current.sessions[0].client_id;

    await act(async () => {
      await result.current.closeSession(clientId);
    });

    expect(killMock).toHaveBeenCalledWith({ session_id: 'srv-1' });
    expect(result.current.sessions).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });

  it('moves focus to a neighbor when the active tab is closed', async () => {
    spawnMock
      .mockResolvedValueOnce({
        success: true,
        data: { session_id: 'srv-1', shell: '/bin/zsh', cwd: '/', pid: 1 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { session_id: 'srv-2', shell: '/bin/zsh', cwd: '/', pid: 2 },
      });

    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await result.current.openSession();
    });
    await act(async () => {
      await result.current.openSession();
    });

    const secondTab = result.current.sessions[1].client_id;
    expect(result.current.activeId).toBe(secondTab);

    await act(async () => {
      await result.current.closeSession(secondTab);
    });

    expect(result.current.activeId).toBe(result.current.sessions[0].client_id);
  });

  it('is a no-op for an unknown client_id', async () => {
    const { result } = renderHook(() => useTerminalSessions());
    await act(async () => {
      await result.current.closeSession('nope');
    });
    expect(killMock).not.toHaveBeenCalled();
  });
});

describe('useTerminalSessions exit subscription', () => {
  it('marks the matching tab as exited when the main process emits exit', async () => {
    spawnMock.mockResolvedValue({
      success: true,
      data: { session_id: 'srv-1', shell: '/bin/zsh', cwd: '/', pid: 7 },
    });

    const { result } = renderHook(() => useTerminalSessions());
    await act(async () => {
      await result.current.openSession();
    });

    await waitFor(() => {
      expect(result.current.sessions[0]?.session_id).toBe('srv-1');
    });
    expect(typeof lastExitListener).toBe('function');

    act(() => {
      lastExitListener?.({ session_id: 'srv-1', exit_code: 130 });
    });

    expect(result.current.sessions[0].exited).toBe(true);
    expect(result.current.sessions[0].exit_code).toBe(130);
  });
});

describe('useTerminalSessions.cycleSession', () => {
  it('cycles focus forward and wraps around', async () => {
    spawnMock
      .mockResolvedValueOnce({
        success: true,
        data: { session_id: 's1', shell: '/bin/zsh', cwd: '/', pid: 1 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { session_id: 's2', shell: '/bin/zsh', cwd: '/', pid: 2 },
      });

    const { result } = renderHook(() => useTerminalSessions());
    await act(async () => {
      await result.current.openSession();
    });
    await act(async () => {
      await result.current.openSession();
    });

    const tab0 = result.current.sessions[0].client_id;
    const tab1 = result.current.sessions[1].client_id;
    act(() => result.current.setActive(tab0));

    act(() => result.current.cycleSession(1));
    expect(result.current.activeId).toBe(tab1);

    act(() => result.current.cycleSession(1));
    expect(result.current.activeId).toBe(tab0);
  });

  it('does nothing with fewer than 2 sessions', async () => {
    spawnMock.mockResolvedValue({
      success: true,
      data: { session_id: 's1', shell: '/bin/zsh', cwd: '/', pid: 1 },
    });
    const { result } = renderHook(() => useTerminalSessions());
    await act(async () => {
      await result.current.openSession();
    });
    const before = result.current.activeId;
    act(() => result.current.cycleSession(1));
    expect(result.current.activeId).toBe(before);
  });
});

describe('useTerminalSessions.renameSession', () => {
  it('updates the title and trims whitespace', async () => {
    spawnMock.mockResolvedValue({
      success: true,
      data: { session_id: 's1', shell: '/bin/zsh', cwd: '/', pid: 1 },
    });
    const { result } = renderHook(() => useTerminalSessions());
    await act(async () => {
      await result.current.openSession();
    });
    const id = result.current.sessions[0].client_id;

    act(() => result.current.renameSession(id, '  build  '));
    expect(result.current.sessions[0].title).toBe('build');
  });

  it('ignores an empty title', async () => {
    spawnMock.mockResolvedValue({
      success: true,
      data: { session_id: 's1', shell: '/bin/zsh', cwd: '/', pid: 1 },
    });
    const { result } = renderHook(() => useTerminalSessions());
    await act(async () => {
      await result.current.openSession();
    });
    const id = result.current.sessions[0].client_id;
    const originalTitle = result.current.sessions[0].title;

    act(() => result.current.renameSession(id, '   '));
    expect(result.current.sessions[0].title).toBe(originalTitle);
  });
});
