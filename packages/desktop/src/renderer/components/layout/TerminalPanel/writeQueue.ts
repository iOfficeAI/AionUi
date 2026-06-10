/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Serialized write queue for streaming text into xterm.
 *
 * `term.write(data, cb)` in xterm.js is asynchronous: the callback fires when
 * the parser has consumed that chunk. Naively calling `term.write` on every
 * PTY event lets unbounded chunks pile up in the parser's internal buffer and
 * grow memory linearly during floods.
 *
 * `createWriteQueue` keeps at most one chunk in flight. Every other chunk
 * is concatenated into a tail buffer (capped at `concatMaxBytes`) and handed
 * to the sink in drain order when the previous write's callback fires. The
 * function is intentionally pure-ish — it has no xterm dependency, takes a
 * generic `write(data, cb)` function so it can be unit-tested with a fake.
 *
 * Memory bound: each per-write chunk is at most `concatMaxBytes` long. When
 * the pending buffer crosses the cap, we ship the head and queue the rest
 * as the new tail — the callback chain pumps the rest out in `cap`-sized
 * slices until empty.
 */

export type WriteQueue = {
  /** Enqueue data for writing. Safe to call at any rate. */
  enqueue: (data: string) => void;
  /** Stop further writes; no further callbacks will fire. */
  dispose: () => void;
  /** True when a write is currently in flight to the underlying sink. */
  get inFlight(): boolean;
};

export type XtermLikeWrite = (data: string, cb: () => void) => void;

const DEFAULT_CONCAT_MAX_BYTES = 1024 * 1024; // 1 MB

export function createWriteQueue(write: XtermLikeWrite, options?: { concatMaxBytes?: number }): WriteQueue {
  const concatMax = Math.max(1, options?.concatMaxBytes ?? DEFAULT_CONCAT_MAX_BYTES);
  let pending = '';
  let disposed = false;
  let inFlight = false;
  let scheduled = false;

  // Ship the current `pending` buffer to the sink and clear it. The next
  // drain is kicked off by the in-flight callback (or scheduled via
  // setTimeout if a chunk is already waiting).
  const drain = (): void => {
    scheduled = false;
    if (disposed) return;
    inFlight = true;
    // If the buffer is over the cap (can happen when an enqueue burst blew
    // past the cap before any callback fired), split it: send the first
    // cap-sized slice, queue the rest as the new tail. The callback will
    // chain into another drain to pump the remainder.
    let chunk: string;
    if (pending.length > concatMax) {
      chunk = pending.slice(0, concatMax);
      pending = pending.slice(concatMax);
    } else {
      chunk = pending;
      pending = '';
    }
    write(chunk, () => {
      inFlight = false;
      if (disposed) return;
      if (pending.length > 0) {
        // setTimeout(0) keeps the call stack shallow and gives xterm's
        // parser a chance to settle between writes.
        scheduleDrain();
      }
    });
  };

  // Coalesce multiple enqueue() calls that all need a drain into a single
  // setTimeout. Without this, back-to-back enqueue calls each schedule their
  // own drain tick; with it, we run drain once and let the callback chain
  // pick up the rest.
  const scheduleDrain = (): void => {
    if (scheduled || inFlight || disposed) return;
    scheduled = true;
    setTimeout(drain, 0);
  };

  return {
    enqueue(data: string): void {
      if (disposed || data.length === 0) return;
      pending += data;
      // If the buffer has crossed the cap, kick off a drain — the buffer
      // may be several caps long; the drain() helper will split it into
      // cap-sized slices itself.
      if (pending.length >= concatMax) {
        scheduleDrain();
      } else if (!inFlight) {
        scheduleDrain();
      }
    },
    dispose(): void {
      disposed = true;
      pending = '';
    },
    get inFlight(): boolean {
      return inFlight;
    },
  };
}
