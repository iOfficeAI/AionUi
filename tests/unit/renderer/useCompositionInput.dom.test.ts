/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';

type KeyDownOptions = {
  isComposing?: boolean;
  key?: string;
  keyCode?: number;
  shiftKey?: boolean;
};

const createKeyDownEvent = ({
  isComposing = false,
  key = 'Enter',
  keyCode = key === 'Enter' ? 13 : 0,
  shiftKey = false,
}: KeyDownOptions = {}) => {
  const nativeEvent = new KeyboardEvent('keydown', { key, shiftKey });

  Object.defineProperty(nativeEvent, 'isComposing', { configurable: true, value: isComposing });
  Object.defineProperty(nativeEvent, 'keyCode', { configurable: true, value: keyCode });

  return {
    key,
    nativeEvent,
    preventDefault: vi.fn(),
    shiftKey,
  } as unknown as ReactKeyboardEvent;
};

describe('useCompositionInput Enter handling', () => {
  it('does not send when Enter is pressed during tracked composition', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const onKeyDown = result.current.createKeyDownHandler(onEnterPress);

    act(() => {
      result.current.compositionHandlers.onCompositionStartCapture();
      onKeyDown(createKeyDownEvent());
    });

    expect(onEnterPress).not.toHaveBeenCalled();
  });

  it('does not send when the native keyboard event reports composition', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const onKeyDown = result.current.createKeyDownHandler(onEnterPress);

    act(() => {
      onKeyDown(createKeyDownEvent({ isComposing: true }));
    });

    expect(onEnterPress).not.toHaveBeenCalled();
  });

  it('does not send when compositionend precedes the IME confirmation keydown', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const onKeyDown = result.current.createKeyDownHandler(onEnterPress);

    act(() => {
      result.current.compositionHandlers.onCompositionStartCapture();
      result.current.compositionHandlers.onCompositionEndCapture();
      onKeyDown(createKeyDownEvent({ isComposing: false, keyCode: 229 }));
    });

    expect(onEnterPress).not.toHaveBeenCalled();
  });

  it('sends once for Enter after composition has ended', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const onKeyDown = result.current.createKeyDownHandler(onEnterPress);

    act(() => {
      result.current.compositionHandlers.onCompositionStartCapture();
      result.current.compositionHandlers.onCompositionEndCapture();
      onKeyDown(createKeyDownEvent());
    });

    expect(onEnterPress).toHaveBeenCalledTimes(1);
  });

  it('sends for regular Enter', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const onKeyDown = result.current.createKeyDownHandler(onEnterPress);

    act(() => {
      onKeyDown(createKeyDownEvent());
    });

    expect(onEnterPress).toHaveBeenCalledTimes(1);
  });

  it('does not send for Shift+Enter', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const onKeyDown = result.current.createKeyDownHandler(onEnterPress);

    act(() => {
      onKeyDown(createKeyDownEvent({ shiftKey: true }));
    });

    expect(onEnterPress).not.toHaveBeenCalled();
  });

  it('preserves existing key interception before normal Enter sends', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const onKeyDownIntercept = vi.fn(() => true);
    const onKeyDown = result.current.createKeyDownHandler(onEnterPress, onKeyDownIntercept);

    act(() => {
      onKeyDown(createKeyDownEvent());
    });

    expect(onKeyDownIntercept).toHaveBeenCalledTimes(1);
    expect(onEnterPress).not.toHaveBeenCalled();
  });
});
