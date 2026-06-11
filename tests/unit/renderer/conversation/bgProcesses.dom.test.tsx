/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 3 WS2 — Background Processes UI
 *
 * Covers the three core contracts:
 *  1. `useBgProcesses` — initial fetch + WS merge + stop optimistic +
 *     poll gating (running / panel-open / neither).
 *  2. `BgProcessPanel`  — table renders rows + status tags; stop click
 *     calls `stopBgProcess` and the row's status flips; output viewer
 *     polls `readBgProcessOutput` with advancing `offset` and stops
 *     polling on close.
 *  3. `BgProcessIndicator` — hidden when no running processes.
 *
 * IPC is mocked at the `ipcBridge` boundary. The mock object lives in a
 * `vi.hoisted` block so the test bodies and any helper that closes over
 * it share the same instance — same trick the
 * `remoteSessionRevert.dom.test.tsx` file uses.
 */

import type { BgProcessChangedEvent, BgProcessUiInfo } from '@/common/types/agent/bgProcessTypes';
import BgProcessIndicator from '@/renderer/pages/conversation/components/BgProcesses/BgProcessIndicator';
import BgProcessPanel from '@/renderer/pages/conversation/components/BgProcesses/BgProcessPanel';
import { useBgProcesses } from '@/renderer/pages/conversation/hooks/useBgProcesses';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// ─── IPC mock ────────────────────────────────────────────────────────────────
//
// `vi.hoisted` is required because `vi.mock('@/common', ...)` is hoisted
// above the imports — the mock factory body executes at the top, but the
// test bodies and the WS push helpers need to read back the same fn
// references (and feed them the same `event` payload). Hoisting the
// holder makes that possible.

const h = vi.hoisted(() => ({
  listBgProcesses: undefined as undefined | Mock<(p: { id: string }) => Promise<{ processes: BgProcessUiInfo[] }>>,
  stopBgProcess: undefined as undefined | Mock<(p: { id: string; pid: string }) => Promise<BgProcessUiInfo>>,
  readBgProcessOutput: undefined as
    | undefined
    | Mock<
        (p: {
          id: string;
          pid: string;
          offset?: number;
        }) => Promise<{ output: string; next_offset: number; process: BgProcessUiInfo }>
      >,
  /** Subscribers to `bgProcessChanged.on(...)`, captured so tests can push. */
  bgProcessChangedSubscribers: new Set<(e: BgProcessChangedEvent) => void>(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    remoteAgent: {
      listBgProcesses: {
        invoke: vi.fn(async (p: { id: string }) => {
          return h.listBgProcesses ? h.listBgProcesses(p) : { processes: [] };
        }),
      },
      stopBgProcess: {
        invoke: vi.fn(async (p: { id: string; pid: string }) => {
          return h.stopBgProcess
            ? h.stopBgProcess(p)
            : ({
                id: p.pid,
                name: 'p',
                command: 'cmd',
                cwd: '/',
                session_id: 's',
                status: 'killed',
                started_at_ms: 0,
                output_bytes: 0,
                truncated: false,
              } as BgProcessUiInfo);
        }),
      },
      readBgProcessOutput: {
        invoke: vi.fn(async (p: { id: string; pid: string; offset?: number }) => {
          return h.readBgProcessOutput
            ? h.readBgProcessOutput(p)
            : { output: '', next_offset: p.offset ?? 0, process: {} as BgProcessUiInfo };
        }),
      },
      bgProcessChanged: {
        on: vi.fn((cb: (e: BgProcessChangedEvent) => void) => {
          h.bgProcessChangedSubscribers.add(cb);
          return () => h.bgProcessChangedSubscribers.delete(cb);
        }),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number; defaultValue?: string }) => {
      if (opts?.defaultValue !== undefined) {
        if (typeof opts.defaultValue === 'string' && opts.count !== undefined) {
          return opts.defaultValue.replace('{{count}}', String(opts.count));
        }
        return opts.defaultValue;
      }
      return key;
    },
  }),
}));

// Arco Message + Popconfirm: the Popconfirm OK button is rendered into
// a portal that's mounted on `document.body`, not inside the React
// container. We need it to actually navigate to the popover and back
// on `onOk`. Importing the actual Arco implementation works for our
// test scenarios because jsdom is happy with the DOM mutations.

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeProcess = (overrides: Partial<BgProcessUiInfo> = {}): BgProcessUiInfo => ({
  id: 'proc-1',
  name: 'vite',
  command: 'npm run dev',
  cwd: '/workspace',
  session_id: 'sess-1',
  status: 'running',
  started_at_ms: Date.now() - 5_000,
  output_bytes: 0,
  truncated: false,
  ...overrides,
});

// ─── Hook tests ─────────────────────────────────────────────────────────────

describe('useBgProcesses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.bgProcessChangedSubscribers.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1.1 fetches on mount and exposes the returned processes', async () => {
    const processes = [makeProcess({ id: 'p-1', status: 'running' }), makeProcess({ id: 'p-2', status: 'exited' })];
    h.listBgProcesses = vi.fn().mockResolvedValue({ processes });

    const { result } = renderHook(() => useBgProcesses('agent-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.processes).toHaveLength(2);
    // Running first.
    expect(result.current.processes[0]?.id).toBe('p-1');
    expect(result.current.running).toHaveLength(1);
  });

  it('1.2 merges bgProcessChanged WS pushes by id', async () => {
    h.listBgProcesses = vi.fn().mockResolvedValue({
      processes: [makeProcess({ id: 'p-1', status: 'running' })],
    });
    const { result } = renderHook(() => useBgProcesses('agent-1'));

    await waitFor(() => expect(result.current.processes).toHaveLength(1));

    await act(async () => {
      for (const cb of h.bgProcessChangedSubscribers) {
        cb({ agent_id: 'agent-1', process: makeProcess({ id: 'p-1', status: 'exited', exit_code: 0 }) });
      }
    });

    await waitFor(() => expect(result.current.processes[0]?.status).toBe('exited'));
    expect(result.current.running).toHaveLength(0);

    // Different agent_id → ignored.
    await act(async () => {
      for (const cb of h.bgProcessChangedSubscribers) {
        cb({ agent_id: 'other-agent', process: makeProcess({ id: 'p-1', status: 'running' }) });
      }
    });
    expect(result.current.processes[0]?.status).toBe('exited');
  });

  it('1.3 stop() is optimistic + reconciles with the server response', async () => {
    h.listBgProcesses = vi.fn().mockResolvedValue({
      processes: [makeProcess({ id: 'p-1', status: 'running' })],
    });
    h.stopBgProcess = vi.fn().mockResolvedValue(makeProcess({ id: 'p-1', status: 'killed' }));

    const { result } = renderHook(() => useBgProcesses('agent-1'));
    await waitFor(() => expect(result.current.processes).toHaveLength(1));

    await act(async () => {
      await result.current.stop('p-1');
    });

    expect(h.stopBgProcess).toHaveBeenCalledWith({ id: 'agent-1', pid: 'p-1' });
    await waitFor(() => expect(result.current.processes[0]?.status).toBe('killed'));
  });

  it('1.4 stops polling when nothing is running and the panel is closed', async () => {
    vi.useFakeTimers();
    h.listBgProcesses = vi.fn().mockResolvedValue({ processes: [] });

    const { result } = renderHook(() => useBgProcesses('agent-1', { pollIntervalMs: 100 }));
    await act(async () => {
      // Let the initial fetch resolve.
      await Promise.resolve();
    });
    expect(h.listBgProcesses).toHaveBeenCalledTimes(1);

    // After the polling reconciliation tick, no running process + panel
    // closed → no interval is created.
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.isPolling).toBe(false);
    // Only the initial fetch should have fired.
    expect(h.listBgProcesses).toHaveBeenCalledTimes(1);
  });

  it('1.5 polls every N ms while at least one process is running', async () => {
    vi.useFakeTimers();
    h.listBgProcesses = vi.fn().mockResolvedValue({
      processes: [makeProcess({ id: 'p-1', status: 'running' })],
    });

    renderHook(() => useBgProcesses('agent-1', { pollIntervalMs: 100 }));
    // Let initial fetch resolve.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const initialCalls = h.listBgProcesses.mock.calls.length;

    // Advance well past one interval — expect several additional fetches.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(550);
    });
    const laterCalls = h.listBgProcesses.mock.calls.length;
    expect(laterCalls).toBeGreaterThan(initialCalls + 1);
  });

  it('1.6 polls even with zero running when the panel is open', async () => {
    vi.useFakeTimers();
    h.listBgProcesses = vi.fn().mockResolvedValue({ processes: [] });

    const { rerender } = renderHook(
      ({ panelOpen }: { panelOpen: boolean }) =>
        useBgProcesses('agent-1', { pollIntervalMs: 100, pollWhileOpen: panelOpen }),
      {
        initialProps: { panelOpen: false },
      }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const baseline = h.listBgProcesses.mock.calls.length;

    // Flip panel open → reconciliation should start the poll interval.
    rerender({ panelOpen: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    const afterOpen = h.listBgProcesses.mock.calls.length;
    expect(afterOpen).toBeGreaterThan(baseline + 1);
  });
});

// ─── Indicator tests ─────────────────────────────────────────────────────────

describe('BgProcessIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('2.1 renders nothing when there are no running processes', () => {
    const { container } = render(<BgProcessIndicator running={[]} onOpen={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('2.2 shows the running count and opens on click', () => {
    const onOpen = vi.fn();
    const { getByTestId } = render(
      <BgProcessIndicator running={[makeProcess({ id: 'a' }), makeProcess({ id: 'b' })]} onOpen={onOpen} />
    );
    const pill = getByTestId('bg-process-indicator');
    fireEvent.click(pill);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

// ─── Panel + output viewer tests ────────────────────────────────────────────

describe('BgProcessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.bgProcessChangedSubscribers.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('3.1 renders rows with the right status tag colors', async () => {
    h.listBgProcesses = vi.fn().mockResolvedValue({
      processes: [
        makeProcess({ id: 'p-1', status: 'running' }),
        makeProcess({ id: 'p-2', status: 'exited', exit_code: 0 }),
        makeProcess({ id: 'p-3', status: 'killed' }),
      ],
    });

    render(<BgProcessPanel remoteAgentId='agent-1' open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('bg-process-table')).toBeInTheDocument();
    });
    expect(screen.getByTestId('bg-process-status-running')).toBeInTheDocument();
    expect(screen.getByTestId('bg-process-status-exited')).toBeInTheDocument();
    expect(screen.getByTestId('bg-process-status-killed')).toBeInTheDocument();

    // Stop button only on the running row.
    expect(screen.queryByTestId('bg-process-stop-p-1')).toBeInTheDocument();
    expect(screen.queryByTestId('bg-process-stop-p-2')).toBeNull();
    expect(screen.queryByTestId('bg-process-stop-p-3')).toBeNull();
  });

  it('3.2 stop click → stopBgProcess invoked + the row status flips to killed', async () => {
    h.listBgProcesses = vi.fn().mockResolvedValue({
      processes: [makeProcess({ id: 'p-1', status: 'running' })],
    });
    h.stopBgProcess = vi.fn().mockResolvedValue(makeProcess({ id: 'p-1', status: 'killed' }));

    render(<BgProcessPanel remoteAgentId='agent-1' open={true} onClose={vi.fn()} />);

    const stopBtn = await waitFor(() => screen.getByTestId('bg-process-stop-p-1'));

    // Popconfirm needs the parent click first; the OK button appears in a portal.
    fireEvent.click(stopBtn);
    const okButton = await waitFor(() => {
      const el = document.querySelector('button.arco-btn-primary, .arco-popconfirm button.arco-btn-primary');
      if (!el) throw new Error('Popconfirm OK button not yet rendered');
      return el as HTMLElement;
    });
    fireEvent.click(okButton);

    await waitFor(() => expect(h.stopBgProcess).toHaveBeenCalledWith({ id: 'agent-1', pid: 'p-1' }));
    await waitFor(() => expect(screen.getByTestId('bg-process-status-killed')).toBeInTheDocument());
  });

  it('3.3 output viewer polls readBgProcessOutput with advancing offset and stops on unmount', async () => {
    let pendingOutput = 'first chunk\n';
    h.listBgProcesses = vi.fn().mockResolvedValue({
      processes: [makeProcess({ id: 'p-1', status: 'running' })],
    });
    h.readBgProcessOutput = vi.fn(async (p: { id: string; pid: string; offset?: number }) => {
      const start = p.offset ?? 0;
      const slice = pendingOutput.slice(start);
      const next = start + slice.length;
      return {
        output: slice,
        next_offset: next,
        process: makeProcess({ id: 'p-1', status: 'running' }),
      };
    });

    render(<BgProcessPanel remoteAgentId='agent-1' open={true} onClose={vi.fn()} outputPollIntervalMs={20} />);

    // Open the output viewer.
    const viewBtn = await waitFor(() => screen.getByTestId('bg-process-view-output-p-1'));
    fireEvent.click(viewBtn);

    // The first readBgProcessOutput fires immediately on mount.
    await waitFor(() => expect(h.readBgProcessOutput).toHaveBeenCalled());
    const firstCallOffset = h.readBgProcessOutput?.mock.calls[0]?.[0]?.offset ?? 0;

    // Extend output and wait for at least one more poll.
    pendingOutput = 'first chunk\nsecond chunk\n';
    await waitFor(() => expect(h.readBgProcessOutput?.mock.calls.length ?? 0).toBeGreaterThan(1));
    // Latest call must have advanced beyond the first offset.
    const calls = h.readBgProcessOutput?.mock.calls ?? [];
    const lastCall = calls[calls.length - 1]?.[0];
    expect((lastCall?.offset ?? 0) > firstCallOffset).toBe(true);

    // Close the drawer's per-process output viewer → polls stop.
    const closeBtn = screen.getByTestId('bg-process-output-close');
    fireEvent.click(closeBtn);
    const callsAtClose = h.readBgProcessOutput?.mock.calls.length ?? 0;
    await new Promise((r) => setTimeout(r, 100));
    expect(h.readBgProcessOutput?.mock.calls.length ?? 0).toBe(callsAtClose);
  });

  it('3.4 shows the truncated notice when the server marks the output as truncated', async () => {
    h.listBgProcesses = vi.fn().mockResolvedValue({
      processes: [makeProcess({ id: 'p-1', status: 'running' })],
    });
    h.readBgProcessOutput = vi.fn(async () => ({
      output: 'tail',
      next_offset: 4,
      process: makeProcess({ id: 'p-1', status: 'running', truncated: true }),
    }));

    render(<BgProcessPanel remoteAgentId='agent-1' open={true} onClose={vi.fn()} />);
    const viewBtn = await waitFor(() => screen.getByTestId('bg-process-view-output-p-1'));
    fireEvent.click(viewBtn);

    await waitFor(() => {
      expect(screen.getByTestId('bg-process-output-truncated')).toBeInTheDocument();
    });
  });

  it('3.5 reflects bgProcessChanged pushes while the panel is open (status flips live)', async () => {
    h.listBgProcesses = vi.fn().mockResolvedValue({
      processes: [makeProcess({ id: 'p-1', status: 'running' })],
    });

    render(<BgProcessPanel remoteAgentId='agent-1' open={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('bg-process-status-running')).toBeInTheDocument());

    await act(async () => {
      for (const cb of h.bgProcessChangedSubscribers) {
        cb({ agent_id: 'agent-1', process: makeProcess({ id: 'p-1', status: 'exited', exit_code: 0 }) });
      }
    });

    await waitFor(() => expect(screen.getByTestId('bg-process-status-exited')).toBeInTheDocument());
    // Stop button disappears when status flips to non-running.
    expect(screen.queryByTestId('bg-process-stop-p-1')).toBeNull();
  });
});
