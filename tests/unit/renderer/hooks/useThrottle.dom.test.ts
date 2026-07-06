/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useThrottle from '@/renderer/hooks/ui/useThrottle';

describe('useThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('runs a trailing callback while the hook remains mounted', () => {
    const callback = vi.fn<(value: string) => void>();
    const { result } = renderHook(() => useThrottle(callback, 100, []));

    act(() => {
      result.current('initial');
    });
    expect(callback).toHaveBeenCalledWith('initial');
    callback.mockClear();

    act(() => {
      result.current('queued');
      vi.advanceTimersByTime(99);
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(callback).toHaveBeenCalledWith('queued');
  });

  it('does not run a queued trailing callback after unmount', () => {
    const callback = vi.fn<(value: string) => void>();
    const { result, unmount } = renderHook(() => useThrottle(callback, 100, []));

    act(() => {
      result.current('initial');
    });
    expect(callback).toHaveBeenCalledWith('initial');
    callback.mockClear();

    act(() => {
      result.current('queued');
    });
    unmount();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(callback).not.toHaveBeenCalled();
  });
});
