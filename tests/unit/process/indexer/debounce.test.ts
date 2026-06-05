/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Chisl indexer debounce/batch helper.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDebouncedBatch } from '@/process/services/indexer/debounce';

describe('createDebouncedBatch', () => {
  it('coalesces repeated adds within the debounce window into a single flush', async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batch = createDebouncedBatch<string>(100, onFlush);

    batch.add('a');
    batch.add('b');
    batch.add('a'); // duplicate, should be deduplicated by Set
    expect(batch.size).toBe(2);

    await vi.advanceTimersByTimeAsync(110);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(['a', 'b']);
    expect(batch.size).toBe(0);
    vi.useRealTimers();
  });

  it('resets the timer on each add so the flush fires after the last add', async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batch = createDebouncedBatch<string>(100, onFlush);

    batch.add('a');
    await vi.advanceTimersByTimeAsync(80);
    batch.add('b');
    await vi.advanceTimersByTimeAsync(80);
    expect(onFlush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(['a', 'b']);
    vi.useRealTimers();
  });

  it('flush() emits the pending batch immediately', () => {
    const onFlush = vi.fn();
    const batch = createDebouncedBatch<string>(1000, onFlush);
    batch.add('x');
    batch.add('y');
    batch.flush();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(['x', 'y']);
    expect(batch.size).toBe(0);
  });

  it('clear() cancels any pending flush and discards items', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batch = createDebouncedBatch<string>(100, onFlush);
    batch.add('a');
    batch.clear();
    expect(batch.size).toBe(0);
    vi.advanceTimersByTime(200);
    expect(onFlush).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('flush() is a no-op when nothing is pending', () => {
    const onFlush = vi.fn();
    const batch = createDebouncedBatch<string>(50, onFlush);
    batch.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });
});
