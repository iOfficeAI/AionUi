import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createKeyboardEvent = (
  target: HTMLTextAreaElement,
  options: Partial<Pick<KeyboardEvent<HTMLTextAreaElement>, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>>
): KeyboardEvent<HTMLTextAreaElement> => {
  return {
    altKey: options.altKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    currentTarget: target,
    key: options.key ?? '',
    metaKey: options.metaKey ?? false,
    preventDefault: vi.fn(),
    shiftKey: options.shiftKey ?? false,
  } as unknown as KeyboardEvent<HTMLTextAreaElement>;
};

describe('useCompositionInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('submits on Enter when not composing', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const textarea = document.createElement('textarea');
    const event = createKeyboardEvent(textarea, { key: 'Enter' });

    act(() => {
      result.current.createKeyDownHandler(onEnterPress)(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onEnterPress).toHaveBeenCalledTimes(1);
  });

  it('ignores Enter while IME composition is active', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const textarea = document.createElement('textarea');
    const event = createKeyboardEvent(textarea, { key: 'Enter' });

    act(() => {
      result.current.compositionHandlers.onCompositionStartCapture();
      result.current.createKeyDownHandler(onEnterPress)(event);
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onEnterPress).not.toHaveBeenCalled();
  });

  it('syncs controlled value after Ctrl+Z undo', () => {
    const textarea = document.createElement('textarea');
    const execCommand = vi.fn((action: string) => {
      textarea.value = action === 'undo' ? 'before undo' : textarea.value;
      return true;
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    const { result } = renderHook(() => useCompositionInput());
    const onValueChange = vi.fn();
    textarea.value = 'after typing';
    document.body.appendChild(textarea);
    textarea.focus();
    const event = createKeyboardEvent(textarea, { key: 'z', ctrlKey: true });

    act(() => {
      result.current.handleUndoRedoKeyDown(event, onValueChange);
      vi.runAllTimers();
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith('undo');
    expect(onValueChange).toHaveBeenCalledWith('before undo');
  });

  it('syncs controlled value after Ctrl+Y redo', () => {
    const textarea = document.createElement('textarea');
    const execCommand = vi.fn((action: string) => {
      textarea.value = action === 'redo' ? 'after redo' : textarea.value;
      return true;
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const onValueChange = vi.fn();
    textarea.value = 'current value';
    document.body.appendChild(textarea);
    textarea.focus();
    const event = createKeyboardEvent(textarea, { key: 'y', ctrlKey: true });

    act(() => {
      result.current.createKeyDownHandler(onEnterPress, undefined, onValueChange)(event);
      vi.runAllTimers();
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith('redo');
    expect(onValueChange).toHaveBeenCalledWith('after redo');
    expect(onEnterPress).not.toHaveBeenCalled();
  });
});
