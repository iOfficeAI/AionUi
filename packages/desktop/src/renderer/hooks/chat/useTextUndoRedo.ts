/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

type TextHistoryAction = 'undo' | 'redo';

type TextSnapshot = {
  value: string;
  start: number;
  end: number;
};

/**
 * Maps a keydown event to a text-history action, or null when the event is not
 * one of the standard history shortcuts.
 *
 * - Cmd/Ctrl+Z           -> undo
 * - Cmd/Ctrl+Shift+Z     -> redo
 * - Ctrl+Y               -> redo (Windows/Linux convention; Cmd+Y is excluded
 *                          on macOS because it is not a standard accelerator)
 */
const getTextHistoryAction = (event: KeyboardEvent): TextHistoryAction | null => {
  const key = event.key.toLowerCase();
  const hasCommandModifier = event.metaKey || event.ctrlKey;
  if (!hasCommandModifier || event.altKey) {
    return null;
  }

  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }

  if (key === 'y' && !event.shiftKey && !event.metaKey) {
    return 'redo';
  }

  return null;
};

// Contiguous typing within this window is merged into a single undo entry,
// mirroring how a native (uncontrolled) textarea coalesces fast typing.
const TYPING_BATCH_WINDOW_MS = 800;

const MAX_HISTORY_LENGTH = 100;

/** Edits treated as contiguous typing and batched into one undo entry. */
const TYPING_INPUT_TYPES = new Set<string>([
  'insertText',
  'insertLineBreak',
  'insertParagraph',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteHardLineBackward',
  'deleteHardLineForward',
]);

/** Edits that always start a fresh undo entry and break any active typing batch. */
const STRUCTURAL_INPUT_TYPES = new Set<string>([
  'insertFromPaste',
  'insertFromDrop',
  'insertReplacementText',
  'insertTranspose',
  'deleteByCut',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
]);

type UseTextUndoRedoOptions = {
  /** Returns the native textarea element that owns the undo history. */
  getTextarea: () => HTMLTextAreaElement | null;
  /** Restores a snapshot: set the controlled value and caret, then update React state. */
  applyValue: (value: string, start: number, end: number) => void;
  /** Returns true while an IME composition is active. */
  isComposing: () => boolean;
};

/**
 * Custom undo/redo history for a controlled React textarea.
 *
 * A controlled component re-writes `element.value` on every render, which
 * fragments Chromium's native undo stack into one entry per keystroke. This
 * hook replaces the native stack with an application-level history that batches
 * contiguous typing into a single undo entry and keeps React state in sync.
 *
 * Recording happens on the native `beforeinput` event, which fires for every
 * user edit (typing, paste, delete, IME commit) but never for programmatic
 * value writes. A `lastKnownValue` gap check detects programmatic replacements
 * (send, slash-command fill, @mention insert, history navigation) and clears
 * the stacks the same way a native textarea would.
 */
export const useTextUndoRedo = ({ getTextarea, applyValue, isComposing }: UseTextUndoRedoOptions) => {
  const undoStackRef = useRef<TextSnapshot[]>([]);
  const redoStackRef = useRef<TextSnapshot[]>([]);
  const lastKnownValueRef = useRef('');
  const lastTypingAtRef = useRef(0);
  const batchStartRef = useRef<TextSnapshot | null>(null);
  const compositionStartValueRef = useRef<string | null>(null);

  const pushUndoEntry = useCallback((snapshot: TextSnapshot) => {
    const stack = undoStackRef.current;
    const top = stack[stack.length - 1];
    if (top && top.value === snapshot.value) {
      return;
    }
    stack.push(snapshot);
    if (stack.length > MAX_HISTORY_LENGTH) {
      stack.shift();
    }
    redoStackRef.current = [];
  }, []);

  const resetBatch = useCallback(() => {
    batchStartRef.current = null;
    lastTypingAtRef.current = 0;
  }, []);

  const recordTypingEdit = useCallback(
    (element: HTMLTextAreaElement) => {
      const now = Date.now();
      const snapshot: TextSnapshot = {
        value: element.value,
        start: element.selectionStart ?? element.value.length,
        end: element.selectionEnd ?? element.value.length,
      };

      const batch = batchStartRef.current;
      const top = undoStackRef.current[undoStackRef.current.length - 1];
      const continuesBatch =
        batch !== null && now - lastTypingAtRef.current <= TYPING_BATCH_WINDOW_MS && top?.value === batch.value;

      if (!continuesBatch) {
        pushUndoEntry(snapshot);
        batchStartRef.current = snapshot;
      }
      lastTypingAtRef.current = now;
    },
    [pushUndoEntry]
  );

  const recordStructuralEdit = useCallback(
    (element: HTMLTextAreaElement) => {
      pushUndoEntry({
        value: element.value,
        start: element.selectionStart ?? element.value.length,
        end: element.selectionEnd ?? element.value.length,
      });
      resetBatch();
    },
    [pushUndoEntry, resetBatch]
  );

  const restoreSnapshot = useCallback(
    (snapshot: TextSnapshot) => {
      lastKnownValueRef.current = snapshot.value;
      applyValue(snapshot.value, snapshot.start, snapshot.end);
      resetBatch();
    },
    [applyValue, resetBatch]
  );

  const performUndo = useCallback((): boolean => {
    const element = getTextarea();
    const target = undoStackRef.current.pop();
    if (!element || !target) {
      return false;
    }
    redoStackRef.current.push({
      value: element.value,
      start: element.selectionStart ?? element.value.length,
      end: element.selectionEnd ?? element.value.length,
    });
    restoreSnapshot(target);
    return true;
  }, [getTextarea, restoreSnapshot]);

  const performRedo = useCallback((): boolean => {
    const element = getTextarea();
    const target = redoStackRef.current.pop();
    if (!element || !target) {
      return false;
    }
    undoStackRef.current.push({
      value: element.value,
      start: element.selectionStart ?? element.value.length,
      end: element.selectionEnd ?? element.value.length,
    });
    restoreSnapshot(target);
    return true;
  }, [getTextarea, restoreSnapshot]);

  /** Handles Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y at the keydown layer. */
  const handleUndoRedoKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (isComposing()) {
        return false;
      }
      const action = getTextHistoryAction(event);
      if (!action) {
        return false;
      }
      const handled = action === 'undo' ? performUndo() : performRedo();
      if (handled) {
        event.preventDefault();
      }
      return handled;
    },
    [isComposing, performRedo, performUndo]
  );

  useEffect(() => {
    const element = getTextarea();
    if (!element) {
      return;
    }
    lastKnownValueRef.current = element.value;

    const handleInput = () => {
      lastKnownValueRef.current = element.value;
    };

    const handleBeforeInput = (event: InputEvent) => {
      const { inputType } = event;

      if (inputType === 'historyUndo') {
        if (performUndo()) {
          event.preventDefault();
        }
        return;
      }
      if (inputType === 'historyRedo') {
        if (performRedo()) {
          event.preventDefault();
        }
        return;
      }

      if (isComposing() || inputType === 'insertCompositionText' || inputType === 'insertFromComposition') {
        return;
      }

      // A programmatic value replacement (send, slash fill, history navigation)
      // never fires an `input` event, so the element value has diverged from
      // what we last saw. Clear the history like a native textarea would.
      if (element.value !== lastKnownValueRef.current) {
        undoStackRef.current = [];
        redoStackRef.current = [];
        resetBatch();
      }
      lastKnownValueRef.current = element.value;

      if (TYPING_INPUT_TYPES.has(inputType)) {
        recordTypingEdit(element);
      } else if (STRUCTURAL_INPUT_TYPES.has(inputType)) {
        recordStructuralEdit(element);
      }
    };

    const handleCompositionStart = () => {
      compositionStartValueRef.current = element.value;
    };

    const handleCompositionEnd = () => {
      const startValue = compositionStartValueRef.current;
      compositionStartValueRef.current = null;
      if (startValue === null || element.value === startValue) {
        return;
      }
      pushUndoEntry({ value: startValue, start: startValue.length, end: startValue.length });
      resetBatch();
    };

    element.addEventListener('input', handleInput);
    element.addEventListener('beforeinput', handleBeforeInput);
    element.addEventListener('compositionstart', handleCompositionStart);
    element.addEventListener('compositionend', handleCompositionEnd);
    return () => {
      element.removeEventListener('input', handleInput);
      element.removeEventListener('beforeinput', handleBeforeInput);
      element.removeEventListener('compositionstart', handleCompositionStart);
      element.removeEventListener('compositionend', handleCompositionEnd);
    };
  }, [
    getTextarea,
    isComposing,
    performRedo,
    performUndo,
    pushUndoEntry,
    recordStructuralEdit,
    recordTypingEdit,
    resetBatch,
  ]);

  return { handleUndoRedoKeyDown, performUndo, performRedo };
};
