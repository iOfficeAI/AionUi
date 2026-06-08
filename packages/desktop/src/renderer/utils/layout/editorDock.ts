/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command Center editor dock-side preference — which side of the chat the
 * editor pane sits on (`start` = left of chat, the default; `end` = right of
 * chat).
 *
 * Persisted to localStorage and broadcast via a window event so every consumer
 * — the Layout shell (chat content order), the editor host (its own order +
 * resize-handle edge + seam side + blade chevron), and the editor toolbar
 * toggle — stays in sync without prop-drilling or a dedicated provider. This
 * mirrors the existing `layoutModeStorage` / conversation-pane event patterns.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type EditorDock = 'start' | 'end';

export const DEFAULT_EDITOR_DOCK: EditorDock = 'start';

const STORAGE_KEY = 'aionui.commandCenter.editorDock';
const CHANGE_EVENT = 'aionui:editor-dock-change';

export const readEditorDock = (): EditorDock => {
  if (typeof window === 'undefined') return DEFAULT_EDITOR_DOCK;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'start' || raw === 'end' ? raw : DEFAULT_EDITOR_DOCK;
  } catch {
    return DEFAULT_EDITOR_DOCK;
  }
};

export const persistEditorDock = (dock: EditorDock): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, dock);
  } catch {
    /* localStorage unavailable */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: dock }));
};

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  // `storage` keeps multiple windows / the same preference key in sync.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

export type UseEditorDockResult = {
  dock: EditorDock;
  setDock: (dock: EditorDock) => void;
  toggleDock: () => void;
};

/**
 * Subscribe to the active editor dock side. Re-renders the caller whenever the
 * preference changes (from any consumer), so the shell order, the host chrome,
 * and the toolbar toggle all stay consistent.
 */
export const useEditorDock = (): UseEditorDockResult => {
  const dock = useSyncExternalStore(subscribe, readEditorDock, () => DEFAULT_EDITOR_DOCK);
  const setDock = useCallback((next: EditorDock) => persistEditorDock(next), []);
  const toggleDock = useCallback(() => {
    persistEditorDock(readEditorDock() === 'start' ? 'end' : 'start');
  }, []);
  return { dock, setDock, toggleDock };
};
