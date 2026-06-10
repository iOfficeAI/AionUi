/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Behavioral tests for the terminal write queue helper. The queue is a
 * pure-ish wrapper around any `write(data, cb)`-shaped sink (xterm.js
 * `term.write`), so we can exercise it with a fake that records calls in
 * order and invokes the callback manually.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWriteQueue } from '@/renderer/components/layout/TerminalPanel/writeQueue';

type WriteCall = { data: string };
type FakeWrite = (data: string, cb: () => void) => void;

const makeFakeSink = (): { write: FakeWrite; calls: WriteCall[]; callbacks: Array<() => void> } => {
  const calls: WriteCall[] = [];
  const callbacks: Array<() => void> = [];
  const write: FakeWrite = (data, cb) => {
    calls.push({ data });
    callbacks.push(cb);
  };
  return { write, calls, callbacks };
};

const flushOne = (sink: { callbacks: Array<() => void> }): void => {
  const cb = sink.callbacks.shift();
  if (!cb) throw new Error('no pending callback to flush');
  cb();
};

const flushAll = (sink: { callbacks: Array<() => void> }): void => {
  while (sink.callbacks.length > 0) flushOne(sink);
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createWriteQueue — chaining', () => {
  it('does not start a second write until the first callback fires', () => {
    const sink = makeFakeSink();
    const queue = createWriteQueue(sink.write);

    queue.enqueue('A');
    // No synchronous write — the queue defers to setTimeout.
    expect(sink.calls).toEqual([]);
    expect(queue.inFlight).toBe(false);

    vi.runAllTimers();
    expect(sink.calls).toEqual([{ data: 'A' }]);
    expect(queue.inFlight).toBe(true);

    // A second enqueue while A is in flight is held in the tail buffer.
    queue.enqueue('B');
    expect(sink.calls).toEqual([{ data: 'A' }]);

    // Drain A — the queue's callback should kick off B on the next tick.
    flushOne(sink);
    expect(queue.inFlight).toBe(false);
    expect(sink.calls).toEqual([{ data: 'A' }]);
    vi.runAllTimers();
    expect(sink.calls).toEqual([{ data: 'A' }, { data: 'B' }]);
    flushOne(sink);
  });

  it('serializes an in-flight write and concatenates follow-up writes losslessly', () => {
    const sink = makeFakeSink();
    const queue = createWriteQueue(sink.write);

    queue.enqueue('one');
    vi.runAllTimers();
    queue.enqueue('two');
    queue.enqueue('three');
    // 'one' is in flight; 'two' and 'three' pile up in the tail buffer.
    expect(sink.calls).toEqual([{ data: 'one' }]);

    flushOne(sink);
    vi.runAllTimers();
    // After the in-flight write resolves, the queue concatenates everything
    // that piled up in the tail into a single next write.
    expect(sink.calls.map((c) => c.data)).toEqual(['one', 'twothree']);

    flushOne(sink);
  });
});

describe('createWriteQueue — concatenation', () => {
  it('concatenates chunks enqueued in the same tick into a single write', () => {
    const sink = makeFakeSink();
    const queue = createWriteQueue(sink.write);

    queue.enqueue('foo');
    queue.enqueue('bar');
    queue.enqueue('baz');
    vi.runAllTimers();
    expect(sink.calls).toEqual([{ data: 'foobarbaz' }]);
  });

  it('preserves chunk order across multiple drains', () => {
    const sink = makeFakeSink();
    const queue = createWriteQueue(sink.write);

    queue.enqueue('a');
    queue.enqueue('b');
    vi.runAllTimers();
    expect(sink.calls.map((c) => c.data)).toEqual(['ab']);

    flushOne(sink);
    queue.enqueue('c');
    queue.enqueue('d');
    vi.runAllTimers();
    expect(sink.calls.map((c) => c.data)).toEqual(['ab', 'cd']);

    flushOne(sink);
    queue.enqueue('e');
    vi.runAllTimers();
    expect(sink.calls.map((c) => c.data)).toEqual(['ab', 'cd', 'e']);

    flushAll(sink);
  });
});

describe('createWriteQueue — concatenation cap', () => {
  it('splits an oversized enqueue into multiple writes at the cap boundary', () => {
    const sink = makeFakeSink();
    const queue = createWriteQueue(sink.write, { concatMaxBytes: 8 });

    queue.enqueue('12345678'); // exactly the cap
    vi.runAllTimers();
    expect(sink.calls.map((c) => c.data)).toEqual(['12345678']);
    flushOne(sink);

    queue.enqueue('abcdefgh'); // another full cap
    vi.runAllTimers();
    expect(sink.calls.map((c) => c.data)).toEqual(['12345678', 'abcdefgh']);
    flushOne(sink);

    // 5 + 5 with cap=8 should split into a first write of 8 chars and a
    // second write of the remaining 2.
    queue.enqueue('xxxxx');
    queue.enqueue('yyyyy');
    vi.runAllTimers();
    expect(sink.calls.map((c) => c.data)).toEqual(['12345678', 'abcdefgh', 'xxxxxyyy']);
    flushOne(sink);
    vi.runAllTimers();
    expect(sink.calls.map((c) => c.data)).toEqual(['12345678', 'abcdefgh', 'xxxxxyyy', 'yy']);
    flushOne(sink);
  });

  it('caps the per-write buffer at concatMaxBytes when more data piles up', () => {
    const sink = makeFakeSink();
    const queue = createWriteQueue(sink.write, { concatMaxBytes: 4 });

    queue.enqueue('aaa');
    queue.enqueue('bbb');
    queue.enqueue('ccc');
    vi.runAllTimers();
    // Three 3-char chunks = 9 chars; the first write carries the first 4
    // chars ('aaab'), the next write must not exceed 4 either.
    const first = sink.calls[0]?.data ?? '';
    expect(first.length).toBeLessThanOrEqual(4);
    expect(first).toBe('aaab');
    flushAll(sink);
  });
});

describe('createWriteQueue — drain order', () => {
  it('preserves chronological order of chunks enqueued across drain boundaries', () => {
    const sink = makeFakeSink();
    const queue = createWriteQueue(sink.write);

    for (const chunk of ['x', 'y', 'z', '1', '2', '3', '!']) {
      queue.enqueue(chunk);
    }
    // Pump until everything is consumed.
    let safety = 100;
    while (sink.callbacks.length > 0 && safety-- > 0) {
      vi.runAllTimers();
      flushOne(sink);
    }
    vi.runAllTimers();
    const concatenated = sink.calls.map((c) => c.data).join('');
    expect(concatenated).toBe('xyz123!');
  });
});

describe('createWriteQueue — disposal', () => {
  it('stops writing after dispose and ignores further enqueues', () => {
    const sink = makeFakeSink();
    const queue = createWriteQueue(sink.write);

    queue.enqueue('A');
    vi.runAllTimers();
    expect(sink.calls.length).toBe(1);

    queue.dispose();
    queue.enqueue('B');
    vi.runAllTimers();
    expect(sink.calls.length).toBe(1);

    // Flushing the in-flight callback must not start a new write.
    flushOne(sink);
    expect(sink.calls.length).toBe(1);
  });

  it('treats empty enqueues as no-ops', () => {
    const sink = makeFakeSink();
    const queue = createWriteQueue(sink.write);
    queue.enqueue('');
    vi.runAllTimers();
    expect(sink.calls).toEqual([]);
  });
});
