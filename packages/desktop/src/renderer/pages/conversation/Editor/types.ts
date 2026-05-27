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
  | { type: 'close' }
  | { type: 'open-file'; request: EditorOpenRequest }
  | { type: 'new-file' };

export type EditorNoticeKind = 'success' | 'error' | 'warning';

export type EditorNotice = {
  id: number;
  kind: EditorNoticeKind;
  key: string;
  values?: Record<string, string | number>;
};

export type EditorState = {
  isOpen: boolean;
  isCollapsed: boolean;
  filePath: string | null;
  workspace?: string;
  fileName: string;
  content: string;
  originalContent: string;
  language: string;
  loading: boolean;
  saving: boolean;
  lastModified: number | null;
  diskChanged: boolean;
  pendingAction: EditorPendingAction | null;
  notice: EditorNotice | null;
};

export type EditorContextValue = EditorState & {
  isDirty: boolean;
  openEditorFile: (request: EditorOpenRequest) => Promise<boolean>;
  openUntitledEditor: () => void;
  chooseAndOpenFile: () => Promise<boolean>;
  saveEditorFile: () => Promise<boolean>;
  saveEditorFileAs: () => Promise<boolean>;
  requestCloseEditor: () => void;
  closeEditorWithoutPrompt: () => void;
  collapseEditor: () => void;
  expandEditor: () => void;
  toggleEditor: () => void;
  setEditorContent: (content: string) => void;
  revertEditorFile: () => void;
  confirmPendingActionWithSave: () => Promise<void>;
  discardPendingAction: () => Promise<void>;
  cancelPendingAction: () => void;
  clearNotice: (id: number) => void;
};
