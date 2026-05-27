/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EDITOR_MAX_EDITABLE_BYTES, getEditorFileName, inferEditorLanguage } from './editorLanguage';
import type { EditorContextValue, EditorNotice, EditorOpenRequest, EditorPendingAction, EditorState } from './types';

const UNTITLED_FILE_NAME = 'Untitled.txt';
const FILE_CHANGE_POLL_MS = 2500;

const EditorContext = createContext<EditorContextValue | null>(null);

const initialState: EditorState = {
  isOpen: false,
  isCollapsed: false,
  filePath: null,
  workspace: undefined,
  fileName: UNTITLED_FILE_NAME,
  content: '',
  originalContent: '',
  language: 'plaintext',
  loading: false,
  saving: false,
  lastModified: null,
  diskChanged: false,
  pendingAction: null,
  notice: null,
};

let noticeId = 0;

const createNotice = (kind: EditorNotice['kind'], key: string, values?: EditorNotice['values']): EditorNotice => ({
  id: (noticeId += 1),
  kind,
  key,
  values,
});

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<EditorState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const isDirty = state.content !== state.originalContent;

  const executeOpenFile = useCallback(async (request: EditorOpenRequest): Promise<boolean> => {
    setState((prev) => ({ ...prev, isOpen: true, isCollapsed: false, loading: true, pendingAction: null }));

    try {
      const metadata = await ipcBridge.fs.getFileMetadata.invoke({ path: request.path, workspace: request.workspace });
      if (metadata?.isDirectory) {
        setState((prev) => ({
          ...prev,
          loading: false,
          notice: createNotice('error', 'conversation.editor.openFailed'),
        }));
        return false;
      }

      if (metadata?.size && metadata.size > EDITOR_MAX_EDITABLE_BYTES) {
        setState((prev) => ({
          ...prev,
          loading: false,
          notice: createNotice('warning', 'conversation.editor.largeFileBlocked'),
        }));
        return false;
      }

      const content = await ipcBridge.fs.readFile.invoke({ path: request.path, workspace: request.workspace });
      if (content == null) {
        throw new Error('read failed');
      }

      setState((prev) => ({
        ...prev,
        isOpen: true,
        isCollapsed: false,
        filePath: request.path,
        workspace: request.workspace,
        fileName: getEditorFileName(request.path),
        content,
        originalContent: content,
        language: inferEditorLanguage(request.path),
        loading: false,
        saving: false,
        lastModified: metadata?.lastModified ?? null,
        diskChanged: false,
        pendingAction: null,
      }));
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        notice: createNotice('error', 'conversation.editor.openFailed'),
      }));
      return false;
    }
  }, []);

  const openEditorFile = useCallback(
    async (request: EditorOpenRequest): Promise<boolean> => {
      if (stateRef.current.content !== stateRef.current.originalContent) {
        setState((prev) => ({
          ...prev,
          isOpen: true,
          isCollapsed: false,
          pendingAction: { type: 'open-file', request },
        }));
        return false;
      }
      return executeOpenFile(request);
    },
    [executeOpenFile]
  );

  const executeNewFile = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: true,
      isCollapsed: false,
      filePath: null,
      workspace: undefined,
      fileName: UNTITLED_FILE_NAME,
      content: '',
      originalContent: '',
      language: 'plaintext',
      loading: false,
      saving: false,
      lastModified: null,
      diskChanged: false,
      pendingAction: null,
    }));
  }, []);

  const openUntitledEditor = useCallback(() => {
    if (stateRef.current.content !== stateRef.current.originalContent) {
      setState((prev) => ({ ...prev, pendingAction: { type: 'new-file' }, isOpen: true, isCollapsed: false }));
      return;
    }
    executeNewFile();
  }, [executeNewFile]);

  const chooseAndOpenFile = useCallback(async (): Promise<boolean> => {
    const files = await ipcBridge.dialog.showOpen.invoke({ properties: ['openFile'] });
    const filePath = files?.[0];
    if (!filePath) return false;
    return openEditorFile({ path: filePath });
  }, [openEditorFile]);

  const saveEditorFileAs = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    const filePath = await ipcBridge.dialog.showSave.invoke({ defaultPath: current.filePath ?? current.fileName });
    if (!filePath) return false;

    setState((prev) => ({ ...prev, saving: true }));
    try {
      const success = await ipcBridge.fs.writeFile.invoke({ path: filePath, data: stateRef.current.content });
      if (!success) throw new Error('write failed');
      const metadata = await ipcBridge.fs.getFileMetadata.invoke({ path: filePath });
      setState((prev) => ({
        ...prev,
        filePath,
        workspace: undefined,
        fileName: getEditorFileName(filePath),
        originalContent: prev.content,
        language: inferEditorLanguage(filePath),
        saving: false,
        lastModified: metadata?.lastModified ?? null,
        diskChanged: false,
        notice: createNotice('success', 'common.saveSuccess'),
      }));
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        saving: false,
        notice: createNotice('error', 'common.saveFailed'),
      }));
      return false;
    }
  }, []);

  const saveEditorFile = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    if (!current.filePath) {
      return saveEditorFileAs();
    }

    setState((prev) => ({ ...prev, saving: true }));
    try {
      const success = await ipcBridge.fs.writeFile.invoke({ path: current.filePath, data: current.content });
      if (!success) throw new Error('write failed');
      const metadata = await ipcBridge.fs.getFileMetadata.invoke({
        path: current.filePath,
        workspace: current.workspace,
      });
      setState((prev) => ({
        ...prev,
        originalContent: prev.content,
        saving: false,
        lastModified: metadata?.lastModified ?? prev.lastModified,
        diskChanged: false,
        notice: createNotice('success', 'common.saveSuccess'),
      }));
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        saving: false,
        notice: createNotice('error', 'common.saveFailed'),
      }));
      return false;
    }
  }, [saveEditorFileAs]);

  const closeEditorWithoutPrompt = useCallback(() => {
    setState(initialState);
  }, []);

  const requestCloseEditor = useCallback(() => {
    if (stateRef.current.content !== stateRef.current.originalContent) {
      setState((prev) => ({ ...prev, pendingAction: { type: 'close' } }));
      return;
    }
    closeEditorWithoutPrompt();
  }, [closeEditorWithoutPrompt]);

  const collapseEditor = useCallback(() => {
    setState((prev) => ({ ...prev, isCollapsed: true }));
  }, []);

  const expandEditor = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: true, isCollapsed: false }));
  }, []);

  const setEditorContent = useCallback((content: string) => {
    setState((prev) => ({ ...prev, content }));
  }, []);

  const revertEditorFile = useCallback(() => {
    setState((prev) => ({ ...prev, content: prev.originalContent, diskChanged: false }));
  }, []);

  const executePendingAction = useCallback(
    async (pendingAction: EditorPendingAction | null): Promise<void> => {
      if (!pendingAction) return;
      if (pendingAction.type === 'close') {
        closeEditorWithoutPrompt();
        return;
      }
      if (pendingAction.type === 'new-file') {
        executeNewFile();
        return;
      }
      await executeOpenFile(pendingAction.request);
    },
    [closeEditorWithoutPrompt, executeNewFile, executeOpenFile]
  );

  const confirmPendingActionWithSave = useCallback(async () => {
    const pendingAction = stateRef.current.pendingAction;
    const saved = await saveEditorFile();
    if (saved) {
      await executePendingAction(pendingAction);
    }
  }, [executePendingAction, saveEditorFile]);

  const discardPendingAction = useCallback(async () => {
    const pendingAction = stateRef.current.pendingAction;
    await executePendingAction(pendingAction);
  }, [executePendingAction]);

  const cancelPendingAction = useCallback(() => {
    setState((prev) => ({ ...prev, pendingAction: null }));
  }, []);

  const clearNotice = useCallback((id: number) => {
    setState((prev) => (prev.notice?.id === id ? { ...prev, notice: null } : prev));
  }, []);

  // Top-bar toggle. Mirrors the terminal/workspace toggle pattern: one
  // user action either shows or hides the pane regardless of buffer state.
  const toggleEditor = useCallback(() => {
    const current = stateRef.current;
    if (!current.isOpen) {
      executeNewFile();
      return;
    }
    setState((prev) => ({ ...prev, isCollapsed: !prev.isCollapsed }));
  }, [executeNewFile]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = stateRef.current;
      if (!current.isOpen || current.isCollapsed || !current.filePath || current.loading || current.saving) return;
      const filePath = current.filePath;

      void ipcBridge.fs.getFileMetadata
        .invoke({ path: filePath, workspace: current.workspace })
        .then((metadata) => {
          if (!metadata || metadata.lastModified === stateRef.current.lastModified) return;
          if (stateRef.current.content !== stateRef.current.originalContent) {
            setState((prev) => ({
              ...prev,
              lastModified: metadata.lastModified,
              diskChanged: true,
              notice: createNotice('warning', 'conversation.editor.fileChangedOnDisk'),
            }));
            return;
          }

          void ipcBridge.fs.readFile.invoke({ path: filePath, workspace: current.workspace }).then((content) => {
            if (content == null) return;
            setState((prev) => ({
              ...prev,
              content,
              originalContent: content,
              lastModified: metadata.lastModified,
              diskChanged: false,
            }));
          });
        })
        .catch((): void => undefined);
    }, FILE_CHANGE_POLL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const value = useMemo<EditorContextValue>(
    () => ({
      ...state,
      isDirty,
      openEditorFile,
      openUntitledEditor,
      chooseAndOpenFile,
      saveEditorFile,
      saveEditorFileAs,
      requestCloseEditor,
      closeEditorWithoutPrompt,
      collapseEditor,
      expandEditor,
      toggleEditor,
      setEditorContent,
      revertEditorFile,
      confirmPendingActionWithSave,
      discardPendingAction,
      cancelPendingAction,
      clearNotice,
    }),
    [
      state,
      isDirty,
      openEditorFile,
      openUntitledEditor,
      chooseAndOpenFile,
      saveEditorFile,
      saveEditorFileAs,
      requestCloseEditor,
      closeEditorWithoutPrompt,
      collapseEditor,
      expandEditor,
      toggleEditor,
      setEditorContent,
      revertEditorFile,
      confirmPendingActionWithSave,
      discardPendingAction,
      cancelPendingAction,
      clearNotice,
    ]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditorContext must be used within EditorProvider');
  }
  return context;
}

/**
 * Variant of `useEditorContext` that returns null when used outside the
 * provider. Mirrors `useTerminalPanelSafe` so the global Titlebar can
 * conditionally render the editor toggle.
 */
export function useEditorContextSafe(): EditorContextValue | null {
  return useContext(EditorContext);
}
