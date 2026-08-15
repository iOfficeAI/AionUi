/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTextUndoRedo } from '@/renderer/hooks/chat/useTextUndoRedo';
import { act, render, screen } from '@testing-library/react';
import React, { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Test harness that mirrors how SendBox/GuidInputCard wire the hook: a fully
 * controlled textarea whose React state is driven by `applyValue`.
 */
const TestHarness = () => {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const { handleUndoRedoKeyDown } = useTextUndoRedo({
    getTextarea: () => ref.current,
    applyValue: (nextValue, start, end) => {
      const element = ref.current;
      if (element) {
        element.value = nextValue;
        element.setSelectionRange(start, end);
      }
      setValue(nextValue);
    },
    isComposing: () => false,
  });

  return (
    <textarea
      ref={ref}
      value={value}
      data-testid='ta'
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        handleUndoRedoKeyDown(event);
      }}
    />
  );
};

const getTextarea = (): HTMLTextAreaElement => screen.getByTestId('ta') as HTMLTextAreaElement;

/** Simulate one user edit: beforeinput -> value mutation -> input. */
const simulateEdit = (inputType: string, applyEdit: (element: HTMLTextAreaElement) => void): void => {
  const element = getTextarea();
  const beforeInput = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
  act(() => {
    element.dispatchEvent(beforeInput);
    if (!beforeInput.defaultPrevented) {
      applyEdit(element);
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  });
};

const simulateTyping = (text: string): void => {
  for (const char of text) {
    simulateEdit('insertText', (element) => {
      const position = element.selectionStart ?? element.value.length;
      element.value = element.value.slice(0, position) + char + element.value.slice(element.selectionEnd ?? position);
      element.setSelectionRange(position + 1, position + 1);
    });
  }
};

const triggerHistory = (action: 'undo' | 'redo'): void => {
  simulateEdit(action === 'undo' ? 'historyUndo' : 'historyRedo', () => {
    throw new Error('native edit should never run when history is handled');
  });
};

describe('useTextUndoRedo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('batches contiguous typing into a single undo entry', () => {
    render(<TestHarness />);
    simulateTyping('hello');

    triggerHistory('undo');
    expect(getTextarea().value).toBe('');

    triggerHistory('redo');
    expect(getTextarea().value).toBe('hello');
  });

  it('starts a new undo entry when typing pauses beyond the batch window', () => {
    render(<TestHarness />);
    simulateTyping('ab');
    vi.advanceTimersByTime(1000);
    simulateTyping('c');

    triggerHistory('undo');
    expect(getTextarea().value).toBe('ab');

    triggerHistory('undo');
    expect(getTextarea().value).toBe('');
  });

  it('records paste as a fresh undo entry that breaks the typing batch', () => {
    render(<TestHarness />);
    simulateTyping('a');
    simulateEdit('insertFromPaste', (element) => {
      element.value = 'axyz';
      element.setSelectionRange(4, 4);
    });

    triggerHistory('undo');
    expect(getTextarea().value).toBe('a');

    triggerHistory('undo');
    expect(getTextarea().value).toBe('');
  });

  it('clears the redo stack when a new edit is made after undo', () => {
    render(<TestHarness />);
    simulateTyping('ab');

    triggerHistory('undo');
    expect(getTextarea().value).toBe('');

    triggerHistory('redo');
    expect(getTextarea().value).toBe('ab');

    triggerHistory('undo');
    expect(getTextarea().value).toBe('');

    simulateTyping('c');
    expect(getTextarea().value).toBe('c');

    // A new edit cleared the redo stack, so historyRedo is a no-op.
    const element = getTextarea();
    const redoEvent = new InputEvent('beforeinput', { inputType: 'historyRedo', bubbles: true, cancelable: true });
    act(() => {
      element.dispatchEvent(redoEvent);
    });
    expect(redoEvent.defaultPrevented).toBe(false);
    expect(element.value).toBe('c');
  });

  it('clears history after a programmatic value replacement (e.g. send)', () => {
    render(<TestHarness />);
    simulateTyping('hello');

    // Programmatic replacement, e.g. SendBox setInput('') after send. No input
    // event fires, so the hook only learns about it at the next user edit.
    const element = getTextarea();
    act(() => {
      element.value = '';
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    simulateTyping('x');

    triggerHistory('undo');
    // The edit after the programmatic clear is the first (and only) entry.
    expect(getTextarea().value).toBe('');
  });

  it('undoes the whole IME composition as one entry', () => {
    render(<TestHarness />);
    simulateTyping('abc');

    const element = getTextarea();
    act(() => {
      element.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    });
    simulateEdit('insertCompositionText', (target) => {
      target.value = 'abc世界';
      target.setSelectionRange(5, 5);
    });
    act(() => {
      element.dispatchEvent(new Event('compositionend', { bubbles: true }));
    });

    triggerHistory('undo');
    expect(getTextarea().value).toBe('abc');
  });

  it('handles Cmd+Z undo via keydown and prevents default', () => {
    render(<TestHarness />);
    simulateTyping('hi');

    const element = getTextarea();
    const keyEvent = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true });
    act(() => {
      element.dispatchEvent(keyEvent);
    });
    expect(keyEvent.defaultPrevented).toBe(true);
    expect(element.value).toBe('');
  });

  it('handles Cmd+Shift+Z and Ctrl+Y redo via keydown', () => {
    render(<TestHarness />);
    simulateTyping('hi');
    triggerHistory('undo');
    expect(getTextarea().value).toBe('');

    let element = getTextarea();
    act(() => {
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })
      );
    });
    expect(element.value).toBe('hi');

    triggerHistory('undo');
    expect(element.value).toBe('');

    act(() => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(element.value).toBe('hi');
  });

  it('ignores plain typing keys in the keydown handler', () => {
    render(<TestHarness />);
    const element = getTextarea();
    const keyEvent = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    act(() => {
      element.dispatchEvent(keyEvent);
    });
    expect(keyEvent.defaultPrevented).toBe(false);
  });
});
