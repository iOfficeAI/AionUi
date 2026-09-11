/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';

const makeKeyEvent = (overrides: Partial<React.KeyboardEvent> = {}): React.KeyboardEvent =>
  ({
    key: 'Enter',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    preventDefault: vi.fn(),
    ...overrides,
  }) as unknown as React.KeyboardEvent;

describe('useCompositionInput - createKeyDownHandler', () => {
  describe('default mode (sendKeyModifier = false)', () => {
    it('sends on bare Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress);

      handler(makeKeyEvent());

      expect(onEnterPress).toHaveBeenCalledTimes(1);
    });

    it('does NOT send on Shift+Enter (newline)', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress);

      handler(makeKeyEvent({ shiftKey: true }));

      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('does NOT send on Cmd+Enter (newline)', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress);

      handler(makeKeyEvent({ metaKey: true }));

      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('does NOT send on Ctrl+Enter (newline)', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress);

      handler(makeKeyEvent({ ctrlKey: true }));

      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('does NOT send during IME composition', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();

      // Simulate composition start (wrap in act to suppress warning)
      act(() => {
        result.current.compositionHandlers.onCompositionStartCapture();
      });
      const handler = result.current.createKeyDownHandler(onEnterPress);

      handler(makeKeyEvent());

      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('calls preventDefault on bare Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress);
      const event = makeKeyEvent();

      handler(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('modifier mode (sendKeyModifier = true)', () => {
    it('sends on Cmd+Enter (Mac)', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);

      handler(makeKeyEvent({ metaKey: true }));

      expect(onEnterPress).toHaveBeenCalledTimes(1);
    });

    it('sends on Ctrl+Enter (Windows/Linux)', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);

      handler(makeKeyEvent({ ctrlKey: true }));

      expect(onEnterPress).toHaveBeenCalledTimes(1);
    });

    it('does NOT send on bare Enter (newline)', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);

      handler(makeKeyEvent());

      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('does NOT send on Shift+Enter (newline)', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);

      handler(makeKeyEvent({ shiftKey: true }));

      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('does NOT send on Shift+Cmd+Enter (newline)', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);

      handler(makeKeyEvent({ shiftKey: true, metaKey: true }));

      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('does NOT send during IME composition', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();

      act(() => {
        result.current.compositionHandlers.onCompositionStartCapture();
      });
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);

      handler(makeKeyEvent({ metaKey: true }));

      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('calls preventDefault on Cmd+Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);
      const event = makeKeyEvent({ metaKey: true });

      handler(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('interceptor behavior', () => {
    it('interceptor is not called in default mode when modifier present', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const onKeyDownIntercept = vi.fn().mockReturnValue(true);
      const handler = result.current.createKeyDownHandler(onEnterPress, onKeyDownIntercept);

      handler(makeKeyEvent({ metaKey: true }));

      // In default mode, modifier check runs before interceptor, so interceptor is not called
      expect(onKeyDownIntercept).not.toHaveBeenCalled();
    });

    it('interceptor can intercept in modifier mode', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const onKeyDownIntercept = vi.fn().mockReturnValue(true);
      const handler = result.current.createKeyDownHandler(onEnterPress, onKeyDownIntercept, true);

      handler(makeKeyEvent({ metaKey: true }));

      expect(onKeyDownIntercept).toHaveBeenCalledTimes(1);
      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('interceptor passes through to send in modifier mode', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const onKeyDownIntercept = vi.fn().mockReturnValue(false);
      const handler = result.current.createKeyDownHandler(onEnterPress, onKeyDownIntercept, true);

      handler(makeKeyEvent({ metaKey: true }));

      expect(onKeyDownIntercept).toHaveBeenCalledTimes(1);
      expect(onEnterPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-Enter keys are ignored', () => {
    it('does not intercept Tab in default mode', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress);

      handler(makeKeyEvent({ key: 'Tab' }));

      expect(onEnterPress).not.toHaveBeenCalled();
    });

    it('does not intercept Escape in modifier mode', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);

      handler(makeKeyEvent({ key: 'Escape' }));

      expect(onEnterPress).not.toHaveBeenCalled();
    });
  });
});
