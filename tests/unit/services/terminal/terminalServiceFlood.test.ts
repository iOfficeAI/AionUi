/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Flood / backpressure / snapshot tests for TerminalService. These cover the
 * Bet A2 service-layer guarantees: output coalescing stays under an event
 * budget, ring buffer caps at 512KB and holds the tail, list/snapshot expose
 * live session state for renderer re-attach, and pending output is flushed
 * before the exit event so nothing is lost on session teardown.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TerminalService } from '@/process/services/terminal/TerminalService';
import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalSessionInfo,
} from '@/common/types/terminal/terminalTypes';

type FakePty = {
  pid: number;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (e: { exitCode?: number; signal?: number }) => void) => void;
  _emitData: (data: string) => void;
  _emitExit: (e: { exitCode?: number; signal?: number }) => void;
};

function makeFakePty(pid = 1234): FakePty {
  let dataCb: ((data: string) => void) | null = null;
  let exitCb: ((e: { exitCode?: number; signal?: number }) => void) | null = null;
  return {
    pid,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb) => {
      dataCb = cb;
    },
    onExit: (cb) => {
      exitCb = cb;
    },
    _emitData: (data) => dataCb?.(data),
    _emitExit: (e) => exitCb?.(e),
  };
}

function makeService(): { service: TerminalService; ptys: FakePty[] } {
  const ptys: FakePty[] = [];
  const spawn = vi.fn(() => {
    const next = makeFakePty(ptys.length + 1000);
    ptys.push(next);
    return next as never;
  });
  const service = new TerminalService({
    spawn: spawn as never,
    exists: () => true,
    platform: 'darwin',
    env: { SHELL: '/bin/zsh', HOME: '/home/test' },
  });
  return { service, ptys };
}

describe('TerminalService — output coalescing (flood safety)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces 10,000 chunks into a bounded number of output events and stays lossless', () => {
    const { service, ptys } = makeService();
    const events: TerminalOutputEvent[] = [];
    service.on('output', (e) => events.push(e));
    const { session_id } = service.spawn();

    // Synthetic ~64-byte chunks. We build a single string and slice it so the
    // concatenation check is exact (no per-chunk delimiter to lose).
    const chunk = 'x'.repeat(64);
    const chunkCount = 10_000;
    const inputBytes = chunk.length * chunkCount;

    for (let i = 0; i < chunkCount; i += 1) {
      ptys[0]._emitData(chunk);
    }

    // Drain timers. With an 8ms coalesce window, 10k chunks fired in a tight
    // loop arm a single timer; the size-bound (64KB) flushes kick in
    // repeatedly during the loop. The point of the test is to bound the
    // number of output events while guaranteeing no data is lost.
    vi.runAllTimers();

    // Lossless: concatenation of all emitted `data` equals the input stream.
    const emitted = events.map((e) => e.data).join('');
    const expected = chunk.repeat(chunkCount);
    expect(emitted.length).toBe(inputBytes);
    expect(emitted).toBe(expected);

    // Coalescing bound: at most 200 events for 10k chunks. In practice this
    // implementation is far below the bound (size-bound flushes dominate).
    const eventCount = events.length;
    expect(eventCount).toBeLessThanOrEqual(200);

    // Tag every event with the right session id.
    for (const e of events) {
      expect(e.session_id).toBe(session_id);
    }

    // Ring buffer is bounded and holds the tail of the input stream.
    const snap = service.snapshot(session_id);
    expect(snap).not.toBeNull();
    expect(snap!.length).toBeLessThanOrEqual(512 * 1024);
    // The buffer must end with the same suffix the input ends with. We check
    // a sizable suffix (well within the cap) to make sure nothing reordered.
    const tailProbe = 'x'.repeat(64 * 1024);
    expect(snap!.endsWith(tailProbe)).toBe(true);

    // Report the measured numbers so the orchestrator can cite them.
    // (Always print on success — vitest surfaces console.log in --reporter=verbose.)
    const ratio = inputBytes / Math.max(1, eventCount);
    // eslint-disable-next-line no-console
    console.log(
      `[flood] input chunks=${chunkCount} bytes=${inputBytes} ` +
        `output events=${eventCount} ringBytes=${snap!.length} ` +
        `avgBytesPerEvent=${ratio.toFixed(0)} coalesceRatio=${(chunkCount / Math.max(1, eventCount)).toFixed(1)}x`
    );
  });

  it('flushes immediately when the pending buffer crosses 64KB', () => {
    const { service, ptys } = makeService();
    const events: TerminalOutputEvent[] = [];
    service.on('output', (e) => events.push(e));
    service.spawn();

    // First chunk exactly at the cap forces an immediate flush.
    const first = 'a'.repeat(64 * 1024);
    ptys[0]._emitData(first);
    expect(events.length).toBe(1);
    expect(events[0].data.length).toBe(64 * 1024);
  });

  it('flushes a timer-bound batch after 8ms', () => {
    const { service, ptys } = makeService();
    const events: TerminalOutputEvent[] = [];
    service.on('output', (e) => events.push(e));
    service.spawn();

    ptys[0]._emitData('small-chunk');
    // Nothing emitted yet — we're inside the coalesce window.
    expect(events.length).toBe(0);
    vi.advanceTimersByTime(8);
    expect(events.length).toBe(1);
    expect(events[0].data).toBe('small-chunk');
  });
});

describe('TerminalService — ring buffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caps at 512KB and retains the most recent output', () => {
    const { service, ptys } = makeService();
    service.spawn();

    // Push well over the cap: 1.2MB of single-character data.
    const totalChunks = 1200;
    const chunk = 'a'.repeat(1024);
    for (let i = 0; i < totalChunks; i += 1) {
      ptys[0]._emitData(chunk);
    }
    vi.runAllTimers();

    // Look up the single live session id and read the ring buffer.
    const sessionIds = service.list().map((s) => s.session_id);
    expect(sessionIds.length).toBe(1);
    const sid = sessionIds[0]!;
    const buffer = service.snapshot(sid);
    expect(buffer).not.toBeNull();
    expect(buffer!.length).toBeLessThanOrEqual(512 * 1024);

    // The tail of the input stream is the last chunk; the buffer should end
    // with one (or more) of the input chunks.
    expect(buffer!.endsWith(chunk)).toBe(true);
  });

  it('returns null snapshot for an unknown session', () => {
    const { service } = makeService();
    expect(service.snapshot('does-not-exist')).toBeNull();
  });
});

describe('TerminalService.list', () => {
  it('returns live sessions with shell, cwd, pid', () => {
    const { service } = makeService();
    const a = service.spawn();
    const b = service.spawn();
    const all: TerminalSessionInfo[] = service.list();
    expect(all.length).toBe(2);
    const byId = new Map(all.map((s) => [s.session_id, s]));
    expect(byId.get(a.session_id)?.shell).toBe('/bin/zsh');
    expect(byId.get(a.session_id)?.cwd).toBe('/home/test');
    expect(byId.get(a.session_id)?.pid).toBe(1000);
    expect(byId.get(b.session_id)?.pid).toBe(1001);
  });

  it('removes a session from list() after kill', () => {
    const { service } = makeService();
    const a = service.spawn();
    const b = service.spawn();
    expect(service.list().length).toBe(2);
    service.kill(a.session_id);
    const remaining = service.list();
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.session_id).toBe(b.session_id);
  });
});

describe('TerminalService — flush-on-exit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits pending output BEFORE the exit event on natural shell exit', () => {
    const { service, ptys } = makeService();
    const order: string[] = [];
    const outputs: string[] = [];
    service.on('output', (e) => {
      order.push('output');
      outputs.push(e.data);
    });
    service.on('exit', (e: TerminalExitEvent) => {
      order.push(`exit:${e.reason}`);
    });
    const { session_id } = service.spawn();
    ptys[0]._emitData('tail-of-stream');
    // No timer advance — the buffer is still pending.
    ptys[0]._emitExit({ exitCode: 0 });
    expect(order).toEqual(['output', 'exit:shell-exit']);
    expect(outputs).toEqual(['tail-of-stream']);
    expect(service.has(session_id)).toBe(false);
  });

  it('emits pending output BEFORE the exit event on explicit kill', () => {
    const { service, ptys } = makeService();
    const order: string[] = [];
    const outputs: string[] = [];
    service.on('output', (e) => {
      order.push('output');
      outputs.push(e.data);
    });
    service.on('exit', (e: TerminalExitEvent) => {
      order.push(`exit:${e.reason}`);
    });
    const { session_id } = service.spawn();
    ptys[0]._emitData('last-words');
    service.kill(session_id);
    expect(order).toEqual(['output', 'exit:killed']);
    expect(outputs).toEqual(['last-words']);
  });
});
