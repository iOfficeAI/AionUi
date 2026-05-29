/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EDITOR_MAX_EDITABLE_BYTES, getEditorFileName, inferEditorLanguage } from './editorLanguage';
import type {
  EditorBufferViewState,
  EditorContextValue,
  EditorNotice,
  EditorOpenRequest,
  EditorPendingAction,
  EditorState,
  OpenBuffer,
} from './types';

const UNTITLED_BASE = 'Untitled';
const UNTITLED_EXT = '.txt';
const FILE_CHANGE_POLL_MS = 2500;

const EditorContext = createContext<EditorContextValue | null>(null);

const initialState: EditorState = {
  isOpen: false,
  isCollapsed: false,
  buffers: [],
  activeKey: null,
  pendingAction: null,
  notice: null,
};

let noticeId = 0;
let untitledCounter = 0;

const createNotice = (kind: EditorNotice['kind'], key: string, values?: EditorNotice['values']): EditorNotice => ({
  id: (noticeId += 1),
  kind,
  key,
  values,
});

const bufferKeyFor = (request: EditorOpenRequest): string => `${request.workspace ?? ''}::${request.path}`;

const newUntitledBuffer = (): OpenBuffer => {
  untitledCounter += 1;
  const suffix = untitledCounter === 1 ? '' : `-${untitledCounter}`;
  return {
    key: `untitled:${untitledCounter}`,
    filePath: null,
    workspace: undefined,
    fileName: `${UNTITLED_BASE}${suffix}${UNTITLED_EXT}`,
    content: '',
    originalContent: '',
    language: 'plaintext',
    lastModified: null,
    diskChanged: false,
    loading: false,
    saving: false,
    viewState: null,
  };
};

const updateBuffer = (
  buffers: OpenBuffer[],
  key: string,
  patch: Partial<OpenBuffer> | ((prev: OpenBuffer) => Partial<OpenBuffer>)
): OpenBuffer[] =>
  buffers.map((b) => {
    if (b.key !== key) return b;
    const merged = typeof patch === 'function' ? patch(b) : patch;
    return { ...b, ...merged };
  });

const findBuffer = (buffers: OpenBuffer[], key: string | null): OpenBuffer | null =>
  key ? (buffers.find((b) => b.key === key) ?? null) : null;

const isBufferDirty = (b: OpenBuffer): boolean => b.content !== b.originalContent;

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<EditorState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const activeBuffer = findBuffer(state.buffers, state.activeKey);
  const isDirty = activeBuffer ? isBufferDirty(activeBuffer) : false;
  const hasAnyDirty = state.buffers.some(isBufferDirty);

  // ---------------------------------------------------------------------------
  // Buffer mutators
  // ---------------------------------------------------------------------------

  const upsertBuffer = useCallback((buffer: OpenBuffer): void => {
    setState((prev) => {
      const existingIndex = prev.buffers.findIndex((b) => b.key === buffer.key);
      const buffers =
        existingIndex >= 0
          ? prev.buffers.map((b, i) => (i === existingIndex ? buffer : b))
          : [...prev.buffers, buffer];
      return {
        ...prev,
        isOpen: true,
        isCollapsed: false,
        buffers,
        activeKey: buffer.key,
        pendingAction: null,
      };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Open / read flow
  // ---------------------------------------------------------------------------

  const executeOpenFile = useCallback(async (request: EditorOpenRequest): Promise<boolean> => {
    const key = bufferKeyFor(request);

    // If already open, just activate the tab.
    if (stateRef.current.buffers.some((b) => b.key === key)) {
      setState((prev) => ({ ...prev, isOpen: true, isCollapsed: false, activeKey: key, pendingAction: null }));
      return true;
    }

    setState((prev) => ({
      ...prev,
      isOpen: true,
      isCollapsed: false,
      pendingAction: null,
      buffers: [
        ...prev.buffers,
        {
          key,
          filePath: request.path,
          workspace: request.workspace,
          fileName: getEditorFileName(request.path),
          content: '',
          originalContent: '',
          language: inferEditorLanguage(request.path),
          lastModified: null,
          diskChanged: false,
          loading: true,
          saving: false,
          viewState: null,
        },
      ],
      activeKey: key,
    }));

    try {
      const metadata = await ipcBridge.fs.getFileMetadata.invoke({ path: request.path, workspace: request.workspace });
      if (metadata?.isDirectory) {
        setState((prev) => ({
          ...prev,
          buffers: prev.buffers.filter((b) => b.key !== key),
          activeKey: prev.activeKey === key ? (prev.buffers.find((b) => b.key !== key)?.key ?? null) : prev.activeKey,
          notice: createNotice('error', 'conversation.editor.openFailed'),
        }));
        return false;
      }

      if (metadata?.size && metadata.size > EDITOR_MAX_EDITABLE_BYTES) {
        setState((prev) => ({
          ...prev,
          buffers: prev.buffers.filter((b) => b.key !== key),
          activeKey: prev.activeKey === key ? (prev.buffers.find((b) => b.key !== key)?.key ?? null) : prev.activeKey,
          notice: createNotice('warning', 'conversation.editor.largeFileBlocked'),
        }));
        return false;
      }

      const content = await ipcBridge.fs.readFile.invoke({ path: request.path, workspace: request.workspace });
      if (content == null) throw new Error('read failed');

      setState((prev) => ({
        ...prev,
        buffers: updateBuffer(prev.buffers, key, {
          content,
          originalContent: content,
          loading: false,
          lastModified: metadata?.lastModified ?? null,
          diskChanged: false,
        }),
      }));
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        buffers: prev.buffers.filter((b) => b.key !== key),
        activeKey: prev.activeKey === key ? (prev.buffers.find((b) => b.key !== key)?.key ?? null) : prev.activeKey,
        notice: createNotice('error', 'conversation.editor.openFailed'),
      }));
      return false;
    }
  }, []);

  const openEditorFile = useCallback(
    async (request: EditorOpenRequest): Promise<boolean> => executeOpenFile(request),
    [executeOpenFile]
  );

  const executeNewFile = useCallback(() => {
    const buffer = newUntitledBuffer();
    upsertBuffer(buffer);
  }, [upsertBuffer]);

  const openUntitledEditor = useCallback(() => {
    executeNewFile();
  }, [executeNewFile]);

  const chooseAndOpenFile = useCallback(async (): Promise<boolean> => {
    const files = await ipcBridge.dialog.showOpen.invoke({ properties: ['openFile'] });
    const filePath = files?.[0];
    if (!filePath) return false;
    return openEditorFile({ path: filePath });
  }, [openEditorFile]);

  // ---------------------------------------------------------------------------
  // Save flow (operates on active buffer)
  // ---------------------------------------------------------------------------

  const saveEditorFileAs = useCallback(async (): Promise<boolean> => {
    const current = findBuffer(stateRef.current.buffers, stateRef.current.activeKey);
    if (!current) return false;

    const filePath = await ipcBridge.dialog.showSave.invoke({ defaultPath: current.filePath ?? current.fileName });
    if (!filePath) return false;

    setState((prev) => ({ ...prev, buffers: updateBuffer(prev.buffers, current.key, { saving: true }) }));
    try {
      const ok = await ipcBridge.fs.writeFile.invoke({ path: filePath, data: current.content });
      if (!ok) throw new Error('write failed');
      const metadata = await ipcBridge.fs.getFileMetadata.invoke({ path: filePath });
      const newKey = `::${filePath}`;
      setState((prev) => ({
        ...prev,
        buffers: prev.buffers.map((b) =>
          b.key === current.key
            ? {
                ...b,
                key: newKey,
                filePath,
                workspace: undefined,
                fileName: getEditorFileName(filePath),
                originalContent: b.content,
                language: inferEditorLanguage(filePath),
                saving: false,
                lastModified: metadata?.lastModified ?? null,
                diskChanged: false,
              }
            : b
        ),
        activeKey: prev.activeKey === current.key ? newKey : prev.activeKey,
        notice: createNotice('success', 'common.saveSuccess'),
      }));
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        buffers: updateBuffer(prev.buffers, current.key, { saving: false }),
        notice: createNotice('error', 'common.saveFailed'),
      }));
      return false;
    }
  }, []);

  const saveEditorFile = useCallback(async (): Promise<boolean> => {
    const current = findBuffer(stateRef.current.buffers, stateRef.current.activeKey);
    if (!current) return false;
    if (!current.filePath) return saveEditorFileAs();

    setState((prev) => ({ ...prev, buffers: updateBuffer(prev.buffers, current.key, { saving: true }) }));
    try {
      const ok = await ipcBridge.fs.writeFile.invoke({ path: current.filePath, data: current.content });
      if (!ok) throw new Error('write failed');
      const metadata = await ipcBridge.fs.getFileMetadata.invoke({
        path: current.filePath,
        workspace: current.workspace,
      });
      setState((prev) => ({
        ...prev,
        buffers: updateBuffer(prev.buffers, current.key, (b) => ({
          originalContent: b.content,
          saving: false,
          lastModified: metadata?.lastModified ?? b.lastModified,
          diskChanged: false,
        })),
        notice: createNotice('success', 'common.saveSuccess'),
      }));
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        buffers: updateBuffer(prev.buffers, current.key, { saving: false }),
        notice: createNotice('error', 'common.saveFailed'),
      }));
      return false;
    }
  }, [saveEditorFileAs]);

  // ---------------------------------------------------------------------------
  // Close flow (per-tab + close-all)
  // ---------------------------------------------------------------------------

  const removeBuffer = useCallback((key: string) => {
    setState((prev) => {
      const remaining = prev.buffers.filter((b) => b.key !== key);
      let nextActive = prev.activeKey;
      if (nextActive === key) {
        const idx = prev.buffers.findIndex((b) => b.key === key);
        nextActive = remaining[idx]?.key ?? remaining[idx - 1]?.key ?? remaining[0]?.key ?? null;
      }
      return {
        ...prev,
        buffers: remaining,
        activeKey: nextActive,
        isOpen: remaining.length > 0,
      };
    });
  }, []);

  const closeEditorWithoutPrompt = useCallback(() => {
    setState(initialState);
  }, []);

  const requestCloseBuffer = useCallback(
    (key?: string) => {
      const targetKey = key ?? stateRef.current.activeKey;
      if (!targetKey) return;
      const target = findBuffer(stateRef.current.buffers, targetKey);
      if (!target) return;
      if (isBufferDirty(target)) {
        setState((prev) => ({ ...prev, pendingAction: { type: 'close-buffer', bufferKey: targetKey } }));
        return;
      }
      removeBuffer(targetKey);
    },
    [removeBuffer]
  );

  const requestCloseEditor = useCallback(() => {
    if (stateRef.current.buffers.some(isBufferDirty)) {
      setState((prev) => ({ ...prev, pendingAction: { type: 'close-all' } }));
      return;
    }
    closeEditorWithoutPrompt();
  }, [closeEditorWithoutPrompt]);

  // ---------------------------------------------------------------------------
  // Tab navigation
  // ---------------------------------------------------------------------------

  const setActiveBuffer = useCallback((key: string) => {
    setState((prev) =>
      prev.buffers.some((b) => b.key === key)
        ? { ...prev, activeKey: key, isOpen: true, isCollapsed: false }
        : prev
    );
  }, []);

  const reorderBuffers = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setState((prev) => {
      const fromIdx = prev.buffers.findIndex((b) => b.key === fromKey);
      const toIdx = prev.buffers.findIndex((b) => b.key === toKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = prev.buffers.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { ...prev, buffers: next };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Panel toggle / collapse
  // ---------------------------------------------------------------------------

  const collapseEditor = useCallback(() => {
    setState((prev) => ({ ...prev, isCollapsed: true }));
  }, []);

  const expandEditor = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: true, isCollapsed: false }));
  }, []);

  const toggleEditor = useCallback(() => {
    const current = stateRef.current;
    if (!current.isOpen) {
      executeNewFile();
      return;
    }
    setState((prev) => ({ ...prev, isCollapsed: !prev.isCollapsed }));
  }, [executeNewFile]);

  // ---------------------------------------------------------------------------
  // Content / view-state setters
  // ---------------------------------------------------------------------------

  const setEditorContent = useCallback((content: string) => {
    setState((prev) =>
      prev.activeKey ? { ...prev, buffers: updateBuffer(prev.buffers, prev.activeKey, { content }) } : prev
    );
  }, []);

  const setBufferViewState = useCallback((key: string, viewState: EditorBufferViewState | null) => {
    setState((prev) => ({ ...prev, buffers: updateBuffer(prev.buffers, key, { viewState }) }));
  }, []);

  const revertEditorFile = useCallback(() => {
    setState((prev) => {
      if (!prev.activeKey) return prev;
      return {
        ...prev,
        buffers: updateBuffer(prev.buffers, prev.activeKey, (b) => ({
          content: b.originalContent,
          diskChanged: false,
        })),
      };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Pending-action resolution
  // ---------------------------------------------------------------------------

  const executePendingAction = useCallback(
    async (pendingAction: EditorPendingAction | null): Promise<void> => {
      if (!pendingAction) return;
      if (pendingAction.type === 'close-buffer') {
        removeBuffer(pendingAction.bufferKey);
        return;
      }
      if (pendingAction.type === 'close-all') {
        closeEditorWithoutPrompt();
        return;
      }
      if (pendingAction.type === 'new-file') {
        executeNewFile();
        return;
      }
      await executeOpenFile(pendingAction.request);
    },
    [closeEditorWithoutPrompt, executeNewFile, executeOpenFile, removeBuffer]
  );

  const confirmPendingActionWithSave = useCallback(async () => {
    const pendingAction = stateRef.current.pendingAction;
    const saved = await saveEditorFile();
    if (saved) await executePendingAction(pendingAction);
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

  // ---------------------------------------------------------------------------
  // Disk-change polling (iterates all open buffers)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = stateRef.current;
      if (!current.isOpen || current.isCollapsed) return;
      for (const buffer of current.buffers) {
        if (!buffer.filePath || buffer.loading || buffer.saving) continue;
        const { key, filePath, workspace, lastModified } = buffer;
        void ipcBridge.fs.getFileMetadata
          .invoke({ path: filePath, workspace })
          .then((metadata) => {
            if (!metadata || metadata.lastModified === lastModified) return;
            const latest = findBuffer(stateRef.current.buffers, key);
            if (!latest) return;
            if (isBufferDirty(latest)) {
              setState((prev) => ({
                ...prev,
                buffers: updateBuffer(prev.buffers, key, {
                  lastModified: metadata.lastModified,
                  diskChanged: true,
                }),
                notice:
                  prev.activeKey === key
                    ? createNotice('warning', 'conversation.editor.fileChangedOnDisk')
                    : prev.notice,
              }));
              return;
            }
            void ipcBridge.fs.readFile.invoke({ path: filePath, workspace }).then((content) => {
              if (content == null) return;
              setState((prev) => ({
                ...prev,
                buffers: updateBuffer(prev.buffers, key, {
                  content,
                  originalContent: content,
                  lastModified: metadata.lastModified,
                  diskChanged: false,
                }),
              }));
            });
          })
          .catch((): void => undefined);
      }
    }, FILE_CHANGE_POLL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const value = useMemo<EditorContextValue>(
    () => ({
      ...state,
      activeBuffer,
      isDirty,
      hasAnyDirty,
      openEditorFile,
      openUntitledEditor,
      chooseAndOpenFile,
      saveEditorFile,
      saveEditorFileAs,
      requestCloseBuffer,
      requestCloseEditor,
      closeEditorWithoutPrompt,
      setActiveBuffer,
      reorderBuffers,
      collapseEditor,
      expandEditor,
      toggleEditor,
      setEditorContent,
      setBufferViewState,
      revertEditorFile,
      confirmPendingActionWithSave,
      discardPendingAction,
      cancelPendingAction,
      clearNotice,
    }),
    [
      state,
      activeBuffer,
      isDirty,
      hasAnyDirty,
      openEditorFile,
      openUntitledEditor,
      chooseAndOpenFile,
      saveEditorFile,
      saveEditorFileAs,
      requestCloseBuffer,
      requestCloseEditor,
      closeEditorWithoutPrompt,
      setActiveBuffer,
      reorderBuffers,
      collapseEditor,
      expandEditor,
      toggleEditor,
      setEditorContent,
      setBufferViewState,
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
  if (!context) throw new Error('useEditorContext must be used within EditorProvider');
  return context;
}

export function useEditorContextSafe(): EditorContextValue | null {
  return useContext(EditorContext);
}
