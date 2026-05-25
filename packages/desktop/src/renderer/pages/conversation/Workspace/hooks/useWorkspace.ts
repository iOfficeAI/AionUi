/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile, WorkspaceChange } from '@/common/adapter/ipcBridge';
import { workspaceWatcher } from '@/common/adapter/ipcBridge';
import { wsOnReconnect, wsSend } from '@/common/adapter/httpBridge';
import { configService } from '@/common/config/configService';
import { usePasteService } from '@/renderer/hooks/file/usePasteService';
import { trackUpload } from '@/renderer/hooks/file/useUploadState';
import { uploadFileViaHttp } from '@/renderer/services/FileService';
import { downloadFileFromPath } from '@/renderer/utils/file/download';
import { fetchFileAsText } from '@/renderer/utils/file/staticFile';
import { removeWorkspaceEntry, renameWorkspaceEntry } from '@/renderer/utils/file/workspaceFs';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { dispatchWorkspaceHasFilesEvent } from '@/renderer/utils/workspace/workspaceEvents';
import {
  LARGE_TEXT_PREVIEW_MAX_LENGTH,
  LARGE_TEXT_PREVIEW_THRESHOLD,
} from '@/renderer/pages/conversation/Preview/constants';
import { getContentTypeByExtension } from '@/renderer/pages/conversation/Preview/fileUtils';
import { classifyPreviewError, previewErrorToI18nKey } from '@/renderer/utils/previewError';
import type { PreviewContentType } from '@/common/types/office/preview';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceContext } from '../store/WorkspaceProvider';
import { pathExistsInTree, useWorkspaceStore } from '../store/workspaceStore';
import type { DeleteModalState, MessageApi, PasteConfirmState, RenameModalState } from '../types';
import {
  getFirstLevelKeys,
  getPathSeparator,
  getTargetFolderPath,
  mergeLoadedChildren,
  replacePathInList,
  updateTreeForRename,
} from '../utils/treeHelpers';

interface UseWorkspaceOptions {
  messageApi: MessageApi;
  t: (key: string, options?: Record<string, unknown>) => string;
  collapsed: boolean;
  openPreview: (content: string, type: PreviewContentType, metadata?: any) => void;

  // Modal hooks (kept external since they're pure UI)
  renameModal: RenameModalState;
  deleteModal: DeleteModalState;
  renameLoading: boolean;
  setRenameLoading: React.Dispatch<React.SetStateAction<boolean>>;
  closeRenameModal: () => void;
  closeDeleteModal: () => void;
  closeContextMenu: () => void;
  setRenameModal: React.Dispatch<React.SetStateAction<RenameModalState>>;
  setDeleteModal: React.Dispatch<React.SetStateAction<DeleteModalState>>;

  // Paste confirm (UI state lives in modals hook)
  pasteConfirm: PasteConfirmState;
  setPasteConfirm: React.Dispatch<React.SetStateAction<PasteConfirmState>>;
  closePasteConfirm: () => void;
}

const BINARY_EXTENSIONS = new Set([
  'db',
  'db-shm',
  'db-wal',
  'sqlite',
  'sqlite3',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'dat',
  'zip',
  'tar',
  'gz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'class',
  'pyc',
  'pyo',
  'o',
  'obj',
  'a',
  'lib',
]);

/**
 * useWorkspace — single point of entry for workspace tree state, ws subscriptions,
 * and file operations. Replaces the former useWorkspaceTree/Watcher/FileOps/Paste/Events
 * fan-out by funneling everything through WorkspaceStore.
 *
 * Data flow: backend ws push is the only update channel for the tree. Local
 * operations (rename/delete/paste/upload) call backend APIs and let ws events
 * propagate the result back. No setTimeout(refresh) anywhere.
 */
export function useWorkspace(options: UseWorkspaceOptions) {
  const {
    messageApi,
    t,
    collapsed,
    openPreview,
    renameModal,
    deleteModal,
    renameLoading,
    setRenameLoading,
    closeRenameModal,
    closeDeleteModal,
    closeContextMenu,
    setRenameModal,
    setDeleteModal,
    pasteConfirm,
    setPasteConfirm,
    closePasteConfirm,
  } = options;

  const { store, workspace, conversationId, eventPrefix } = useWorkspaceContext();

  // Subscribe to slices the consumer needs to render.
  const files = useWorkspaceStore(store, (s) => s.files);
  const loading = useWorkspaceStore(store, (s) => s.loading);
  const treeKey = useWorkspaceStore(store, (s) => s.treeKey);
  const expandedKeys = useWorkspaceStore(store, (s) => s.expandedKeys);
  const selected = useWorkspaceStore(store, (s) => s.selected);

  // Refs for synchronous access from event handlers (avoid stale closures).
  const filesRef = useRef<IDirOrFile[]>(files);
  filesRef.current = files;
  const expandedKeysRef = useRef<string[]>(expandedKeys);
  expandedKeysRef.current = expandedKeys;
  const selectedKeysRef = useRef<string[]>(selected);
  selectedKeysRef.current = selected;
  // Track latest selected folder node (useful for paste target).
  const selectedNodeRef = useRef<{ relativePath: string; fullPath: string } | null>(null);

  const isFirstLoadRef = useRef(true);
  const isReadyRef = useRef(false);
  const lastLoadingTimeRef = useRef(Date.now());
  const loadSeqRef = useRef(0);

  // -----------------------------------------------------------------------
  // Loading helpers
  // -----------------------------------------------------------------------

  const setLoading = useCallback(
    (next: boolean) => {
      if (next) {
        lastLoadingTimeRef.current = Date.now();
        store.setLoading(true);
      } else if (Date.now() - lastLoadingTimeRef.current > 1000) {
        store.setLoading(false);
      } else {
        setTimeout(() => store.setLoading(false), 1000);
      }
    },
    [store]
  );

  const loadWorkspace = useCallback(
    (path: string, search?: string): Promise<IDirOrFile[]> => {
      const seq = ++loadSeqRef.current;
      setLoading(true);
      return ipcBridge.conversation.getWorkspace
        .invoke({ path, workspace, conversation_id: conversationId, search: search || '' })
        .then((res) => {
          if (seq !== loadSeqRef.current) return res;

          const isEmpty = res.length === 0 || (res[0]?.children?.length ?? 0) === 0;
          if (!isFirstLoadRef.current && !search && isEmpty) return res;

          if (!search && !isFirstLoadRef.current) {
            store.setFiles(mergeLoadedChildren(res, store.getState().files));
          } else {
            store.setFiles(res);
          }

          if (search) store.setTreeKey(Math.random());

          if (isFirstLoadRef.current) {
            store.setExpandedKeys(getFirstLevelKeys(res));
          } else {
            const firstLevel = getFirstLevelKeys(res);
            const merged = [...new Set([...store.getState().expandedKeys, ...firstLevel])];
            store.setExpandedKeys(merged);
          }

          const hasFiles = res.length > 0 && (res[0]?.children?.length ?? 0) > 0;
          const wasFirstLoad = isFirstLoadRef.current;
          if (isFirstLoadRef.current) isFirstLoadRef.current = false;
          if (hasFiles) dispatchWorkspaceHasFilesEvent(true, conversationId, wasFirstLoad);

          return res;
        })
        .catch((err) => {
          console.error('[useWorkspace] loadWorkspace failed:', err);
          return [] as IDirOrFile[];
        })
        .finally(() => setLoading(false));
    },
    [conversationId, setLoading, store, workspace]
  );

  const refreshWorkspace = useCallback(() => loadWorkspace(workspace), [loadWorkspace, workspace]);

  // -----------------------------------------------------------------------
  // ws subscription primitives — all reads from store, no parallel refs
  // -----------------------------------------------------------------------

  const sendSubscribe = useCallback(
    (dirs: string[]) => {
      if (!workspace || dirs.length === 0) return;
      const newDirs = dirs.filter((d) => !store.isAnySubscribed(d));
      if (newDirs.length > 0) wsSend('workspace.subscribe', { workspace, dirs: newDirs });
    },
    [store, workspace]
  );

  const sendUnsubscribe = useCallback(
    (dirs: string[]) => {
      if (!workspace || dirs.length === 0) return;
      const toUnsub = dirs.filter((d) => !store.isAnySubscribed(d));
      if (toUnsub.length > 0) wsSend('workspace.unsubscribe', { workspace, dirs: toUnsub });
    },
    [store, workspace]
  );

  const refetchDir = useCallback(
    (dir: string) => {
      if (!workspace) return;
      const fullPath = dir ? `${workspace}/${dir}` : workspace;
      void ipcBridge.conversation.getWorkspace
        .invoke({ path: fullPath, workspace, conversation_id: conversationId, search: '' })
        .then((res: IDirOrFile[]) => {
          if (!res || res.length === 0) return;
          if (dir === '') {
            store.setFiles(res);
          } else {
            const newChildren = res[0]?.children;
            if (!newChildren) return;
            store.replaceChildren(dir, newChildren);
          }
        })
        .catch((err: unknown) => {
          console.error('[useWorkspace] refetch failed:', dir, err);
        });
    },
    [conversationId, store, workspace]
  );

  // -----------------------------------------------------------------------
  // ws change application
  // -----------------------------------------------------------------------

  const applyChanges = useCallback(
    (changes: WorkspaceChange[]) => {
      const dirsToRefetch = new Set<string>();
      const pathsToDelete = new Set<string>();
      const pathsModified: string[] = [];

      for (const change of changes) {
        const lastSlash = change.path.lastIndexOf('/');
        const parentDir = lastSlash >= 0 ? change.path.substring(0, lastSlash) : '';

        switch (change.kind) {
          case 'delete':
            pathsToDelete.add(change.path);
            break;
          case 'modify': {
            // OS events on macOS misclassify create as modify (FSEvents granularity).
            // If path already exists in tree → real content modify, no refetch needed.
            // If not → walk ancestors, refetch the deepest subscribed one.
            if (pathExistsInTree(filesRef.current, change.path)) {
              pathsModified.push(change.path);
              break;
            }
            let cursor = change.path;
            while (true) {
              const slash = cursor.lastIndexOf('/');
              const parent = slash >= 0 ? cursor.substring(0, slash) : '';
              if (store.isAnySubscribed(parent)) {
                dirsToRefetch.add(parent);
                break;
              }
              if (parent === '') break;
              cursor = parent;
            }
            break;
          }
          case 'create':
          case 'rename':
            dirsToRefetch.add(parentDir);
            break;
        }
      }

      if (pathsToDelete.size > 0) {
        store.removeNodes(pathsToDelete);
        for (const path of pathsToDelete) {
          emitter.emit('workspace.file.deleted', { workspace, relativePath: path });
        }
      }

      for (const path of pathsModified) {
        emitter.emit('workspace.file.modified', { workspace, relativePath: path });
      }

      for (const dir of dirsToRefetch) refetchDir(dir);
    },
    [refetchDir, store, workspace]
  );

  // -----------------------------------------------------------------------
  // ws lifecycle: bind event listeners, handle reconnect, unsubscribe on unmount
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!workspace) return;

    const unsubChanged = workspaceWatcher.changed.on((event) => {
      if (event.workspace !== workspace) return;
      applyChanges(event.changes);
    });

    const unsubOverflow = workspaceWatcher.overflow.on((event) => {
      if (event.workspace !== workspace) return;
      void refreshWorkspace();
    });

    const removeReconnect = wsOnReconnect(() => {
      const s = store.getState();
      const allDirs = new Set([...s.treeSubscribedDirs, ...s.previewSubscribedDirs]);
      if (allDirs.size > 0) wsSend('workspace.subscribe', { workspace, dirs: [...allDirs] });
    });

    return () => {
      unsubChanged();
      unsubOverflow();
      removeReconnect();
      const s = store.getState();
      const allDirs = new Set([...s.treeSubscribedDirs, ...s.previewSubscribedDirs]);
      if (allDirs.size > 0) wsSend('workspace.unsubscribe', { workspace, dirs: [...allDirs] });
    };
  }, [applyChanges, refreshWorkspace, store, workspace]);

  // -----------------------------------------------------------------------
  // Initial subscription when panel becomes visible
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!workspace) return;
    if (collapsed) {
      isReadyRef.current = false;
      return;
    }
    if (!isReadyRef.current) {
      isReadyRef.current = true;
      const dirs = ['', ...expandedKeysRef.current.filter((k) => k !== '')];
      sendSubscribe(dirs);
      store.addTreeSubscribedDirs(dirs);
      emitter.emit('workspace.preview.refetch', { workspace });
    }
  }, [collapsed, sendSubscribe, store, workspace]);

  // Preview subscriptions — managed via emitter so Preview pane stays decoupled.
  useEffect(() => {
    const handleSub = ({ workspace: ws, dir }: { workspace: string; dir: string }) => {
      if (ws !== workspace) return;
      sendSubscribe([dir]);
      store.addPreviewSubscribedDir(dir);
    };
    const handleUnsub = ({ workspace: ws, dir }: { workspace: string; dir: string }) => {
      if (ws !== workspace) return;
      store.removePreviewSubscribedDir(dir);
      sendUnsubscribe([dir]);
    };
    emitter.on('workspace.preview.subscribe', handleSub);
    emitter.on('workspace.preview.unsubscribe', handleUnsub);
    return () => {
      emitter.off('workspace.preview.subscribe', handleSub);
      emitter.off('workspace.preview.unsubscribe', handleUnsub);
    };
  }, [sendSubscribe, sendUnsubscribe, store, workspace]);

  // -----------------------------------------------------------------------
  // Tree expand/collapse → subscription sync
  // -----------------------------------------------------------------------

  const onDirsExpand = useCallback(
    (dirs: string[]) => {
      sendSubscribe(dirs);
      store.addTreeSubscribedDirs(dirs);
      for (const d of dirs) refetchDir(d);
    },
    [refetchDir, sendSubscribe, store]
  );

  const onDirsCollapse = useCallback(
    (dirs: string[]) => {
      // Defensive: root subscription "" is owned by panel lifecycle, never user toggles.
      const filtered = dirs.filter((d) => d !== '');
      if (filtered.length === 0) return;
      store.removeTreeSubscribedDirs(filtered);
      sendUnsubscribe(filtered);
    },
    [sendUnsubscribe, store]
  );

  // -----------------------------------------------------------------------
  // Selection
  // -----------------------------------------------------------------------

  const setExpandedKeys = useCallback(
    (keys: string[] | ((prev: string[]) => string[])) => {
      const prev = store.getState().expandedKeys;
      const next = typeof keys === 'function' ? keys(prev) : keys;
      store.setExpandedKeys(next);
    },
    [store]
  );

  const setSelected = useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      const prev = store.getState().selected;
      const value = typeof next === 'function' ? next(prev) : next;
      store.setSelected(value);
    },
    [store]
  );

  const ensureNodeSelected = useCallback(
    (nodeData: IDirOrFile, opts?: { emit?: boolean }) => {
      const key = nodeData.relativePath;
      const shouldEmit = Boolean(opts?.emit);

      if (!key) {
        store.setSelected([]);
        if (!nodeData.isFile && nodeData.fullPath) {
          selectedNodeRef.current = { relativePath: '', fullPath: nodeData.fullPath };
        }
        if (shouldEmit && nodeData.fullPath) {
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: nodeData.isFile,
              relativePath: nodeData.relativePath,
            },
          ]);
        } else if (shouldEmit) {
          emitter.emit(`${eventPrefix}.selected.file`, []);
        }
        return;
      }

      store.setSelected([key]);

      if (!nodeData.isFile) {
        selectedNodeRef.current = { relativePath: key, fullPath: nodeData.fullPath };
        if (shouldEmit && nodeData.fullPath) {
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: false,
              relativePath: nodeData.relativePath,
            },
          ]);
        }
      } else if (nodeData.fullPath) {
        selectedNodeRef.current = null;
        if (shouldEmit) {
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: true,
              relativePath: nodeData.relativePath,
            },
          ]);
        }
      }
    },
    [eventPrefix, store]
  );

  const clearSelection = useCallback(() => {
    store.setSelected([]);
    selectedNodeRef.current = null;
  }, [store]);

  // -----------------------------------------------------------------------
  // File operations — all data updates flow back via ws, never via setTimeout
  // -----------------------------------------------------------------------

  const handleOpenNode = useCallback(
    async (nodeData: IDirOrFile | null) => {
      if (!nodeData) return;
      try {
        await ipcBridge.shell.openFile.invoke(nodeData.fullPath);
      } catch {
        messageApi.error(t('conversation.workspace.contextMenu.openFailed') || 'Failed to open');
      }
    },
    [messageApi, t]
  );

  const handleRevealNode = useCallback(
    async (nodeData: IDirOrFile | null) => {
      if (!nodeData) return;
      try {
        await ipcBridge.shell.showItemInFolder.invoke(nodeData.fullPath);
      } catch {
        messageApi.error(t('conversation.workspace.contextMenu.revealFailed') || 'Failed to reveal');
      }
    },
    [messageApi, t]
  );

  const handleDeleteNode = useCallback(
    (nodeData: IDirOrFile | null, opts?: { emit?: boolean }) => {
      if (!nodeData || !nodeData.relativePath) return;
      ensureNodeSelected(nodeData, { emit: Boolean(opts?.emit) });
      closeContextMenu();
      setDeleteModal({ visible: true, target: nodeData, loading: false });
    },
    [closeContextMenu, ensureNodeSelected, setDeleteModal]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteModal.target) return;
    try {
      setDeleteModal((prev) => ({ ...prev, loading: true }));
      await removeWorkspaceEntry(deleteModal.target.fullPath);

      // Optimistic local removal: ws may not push the parent dir refetch in
      // time and React's render is single-channel, so we delete from store
      // immediately. The follow-up ws delete event is idempotent (Set-based
      // pathsToDelete on a tree that no longer contains the path is a no-op).
      const removed = new Set<string>([deleteModal.target.relativePath]);
      store.removeNodes(removed);

      messageApi.success(t('conversation.workspace.contextMenu.deleteSuccess'));
      store.setSelected([]);
      selectedNodeRef.current = null;
      emitter.emit(`${eventPrefix}.selected.file`, []);
      closeDeleteModal();
    } catch {
      messageApi.error(t('conversation.workspace.contextMenu.deleteFailed'));
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  }, [closeDeleteModal, deleteModal.target, eventPrefix, messageApi, setDeleteModal, store, t]);

  const waitWithTimeout = useCallback(<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('timeout')), timeoutMs);
      promise
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timer);
          reject(error);
        });
    });
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    const target = renameModal.target;
    if (!target) return;
    if (renameLoading) return;
    const trimmedName = renameModal.value.trim();
    if (!trimmedName) {
      messageApi.warning(t('conversation.workspace.contextMenu.renameEmpty'));
      return;
    }
    if (trimmedName === target.name) {
      closeRenameModal();
      return;
    }

    const sep = getPathSeparator(target.fullPath);
    const parentFull = target.fullPath.slice(0, target.fullPath.lastIndexOf(sep));
    const newFullPath = parentFull ? `${parentFull}${sep}${trimmedName}` : trimmedName;

    const newRelativePath = (() => {
      if (!target.relativePath) return target.isFile ? trimmedName : '';
      const segments = target.relativePath.split('/');
      segments[segments.length - 1] = trimmedName;
      return segments.join('/');
    })();

    try {
      setRenameLoading(true);
      await waitWithTimeout(renameWorkspaceEntry(target.fullPath, trimmedName));

      closeRenameModal();

      // Optimistic in-place update — ws follow-up will refetch the parent dir
      // and overwrite this with authoritative state. Keeps the selection/expanded
      // keys synchronized without a UI flicker.
      const oldRelativePath = target.relativePath ?? '';
      const next = updateTreeForRename(store.getState().files, oldRelativePath, trimmedName, newFullPath);
      store.setFiles(next);
      store.setExpandedKeys(replacePathInList(store.getState().expandedKeys, oldRelativePath, newRelativePath));
      store.setSelected(replacePathInList(store.getState().selected, oldRelativePath, newRelativePath));

      if (!target.isFile) {
        selectedNodeRef.current = { relativePath: newRelativePath, fullPath: newFullPath };
        emitter.emit(`${eventPrefix}.selected.file`, []);
      } else {
        selectedNodeRef.current = null;
      }

      messageApi.success(t('conversation.workspace.contextMenu.renameSuccess'));
    } catch (error) {
      if (error instanceof Error && error.message === 'timeout') {
        messageApi.error(t('conversation.workspace.contextMenu.renameTimeout'));
      } else {
        messageApi.error(t('conversation.workspace.contextMenu.renameFailed'));
      }
    } finally {
      setRenameLoading(false);
    }
  }, [
    closeRenameModal,
    eventPrefix,
    messageApi,
    renameLoading,
    renameModal,
    setRenameLoading,
    store,
    t,
    waitWithTimeout,
  ]);

  const handleAddToChat = useCallback(
    (nodeData: IDirOrFile | null) => {
      if (!nodeData || !nodeData.fullPath) return;
      ensureNodeSelected(nodeData);
      closeContextMenu();
      const payload: FileOrFolderItem = {
        path: nodeData.fullPath,
        name: nodeData.name,
        isFile: Boolean(nodeData.isFile),
        relativePath: nodeData.relativePath || undefined,
      };
      emitter.emit(`${eventPrefix}.selected.file.append`, [payload]);
      messageApi.success(t('conversation.workspace.contextMenu.addedToChat'));
    },
    [closeContextMenu, ensureNodeSelected, eventPrefix, messageApi, t]
  );

  const handlePreviewFile = useCallback(
    async (nodeData: IDirOrFile | null) => {
      if (!nodeData || !nodeData.fullPath || !nodeData.isFile) return;
      try {
        closeContextMenu();
        const ext = nodeData.name.toLowerCase().split('.').pop() || '';
        const fullExt = nodeData.name.toLowerCase().replace(/^[^.]*\.?/, '');
        if (BINARY_EXTENSIONS.has(ext) || BINARY_EXTENSIONS.has(fullExt)) {
          messageApi.warning(
            t('conversation.workspace.contextMenu.unsupportedFileType') || 'This file type cannot be previewed'
          );
          return;
        }

        const contentType: PreviewContentType = getContentTypeByExtension(nodeData.name);
        let content = '';
        let isLargeTextTruncated = false;

        if (contentType === 'pdf' || contentType === 'word' || contentType === 'excel' || contentType === 'ppt') {
          content = '';
        } else if (contentType === 'image') {
          content = '';
        } else if (nodeData.relativePath && conversationId) {
          try {
            content = await fetchFileAsText(conversationId, nodeData.relativePath);
          } catch {
            content = await ipcBridge.fs.readFile.invoke({ path: nodeData.fullPath, workspace });
            if (content == null) throw null;
          }
          if (contentType === 'code' && content.length > LARGE_TEXT_PREVIEW_THRESHOLD) {
            content = content.slice(0, LARGE_TEXT_PREVIEW_MAX_LENGTH);
            isLargeTextTruncated = true;
          }
        } else {
          content = await ipcBridge.fs.readFile.invoke({ path: nodeData.fullPath, workspace });
          if (content == null) throw null;
          if (contentType === 'code' && content.length > LARGE_TEXT_PREVIEW_THRESHOLD) {
            content = content.slice(0, LARGE_TEXT_PREVIEW_MAX_LENGTH);
            isLargeTextTruncated = true;
          }
        }

        openPreview(content, contentType, {
          title: nodeData.name,
          file_name: nodeData.name,
          file_path: nodeData.fullPath,
          workspace,
          conversationId,
          relativePath: nodeData.relativePath,
          language: ext,
          truncated: isLargeTextTruncated,
          editable: contentType === 'markdown' || contentType === 'image' || isLargeTextTruncated ? false : undefined,
        });
      } catch (error) {
        const kind = classifyPreviewError(error);
        messageApi.error(t(previewErrorToI18nKey(kind)));
      }
    },
    [closeContextMenu, conversationId, messageApi, openPreview, t, workspace]
  );

  const openRenameModal = useCallback(
    (nodeData: IDirOrFile | null) => {
      if (!nodeData) return;
      ensureNodeSelected(nodeData);
      closeContextMenu();
      setRenameModal({ visible: true, value: nodeData.name, target: nodeData });
    },
    [closeContextMenu, ensureNodeSelected, setRenameModal]
  );

  const handleDownloadFile = useCallback(
    async (nodeData: IDirOrFile | null) => {
      if (!nodeData || !nodeData.isFile || !nodeData.fullPath) return;
      closeContextMenu();
      try {
        await downloadFileFromPath(nodeData.fullPath, nodeData.name, workspace);
        messageApi.success(t('conversation.workspace.contextMenu.downloadSuccess'));
      } catch {
        messageApi.error(t('conversation.workspace.contextMenu.downloadFailed'));
      }
    },
    [closeContextMenu, messageApi, t, workspace]
  );

  // -----------------------------------------------------------------------
  // Conversation switch — reset everything
  // -----------------------------------------------------------------------

  useEffect(() => {
    isFirstLoadRef.current = true;
    isReadyRef.current = false;
    selectedNodeRef.current = null;
    store.reset(workspace, conversationId);
    void refreshWorkspace();
    emitter.emit(`${eventPrefix}.selected.file`, []);
    // refreshWorkspace is intentionally omitted: it changes identity on workspace/conv
    // change and we already key the effect by (workspace, conversationId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, eventPrefix, store, workspace]);

  // -----------------------------------------------------------------------
  // Cross-component events
  // -----------------------------------------------------------------------

  useAddEventListener(`${eventPrefix}.workspace.refresh`, () => void refreshWorkspace(), [refreshWorkspace]);
  useAddEventListener(`${eventPrefix}.selected.file.clear`, () => clearSelection(), [clearSelection]);
  useAddEventListener(
    `${eventPrefix}.selected.file`,
    (
      items: Array<{
        path: string;
        name: string;
        isFile: boolean;
        relativePath?: string;
      }>
    ) => {
      const newKeys = items.filter((item) => !item.isFile && item.relativePath).map((item) => item.relativePath!);
      store.setSelected(newKeys);
      const folders = items.filter((item) => !item.isFile);
      if (folders.length > 0) {
        const lastFolder = folders[folders.length - 1];
        selectedNodeRef.current = lastFolder.relativePath
          ? { relativePath: lastFolder.relativePath, fullPath: lastFolder.path }
          : null;
      } else {
        selectedNodeRef.current = null;
      }
    },
    [store]
  );

  useEffect(() => {
    return ipcBridge.conversation.responseSearchWorkSpace.provider((data) => {
      if (data.match) store.setFiles([data.match]);
      return Promise.resolve();
    });
  }, [store]);

  // -----------------------------------------------------------------------
  // Paste / upload — copy via API, ws push refreshes the tree
  // -----------------------------------------------------------------------

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const copyFilesIntoWorkspace = useCallback(
    async (selectedFiles: string[], targetWorkspacePath?: string) => {
      if (!selectedFiles.length) return { copiedFiles: [] as string[], failedFiles: [] as string[] };
      const result = await ipcBridge.fs.copyFilesToWorkspace.invoke({
        file_paths: selectedFiles,
        workspace: targetWorkspacePath ?? workspace,
      });
      return {
        copiedFiles: result.copied_files ?? [],
        failedFiles: result.failed_files ?? [],
      };
    },
    [workspace]
  );

  const handleSelectHostFiles = useCallback(() => {
    void ipcBridge.dialog.showOpen
      .invoke({ properties: ['openFile', 'multiSelections'], defaultPath: workspace })
      .then(async (selectedFiles) => {
        if (!selectedFiles || selectedFiles.length === 0) return;
        const { failedFiles } = await copyFilesIntoWorkspace(selectedFiles);
        if (failedFiles.length > 0) messageApi.warning('Some files failed to copy');
      })
      .catch(() => {});
  }, [copyFilesIntoWorkspace, messageApi, workspace]);

  const handleUploadDeviceFiles = useCallback(() => {
    if (isElectronDesktop()) {
      handleSelectHostFiles();
      return;
    }
    if (!fileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.style.display = 'none';
      input.addEventListener('change', async () => {
        const fileList = input.files;
        if (!fileList || fileList.length === 0) return;
        let successCount = 0;
        try {
          for (let i = 0; i < fileList.length; i++) {
            const tracker = trackUpload(fileList[i].size, 'workspace');
            try {
              await uploadFileViaHttp(fileList[i], conversationId, tracker.onProgress);
              successCount++;
            } catch {
              messageApi.error(t('common.unknownError') || 'Upload failed');
            } finally {
              tracker.finish();
            }
          }
          if (successCount > 0) messageApi.success(t('common.fileAttach.uploadSuccess') || 'Uploaded');
        } catch {
          // ignore
        }
        input.value = '';
      });
      document.body.appendChild(input);
      fileInputRef.current = input;
    }
    fileInputRef.current.click();
  }, [conversationId, handleSelectHostFiles, messageApi, t]);

  useEffect(() => {
    return () => {
      if (fileInputRef.current?.parentNode) {
        fileInputRef.current.parentNode.removeChild(fileInputRef.current);
      }
      fileInputRef.current = null;
    };
  }, []);

  // Paste target folder for visual feedback in the tree (PASTE badge).
  const [pasteTargetFolder, setPasteTargetFolder] = useState<string | null>(null);

  const handleFilesToAdd = useCallback(
    async (filesMeta: { name: string; path: string }[]) => {
      if (!filesMeta || filesMeta.length === 0) return;
      const target = getTargetFolderPath(
        selectedNodeRef.current,
        store.getState().selected,
        store.getState().files,
        workspace
      );
      if (target.relativePath) setPasteTargetFolder(target.relativePath);

      const skipConfirm = configService.get('workspace.pasteConfirm');
      if (skipConfirm) {
        try {
          const file_paths = filesMeta.map((f) => f.path);
          const { copiedFiles, failedFiles } = await copyFilesIntoWorkspace(file_paths, target.fullPath);
          if (copiedFiles.length > 0) messageApi.success(t('common.fileAttach.uploadSuccess') || 'Pasted');
          if (failedFiles.length > 0) messageApi.warning('Some files failed to copy');
        } catch {
          messageApi.error(t('common.unknownError') || 'Paste failed');
        } finally {
          setPasteTargetFolder(null);
        }
        return;
      }

      setPasteConfirm({
        visible: true,
        file_name: filesMeta[0].name,
        filesToPaste: filesMeta.map((f) => ({ path: f.path, name: f.name })),
        doNotAsk: false,
        targetFolder: target.relativePath,
      });
    },
    [copyFilesIntoWorkspace, messageApi, setPasteConfirm, store, t, workspace]
  );

  const handlePasteConfirm = useCallback(async () => {
    if (!pasteConfirm.filesToPaste || pasteConfirm.filesToPaste.length === 0) return;
    try {
      if (pasteConfirm.doNotAsk) await configService.set('workspace.pasteConfirm', true);
      const target = getTargetFolderPath(
        selectedNodeRef.current,
        store.getState().selected,
        store.getState().files,
        workspace
      );
      const file_paths = pasteConfirm.filesToPaste.map((f) => f.path);
      const { copiedFiles, failedFiles } = await copyFilesIntoWorkspace(file_paths, target.fullPath);
      if (copiedFiles.length > 0) messageApi.success(t('common.fileAttach.uploadSuccess') || 'Pasted');
      if (failedFiles.length > 0) messageApi.warning('Some files failed to copy');
      closePasteConfirm();
    } catch {
      messageApi.error(t('common.unknownError') || 'Paste failed');
    } finally {
      setPasteTargetFolder(null);
    }
  }, [closePasteConfirm, copyFilesIntoWorkspace, messageApi, pasteConfirm, store, t, workspace]);

  // Global paste service (Cmd+V) — captured when this panel has focus.
  const { onFocus: onFocusPaste } = usePasteService({
    supportedExts: [],
    onFilesAdded: (incoming) => {
      const meta = incoming.map((f) => ({ name: f.name, path: f.path }));
      void handleFilesToAdd(meta);
    },
    conversation_id: conversationId,
    source: 'workspace',
  });

  return {
    // State (subscribed slices)
    files,
    loading,
    treeKey,
    expandedKeys,
    selected,

    // Refs (synchronous access for event handlers / arco Tree)
    filesRef,
    selectedKeysRef,
    selectedNodeRef,

    // Actions
    setExpandedKeys,
    setSelected,
    ensureNodeSelected,
    clearSelection,
    refreshWorkspace,
    loadWorkspace,

    // Watcher actions (expand/collapse subscription sync)
    onDirsExpand,
    onDirsCollapse,

    // File operations
    handleOpenNode,
    handleRevealNode,
    handleDeleteNode,
    handleDeleteConfirm,
    handleRenameConfirm,
    handleAddToChat,
    handlePreviewFile,
    openRenameModal,
    handleDownloadFile,

    // Paste / upload
    copyFilesIntoWorkspace,
    handleSelectHostFiles,
    handleUploadDeviceFiles,
    pasteTargetFolder,
    handleFilesToAdd,
    handlePasteConfirm,
    onFocusPaste,

    // Internal store access (rare — used only when external code needs direct mutation)
    store,
  };
}
