/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCROLL_SYNC_DEBOUNCE } from '../../src/renderer/pages/conversation/Preview/constants';
import { useScrollSync } from '../../src/renderer/pages/conversation/Preview/hooks/useScrollSync';

type RafCallback = FrameRequestCallback;

describe('useScrollSync', () => {
  const originalRaf = window.requestAnimationFrame;
  const originalCancelRaf = window.cancelAnimationFrame;

  const defineScrollableElement = (el: HTMLDivElement, scrollHeight: number, clientHeight: number): void => {
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      value: scrollHeight,
    });
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      value: clientHeight,
    });
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalRaf,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalCancelRaf,
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('schedules unlock with requestAnimationFrame when available', () => {
    let rafCallback: RafCallback | null = null;
    const requestAnimationFrameMock = vi.fn((cb: RafCallback) => {
      rafCallback = cb;
      return 101;
    });
    const cancelAnimationFrameMock = vi.fn();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: requestAnimationFrameMock,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: cancelAnimationFrameMock,
    });

    const editorContainer = document.createElement('div');
    const previewContainer = document.createElement('div');
    defineScrollableElement(editorContainer, 1000, 200);
    defineScrollableElement(previewContainer, 1200, 300);

    const editorContainerRef = { current: editorContainer } as RefObject<HTMLDivElement>;
    const previewContainerRef = { current: previewContainer } as RefObject<HTMLDivElement>;

    const { result } = renderHook(() =>
      useScrollSync({
        enabled: true,
        editorContainerRef,
        previewContainerRef,
      })
    );

    act(() => {
      result.current.handleEditorScroll(200, 1000, 200);
    });

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
    expect(previewContainer.dataset.targetScrollPercent).toBe('0.25');
    expect(previewContainer.scrollTop).toBeCloseTo(225, 5);

    act(() => {
      rafCallback?.(performance.now());
      result.current.handleEditorScroll(240, 1000, 200);
    });

    expect(cancelAnimationFrameMock).not.toHaveBeenCalled();
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);
    expect(previewContainer.dataset.targetScrollPercent).toBe('0.3');
  });

  it('falls back to timeout when requestAnimationFrame is unavailable', () => {
    vi.useFakeTimers();

    const setTimeoutMock = vi.spyOn(window, 'setTimeout');
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const editorContainer = document.createElement('div');
    const previewContainer = document.createElement('div');
    defineScrollableElement(editorContainer, 900, 300);
    defineScrollableElement(previewContainer, 1500, 500);

    const editorContainerRef = { current: editorContainer } as RefObject<HTMLDivElement>;
    const previewContainerRef = { current: previewContainer } as RefObject<HTMLDivElement>;

    const { result } = renderHook(() =>
      useScrollSync({
        enabled: true,
        editorContainerRef,
        previewContainerRef,
      })
    );

    act(() => {
      result.current.handlePreviewScroll(100, 600, 300);
    });

    expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), SCROLL_SYNC_DEBOUNCE);
    expect(editorContainer.dataset.targetScrollPercent).toBe('0.3333333333333333');

    act(() => {
      result.current.handlePreviewScroll(150, 600, 300);
    });
    expect(editorContainer.dataset.targetScrollPercent).toBe('0.3333333333333333');

    act(() => {
      vi.advanceTimersByTime(SCROLL_SYNC_DEBOUNCE);
      result.current.handlePreviewScroll(150, 600, 300);
    });

    expect(editorContainer.dataset.targetScrollPercent).toBe('0.5');
  });

  it('cleans up pending schedulers on unmount', () => {
    const requestAnimationFrameMock = vi.fn(() => 202);
    const cancelAnimationFrameMock = vi.fn();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: requestAnimationFrameMock,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: cancelAnimationFrameMock,
    });

    const editorContainer = document.createElement('div');
    const previewContainer = document.createElement('div');
    defineScrollableElement(editorContainer, 1000, 200);
    defineScrollableElement(previewContainer, 1200, 300);

    const editorContainerRef = { current: editorContainer } as RefObject<HTMLDivElement>;
    const previewContainerRef = { current: previewContainer } as RefObject<HTMLDivElement>;

    const { result, unmount } = renderHook(() =>
      useScrollSync({
        enabled: true,
        editorContainerRef,
        previewContainerRef,
      })
    );

    act(() => {
      result.current.handleEditorScroll(100, 1000, 200);
    });

    unmount();

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(202);
  });
});
