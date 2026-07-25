/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Extension } from '@codemirror/state';
import { keymap, type KeyBinding } from '@codemirror/view';

/**
 * Key binding for Mod-s (Cmd/Ctrl+S). Exported so unit tests can invoke `run`
 * without spinning up a full CodeMirror EditorView.
 */
export const createSaveKeyBinding = (onSave: () => void): KeyBinding => ({
  key: 'Mod-s',
  run: () => {
    onSave();
    return true;
  },
  preventDefault: true,
});

/**
 * CodeMirror keymap so Mod-s (Cmd/Ctrl+S) reaches our save handler.
 * Without this, CodeMirror consumes the key before the window listener in
 * usePreviewKeyboardShortcuts can run.
 *
 * Always returns true when onSave is set so the browser "Save page" dialog
 * is suppressed even if the parent no-ops (e.g. content is not dirty).
 */
export const createSaveKeymap = (onSave?: () => void): Extension[] => {
  if (!onSave) return [];
  return [keymap.of([createSaveKeyBinding(onSave)])];
};
