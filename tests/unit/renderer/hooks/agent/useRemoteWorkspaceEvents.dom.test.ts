/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Behavioral tests for the shared `useRemoteWorkspaceEvents` hook.
 *
 * The hook wraps the WS-broadcast `remote.workspaceChanged` and
 * `remote.sessionHealth` emitters with a module-level singleton so a
 * fleet of consumers doesn't open identical `.on` subscriptions. The
 * tests exercise:
 *   - per-agent_id filter (only matching events fire)
 *   - 200 ms client-side debounce coalesces bursts
 *   - the singleton opens ONE `.on` subscription even with N consumers
 *   - consumers unsubscribed on unmount
 *   - the same behavior for `sessionHealth` (no debounce)
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteSessionHealthEvent, RemoteWorkspaceChangedEvent } from '@/common/types/agent/bgProcessTypes';

// Capture every `(cb) => off` registration made by consumers during a
// test. The mock returns the SAME `off` function reference so we can
// assert the cleanup was called.
type WorkspaceListener = (event: RemoteWorkspaceChangedEvent) => void;
type SessionHealthListener = (event: RemoteSessionHealthEvent) => void;

// `vi.mock` is hoisted above the imports, so any state it touches must
// be initialized via `vi.hoisted` (also hoisted) to avoid TDZ errors.
const mockState = vi.hoisted(() => ({
  workspaceListeners: [] as WorkspaceListener[],
  sessionHealthListeners: [] as SessionHealthListener[],
  workspaceOffCalls: 0,
  sessionHealthOffCalls: 0,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    remoteAgent: {
      workspaceChanged: {
        on: (cb: WorkspaceListener) => {
          mockState.workspaceListeners.push(cb);
          return () => {
            mockState.workspaceOffCalls += 1;
            mockState.workspaceListeners = mockState.workspaceListeners.filter((existing) => existing !== cb);
          };
        },
      },
      sessionHealth: {
        on: (cb: SessionHealthListener) => {
          mockState.sessionHealthListeners.push(cb);
          return () => {
            mockState.sessionHealthOffCalls += 1;
            mockState.sessionHealthListeners = mockState.sessionHealthListeners.filter((existing) => existing !== cb);
          };
        },
      },
    },
  },
}));

import {
  __test__ as useRemoteWorkspaceEventsTest,
  useRemoteSessionHealth,
  useRemoteWorkspaceChanged,
} from '@/renderer/hooks/agent/useRemoteWorkspaceEvents';

beforeEach(() => {
  // Wipe the module-level singleton so test isolation holds even when
  // a previous case's hook has been unmounted by React.
  useRemoteWorkspaceEventsTest.__resetSingletons();
  mockState.workspaceListeners = [];
  mockState.sessionHealthListeners = [];
  mockState.workspaceOffCalls = 0;
  mockState.sessionHealthOffCalls = 0;
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const fireWorkspace = (event: RemoteWorkspaceChangedEvent): void => {
  // Snapshot to defend against mutation during dispatch.
  for (const listener of [...mockState.workspaceListeners]) listener(event);
};

const fireSessionHealth = (event: RemoteSessionHealthEvent): void => {
  for (const listener of [...mockState.sessionHealthListeners]) listener(event);
};

describe('useRemoteWorkspaceChanged — agent filter', () => {
  it('fires the callback for the matching agent_id', () => {
    const cb = vi.fn();
    renderHook(() => useRemoteWorkspaceChanged('agent-a', cb, { debounceMs: 0 }));

    act(() => {
      fireWorkspace({ agent_id: 'agent-a', file: '/foo.ts' });
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ agent_id: 'agent-a', file: '/foo.ts' });
  });

  it('does not fire for a different agent_id', () => {
    const cb = vi.fn();
    renderHook(() => useRemoteWorkspaceChanged('agent-a', cb, { debounceMs: 0 }));

    act(() => {
      fireWorkspace({ agent_id: 'agent-b', file: '/foo.ts' });
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it('passes through all agents when agentId is null', () => {
    const cb = vi.fn();
    renderHook(() => useRemoteWorkspaceChanged(null, cb, { debounceMs: 0 }));

    act(() => {
      fireWorkspace({ agent_id: 'agent-a' });
      fireWorkspace({ agent_id: 'agent-b' });
    });

    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe('useRemoteWorkspaceChanged — debounce', () => {
  it('coalesces a burst of events into one trailing fire (200ms default)', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    renderHook(() => useRemoteWorkspaceChanged(null, cb));

    act(() => {
      fireWorkspace({ agent_id: 'a', file: '/1' });
      fireWorkspace({ agent_id: 'a', file: '/2' });
      fireWorkspace({ agent_id: 'a', file: '/3' });
    });

    // Before the debounce window elapses, no callback has fired.
    expect(cb).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Trailing fire carries the LAST event in the burst.
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ agent_id: 'a', file: '/3' });
  });

  it('honors a custom debounceMs', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    renderHook(() => useRemoteWorkspaceChanged(null, cb, { debounceMs: 50 }));

    act(() => {
      fireWorkspace({ agent_id: 'a' });
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('debounceMs: 0 fires immediately', () => {
    const cb = vi.fn();
    renderHook(() => useRemoteWorkspaceChanged(null, cb, { debounceMs: 0 }));

    act(() => {
      fireWorkspace({ agent_id: 'a' });
      fireWorkspace({ agent_id: 'a' });
    });
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe('useRemoteWorkspaceChanged — subscription lifecycle', () => {
  it('opens exactly one .on subscription for the lifetime of the hook (singleton)', () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    renderHook(() => useRemoteWorkspaceChanged('agent-a', cbA, { debounceMs: 0 }));
    renderHook(() => useRemoteWorkspaceChanged('agent-b', cbB, { debounceMs: 0 }));

    // The module-level singleton must register the .on exactly once
    // for the workspaceChanged event, regardless of consumer count.
    expect(mockState.workspaceListeners).toHaveLength(1);

    // Both consumers still receive their filtered callbacks.
    act(() => {
      fireWorkspace({ agent_id: 'agent-a', file: '/x' });
      fireWorkspace({ agent_id: 'agent-b', file: '/y' });
    });
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes the singleton when the last consumer unmounts', () => {
    const { unmount } = renderHook(() => useRemoteWorkspaceChanged('agent-a', vi.fn(), { debounceMs: 0 }));
    expect(mockState.workspaceListeners).toHaveLength(1);
    expect(mockState.workspaceOffCalls).toBe(0);

    unmount();
    expect(mockState.workspaceOffCalls).toBe(1);
    expect(mockState.workspaceListeners).toHaveLength(0);
  });

  it('does not unsubscribe while other consumers are still mounted', () => {
    const first = renderHook(() => useRemoteWorkspaceChanged('agent-a', vi.fn(), { debounceMs: 0 }));
    renderHook(() => useRemoteWorkspaceChanged('agent-b', vi.fn(), { debounceMs: 0 }));
    expect(mockState.workspaceListeners).toHaveLength(1);

    first.unmount();
    expect(mockState.workspaceOffCalls).toBe(0);
    expect(mockState.workspaceListeners).toHaveLength(1);
  });

  it('re-subscribes when a new consumer mounts after the singleton was torn down', () => {
    const first = renderHook(() => useRemoteWorkspaceChanged('agent-a', vi.fn(), { debounceMs: 0 }));
    first.unmount();
    expect(mockState.workspaceListeners).toHaveLength(0);

    renderHook(() => useRemoteWorkspaceChanged('agent-b', vi.fn(), { debounceMs: 0 }));
    expect(mockState.workspaceListeners).toHaveLength(1);
  });
});

describe('useRemoteSessionHealth', () => {
  it('fires for matching agent_id and ignores others', () => {
    const cb = vi.fn();
    renderHook(() => useRemoteSessionHealth('agent-a', cb));

    act(() => {
      fireSessionHealth({ agent_id: 'agent-a', kind: 'idle' });
      fireSessionHealth({ agent_id: 'agent-b', kind: 'idle' });
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toMatchObject({ agent_id: 'agent-a', kind: 'idle' });
  });

  it('passes through every event when agentId is null', () => {
    const cb = vi.fn();
    renderHook(() => useRemoteSessionHealth(null, cb));

    act(() => {
      fireSessionHealth({ agent_id: 'a', kind: 'idle' });
      fireSessionHealth({ agent_id: 'b', kind: 'error', message: 'boom' });
    });

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][0]).toMatchObject({ kind: 'error', message: 'boom' });
  });

  it('no debounce — bursts are passed through immediately', () => {
    const cb = vi.fn();
    renderHook(() => useRemoteSessionHealth(null, cb));

    act(() => {
      fireSessionHealth({ agent_id: 'a', kind: 'idle' });
      fireSessionHealth({ agent_id: 'a', kind: 'error' });
      fireSessionHealth({ agent_id: 'a', kind: 'idle' });
    });

    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useRemoteSessionHealth('agent-a', vi.fn()));
    expect(mockState.sessionHealthListeners).toHaveLength(1);
    unmount();
    expect(mockState.sessionHealthOffCalls).toBe(1);
    expect(mockState.sessionHealthListeners).toHaveLength(0);
  });
});
