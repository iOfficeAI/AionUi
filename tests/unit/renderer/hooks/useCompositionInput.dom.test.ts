/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';

function createKeyEvent(overrides: Partial<React.KeyboardEvent> = {}): React.KeyboardEvent {
  return {
    key: 'Enter',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as React.KeyboardEvent;
}

describe('createKeyDownHandler', () => {
  describe('default mode (Enter to send, sendKeyModifier=false)', () => {
    it('sends on bare Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, false);
      const event = createKeyEvent({ key: 'Enter', shiftKey: false, metaKey: false, ctrlKey: false });

      act(() => {
        handler(event);
      });

      expect(onEnterPress).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('inserts newline on Shift+Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, false);
      const event = createKeyEvent({ key: 'Enter', shiftKey: true });

      act(() => {
        handler(event);
      });

      expect(onEnterPress).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('inserts newline on Cmd+Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const insertNewline = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, false, insertNewline);
      const event = createKeyEvent({ key: 'Enter', metaKey: true });

      act(() => {
        handler(event);
      });

      expect(onEnterPress).not.toHaveBeenCalled();
      expect(insertNewline).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('inserts newline on Ctrl+Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const insertNewline = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, false, insertNewline);
      const event = createKeyEvent({ key: 'Enter', ctrlKey: true });

      act(() => {
        handler(event);
      });

      expect(onEnterPress).not.toHaveBeenCalled();
      expect(insertNewline).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('modifier mode (Cmd/Ctrl+Enter to send, sendKeyModifier=true)', () => {
    it('does not send on bare Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);
      const event = createKeyEvent({ key: 'Enter', shiftKey: false, metaKey: false, ctrlKey: false });

      act(() => {
        handler(event);
      });

      expect(onEnterPress).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('does not send on Shift+Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);
      const event = createKeyEvent({ key: 'Enter', shiftKey: true });

      act(() => {
        handler(event);
      });

      expect(onEnterPress).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('sends on Cmd+Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);
      const event = createKeyEvent({ key: 'Enter', metaKey: true });

      act(() => {
        handler(event);
      });

      expect(onEnterPress).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('sends on Ctrl+Enter', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, true);
      const event = createKeyEvent({ key: 'Enter', ctrlKey: true });

      act(() => {
        handler(event);
      });

      expect(onEnterPress).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('IME composition', () => {
    it('does not send when composing', () => {
      const { result } = renderHook(() => useCompositionInput());
      const onEnterPress = vi.fn();
      const handler = result.current.createKeyDownHandler(onEnterPress, undefined, false);

      // Simulate composition start
      act(() => {
        result.current.compositionHandlers.onCompositionStartCapture();
      });

      const event = createKeyEvent({ key: 'Enter', shiftKey: false });
      act(() => {
        handler(event);
      });

      expect(onEnterPress).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});
