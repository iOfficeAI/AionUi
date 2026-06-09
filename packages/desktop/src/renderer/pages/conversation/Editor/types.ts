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
  | { type: 'close-buffer'; bufferKey: string; groupId?: string }
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
  /** Unique ID for transparent hot-exit backups (only set when `filePath` is null). */
  backupId: string | null;
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

/**
 * A single editor "group" (split pane). Groups reference buffers from the
 * shared `EditorState.buffers` pool by key — the same file may be open in
 * more than one group. `activeKey` is the group's focused tab.
 */
export type EditorGroup = {
  id: string;
  bufferKeys: string[];
  activeKey: string | null;
};

export type SplitDirection = 'right' | 'down';

export type EditorState = {
  isOpen: boolean;
  isCollapsed: boolean;
  /** Shared pool of open files. Groups reference these by key. */
  buffers: OpenBuffer[];
  /** Split panes. Always length >= 1; group 0 is the primary. */
  groups: EditorGroup[];
  /** Id of the focused group (drives the panel toolbar / status bar). */
  activeGroupId: string;
  /**
   * Active tab of the FOCUSED group. Kept in sync with
   * `groups[activeGroupId].activeKey` so existing single-group consumers
   * (save/close/content/disk-poll) keep working unchanged.
   */
  activeKey: string | null;
  pendingAction: EditorPendingAction | null;
  notice: EditorNotice | null;
};

export type EditorRevealRequest = {
  /** Absolute workspace root the active buffer belongs to. */
  workspace: string;
  /** Absolute path of the file to reveal in the workspace tree. */
  filePath: string;
  /** Optional pre-computed workspace-relative POSIX path. */
  relativePath?: string;
};

export type EditorSaveOptions = {
  /** Optional pre-save formatter (e.g. `monacoRef.formatDocument`). */
  format?: () => Promise<void> | void;
  /** True when triggered by auto-save (Local History source = 'autosave'). */
  isAutoSave?: boolean;
};

export type EditorContextValue = EditorState & {
  activeBuffer: OpenBuffer | null;
  isDirty: boolean;
  hasAnyDirty: boolean;
  openEditorFile: (request: EditorOpenRequest) => Promise<boolean>;
  openUntitledEditor: () => void;
  chooseAndOpenFile: () => Promise<boolean>;
  /**
   * Rehydrate a hot-exit untitled buffer from the main-process backup
   * store during tab restore. Creates a new `untitled:<n>` buffer with
   * `filePath === null`, the supplied `backupId`, and `content` set to
   * the persisted text (so the dirty flag is true vs. the empty
   * `originalContent`). The buffer is added to the currently-focused
   * group. Pairs with {@link writeEditorTabs} / `useEditorTabsHydration`.
   */
  restoreUntitledBuffer: (backupId: string, content: string, meta: { fileName: string; language: string }) => void;
  saveEditorFile: (options?: EditorSaveOptions) => Promise<boolean>;
  saveEditorFileAs: () => Promise<boolean>;
  /** Close a specific tab (prompts if dirty). Defaults to the active tab. */
  requestCloseBuffer: (key?: string) => void;
  /** Close the panel entirely (prompts if any tab is dirty). */
  requestCloseEditor: () => void;
  closeEditorWithoutPrompt: () => void;
  setActiveBuffer: (key: string) => void;
  /** Reorder tabs by moving `fromKey` to the index currently held by `toKey`. */
  reorderBuffers: (fromKey: string, toKey: string) => void;
  // ---- Split editor (Epic C) ----------------------------------------------
  /** Split the focused group into a new group seeded with its active file. */
  splitEditor: (direction?: SplitDirection) => void;
  /** Close a split group. Closing the last group closes the editor. */
  closeGroup: (groupId: string) => void;
  /** Focus a group (drives toolbar / status bar / reveal). */
  focusGroup: (groupId: string) => void;
  /** Activate a tab within a specific group. */
  setActiveBufferInGroup: (groupId: string, key: string) => void;
  /** Reorder tabs within a specific group. */
  reorderWithinGroup: (groupId: string, fromKey: string, toKey: string) => void;
  /** Move a tab from one group to another (Phase 2 drag-to-move). */
  moveBufferToGroup: (bufferKey: string, fromGroupId: string, toGroupId: string, index?: number) => void;
  /** Close a tab within a specific group (prompts if dirty and last reference). */
  requestCloseBufferInGroup: (groupId: string, key?: string) => void;
  /** Write content to a specific buffer (used by per-group editors). */
  setBufferContentByKey: (key: string, content: string) => void;
  /** Restore a split layout on hydration (keys pruned to the live pool). */
  setSplitLayout: (layout: Array<{ bufferKeys: string[]; activeKey: string | null }>) => void;
  collapseEditor: () => void;
  expandEditor: () => void;
  /** Hide the editor for chat mode while preserving open buffers. */
  hideEditor: () => void;
  toggleEditor: () => void;
  setEditorContent: (content: string) => void;
  setBufferViewState: (key: string, viewState: EditorBufferViewState | null) => void;
  /**
   * Reconcile a buffer's content with an external writer (e.g. the agent's
   * `fileStream.contentUpdate`). Updates both `content` and `originalContent`
   * so the dirty flag clears. The caller is expected to push the new text
   * into the Monaco model with `suppressChangeRef` set so the model state
   * stays in sync with this state update.
   */
  applyExternalContent: (key: string, content: string, source?: 'agent' | 'restore') => void;
  revertEditorFile: () => void;
  confirmPendingActionWithSave: () => Promise<void>;
  discardPendingAction: () => Promise<void>;
  cancelPendingAction: () => void;
  clearNotice: (id: number) => void;
  /** Most recent reveal request, or null. Consumed by the workspace tree. */
  revealRequest: EditorRevealRequest | null;
  /** Dispatch a reveal request for the current active buffer (or an explicit path). */
  requestRevealInTree: (filePath?: string, workspace?: string) => void;
  /** Reset the reveal request after the tree has handled it. */
  clearRevealRequest: () => void;
};
