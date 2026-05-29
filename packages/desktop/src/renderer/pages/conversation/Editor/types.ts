/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type EditorOpenRequest = {
  path: string;
  workspace?: string;
};

export type EditorPendingAction =
  | { type: 'close-buffer'; bufferKey: string }
  | { type: 'close-all' }
  | { type: 'open-file'; request: EditorOpenRequest }
  | { type: 'new-file' };

export type EditorNoticeKind = 'success' | 'error' | 'warning';

export type EditorNotice = {
  id: number;
  kind: EditorNoticeKind;
  key: string;
  values?: Record<string, string | number>;
};

/**
 * Persistent per-tab view state captured from the editor widget. Lives on the
 * buffer (not the active editor) so switching tabs restores cursor/scroll/fold.
 * Concrete type is editor-implementation specific (Monaco `ICodeEditorViewState`),
 * which is why this is `unknown` here — the editor wrapper does its own casting.
 */
export type EditorBufferViewState = unknown;

/**
 * A single open file in the editor. Keyed by `key` in the buffer map; the
 * key is the full file path for on-disk files, or `untitled:<n>` for new
 * unsaved buffers (which have `filePath === null`).
 */
export type OpenBuffer = {
  key: string;
  filePath: string | null;
  workspace?: string;
  fileName: string;
  content: string;
  originalContent: string;
  language: string;
  lastModified: number | null;
  diskChanged: boolean;
  loading: boolean;
  saving: boolean;
  viewState: EditorBufferViewState | null;
};

export type EditorState = {
  isOpen: boolean;
  isCollapsed: boolean;
  buffers: OpenBuffer[];
  activeKey: string | null;
  pendingAction: EditorPendingAction | null;
  notice: EditorNotice | null;
};

export type EditorContextValue = EditorState & {
  activeBuffer: OpenBuffer | null;
  isDirty: boolean;
  hasAnyDirty: boolean;
  openEditorFile: (request: EditorOpenRequest) => Promise<boolean>;
  openUntitledEditor: () => void;
  chooseAndOpenFile: () => Promise<boolean>;
  saveEditorFile: () => Promise<boolean>;
  saveEditorFileAs: () => Promise<boolean>;
  /** Close a specific tab (prompts if dirty). Defaults to the active tab. */
  requestCloseBuffer: (key?: string) => void;
  /** Close the panel entirely (prompts if any tab is dirty). */
  requestCloseEditor: () => void;
  closeEditorWithoutPrompt: () => void;
  setActiveBuffer: (key: string) => void;
  /** Reorder tabs by moving `fromKey` to the index currently held by `toKey`. */
  reorderBuffers: (fromKey: string, toKey: string) => void;
  collapseEditor: () => void;
  expandEditor: () => void;
  toggleEditor: () => void;
  setEditorContent: (content: string) => void;
  setBufferViewState: (key: string, viewState: EditorBufferViewState | null) => void;
  revertEditorFile: () => void;
  confirmPendingActionWithSave: () => Promise<void>;
  discardPendingAction: () => Promise<void>;
  cancelPendingAction: () => void;
  clearNotice: (id: number) => void;
};
