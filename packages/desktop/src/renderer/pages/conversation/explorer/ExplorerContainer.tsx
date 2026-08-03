/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Project-level Explorer container — the mount seam for the Project-scoped
 * Explorer. Given a `projectId`, it fetches the project's pe roots from the HTTP
 * control plane (`GET /api/projects/{id}`), maps them to `RootRef[]`, and hands
 * them to {@link ExplorerPanel} (which drives the WS store). It also owns the
 * project-level actions: add folder (attach) and remove folder.
 *
 * Scope: data wiring + tree + attach/remove + the Files/Changes tabs, plus the
 * persistent filename-search area at the top of the Files tab (fs/search →
 * reveal / explicit add-to-chat; see {@link SearchPanel}).
 */

import { Button, Input, Message, Modal, Spin } from '@arco-design/web-react';
import { FolderPlus } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { dispatchWorkspaceHasFilesEvent } from '@/renderer/utils/workspace/workspaceEvents';

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { PROJECT_ERROR_DUPLICATE, PROJECT_ERROR_OVERLAP } from '@/common/types/project';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import WorkspaceOpenButton from '@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton';
import { getContentTypeByExtension } from '@/renderer/pages/conversation/Preview/fileUtils';
import { classifyPreviewError, previewErrorToI18nKey } from '@/renderer/utils/previewError';
// PATCH(ELECTRON-3SZ): used only by the preview payload patch below — remove with it.
import type { PreviewContentType } from '@/common/types/office/preview';

import { emitter } from '@/renderer/utils/emitter';
import { projectFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

import { ExplorerPanel } from './ExplorerPanel';
import { buildRemoveRequest, buildRenameRequest, parentRel, peKey, type RenameRequest } from './explorerModel';
import { initExplorerRuntime } from './monitorTransport';
import { toRootRefs } from './projectRoots';
import { reveal, select } from './explorerStore';
import { useCurrentConversation } from './currentConversationStore';
import { SearchPanel } from './search/SearchPanel';
import type { SearchHit } from './search/searchModel';

export type ExplorerContainerProps = {
  /** Owning project id — scopes the store's fact cache + localStorage UI state. */
  projectId: string;
};

/** A local absolute path → `file://` URI (normalize `\`, ensure leading slash, encode). */
const pathToFileUri = (p: string): string => {
  const normalized = p.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLeadingSlash)}`;
};

// PATCH(ELECTRON-3SZ): image file extension → data-URL MIME. The WS `fs/read`
// base64 payload is bare (no `data:` prefix), but ImageViewer feeds `content`
// straight into <img src>, so the Explorer open path must wrap it. Remove with
// the rest of this patch once Preview consumes {pe_id, relative_path} directly.
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif',
};

/** PATCH(ELECTRON-3SZ): wrap a bare base64 image body into a renderable data URL. */
const imageDataUrl = (fileName: string, base64: string): string => {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  const mime = IMAGE_MIME_BY_EXT[ext] ?? 'image/png';
  return `data:${mime};base64,${base64}`;
};

/** PATCH(ELECTRON-3SZ): minimal WS-RPC surface the preview payload builder needs. Remove with it. */
type PreviewRpcClient = { request(method: string, params?: unknown): Promise<unknown> };

/** PATCH(ELECTRON-3SZ): args passed to `openPreview` for an Explorer-opened file. Remove with it. */
export type ExplorerPreviewPayload = {
  content: string;
  contentType: PreviewContentType;
  metadata: {
    title: string;
    file_name: string;
    file_path?: string;
    workspace?: string;
    language: string;
    editable?: boolean;
  };
};

// PATCH(ELECTRON-3SZ): the Explorer tree only knows `{pe_id, relative_path}`, but
// three viewer families can't render from the WS `fs/read` content alone, so this
// builder special-cases them:
//   - image: fs/read base64 is bare (no `data:` prefix); ImageViewer feeds
//     `content` straight into <img src>, so wrap it into a data URL.
//   - pdf/office: need a real local absolute path (PDF via file://, office via
//     `officecli watch`), so resolve pe → absolute path with `fs/resolve`.
// Exposing the absolute path to the renderer breaks the "front-end never sees
// absolute paths" boundary — this whole helper is an emergency patch and MUST be
// removed once Preview consumes `{pe_id, relative_path}` end-to-end.
export const buildExplorerPreviewPayload = async (
  client: PreviewRpcClient,
  peId: string,
  relativePath: string
): Promise<ExplorerPreviewPayload> => {
  const name = relativePath.split('/').pop() || relativePath;
  const contentType = getContentTypeByExtension(name);
  const file = { pe_id: peId, relative_path: relativePath };

  let content = '';
  let file_path: string | undefined;
  let workspace: string | undefined;

  if (contentType === 'image') {
    const res = (await client.request('fs/read', { file, encoding: 'base64' })) as { content?: string };
    const base64 = res.content ?? '';
    content = base64 ? imageDataUrl(name, base64) : '';
  } else if (contentType === 'pdf' || contentType === 'word' || contentType === 'excel' || contentType === 'ppt') {
    const res = (await client.request('fs/resolve', { file })) as {
      absolute_path?: string;
      workspace_root?: string;
    };
    file_path = res.absolute_path;
    workspace = res.workspace_root;
  } else {
    const res = (await client.request('fs/read', { file, encoding: 'utf-8' })) as { content?: string };
    content = res.content ?? '';
  }

  return {
    content,
    contentType,
    metadata: {
      title: name,
      file_name: name,
      file_path,
      workspace,
      language: name.split('.').pop() || '',
      editable: contentType === 'markdown' || contentType === 'image' ? false : undefined,
    },
  };
};

export const ExplorerContainer: React.FC<ExplorerContainerProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const activeConversationId = useCurrentConversation();
  const { data, isLoading, mutate } = useSWR(projectId ? `explorer-project/${projectId}` : null, () =>
    ipcBridge.project.get.invoke({ project_id: projectId })
  );

  // Let the workspace-collapse hook (keyed per-project via workspacePreferenceKey)
  // read + restore this project's panel open/closed preference. The hook starts
  // collapsed and expands on this signal (pref takes priority); without it the
  // panel would stay collapsed on every conversation switch.
  useEffect(() => {
    if (!projectId || !data) return;
    dispatchWorkspaceHasFilesEvent(data.explorer.entries.length > 0, undefined, false);
  }, [projectId, data]);

  // Open a file in the preview panel. The tree only knows `{pe_id, relative_path}`,
  // so content is read over the WS `fs/read` command (not an absolute path). Per-
  // project preview isolation is handled by the scope key (C5); opening a file
  // appends a new tab (dedup keeps an already-open file focused) so multiple
  // files can stay open at once.
  const handleOpenFile = async (peId: string, relativePath: string): Promise<void> => {
    try {
      // PATCH(ELECTRON-3SZ): payload building (incl. absolute-path resolve) lives
      // in `buildExplorerPreviewPayload` — remove with the rest of that patch.
      const { content, contentType, metadata } = await buildExplorerPreviewPayload(
        initExplorerRuntime(),
        peId,
        relativePath
      );
      openPreview(content, contentType, metadata);
    } catch (e) {
      Message.error(t(previewErrorToI18nKey(classifyPreviewError(e))));
    }
  };

  const handleAddFolder = async (): Promise<void> => {
    const paths = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory', 'createDirectory'] });
    const path = paths?.[0];
    if (!path) return; // cancelled
    try {
      const entry = await ipcBridge.project.attachFolder.invoke({ project_id: projectId, uri: pathToFileUri(path) });
      await mutate();
      // Focus the attached (or, for a subdir, the existing focused) root.
      select(peKey(entry.pe_id, ''));
    } catch (e) {
      if (isBackendHttpError(e) && e.code === PROJECT_ERROR_DUPLICATE) {
        Message.info(t('conversation.explorer.attachDuplicate'));
      } else if (isBackendHttpError(e) && e.code === PROJECT_ERROR_OVERLAP) {
        Message.warning(t('conversation.explorer.attachOverlap'));
      } else {
        Message.error(t('conversation.explorer.attachFailed'));
      }
    }
  };

  const handleRemoveFolder = async (peId: string): Promise<void> => {
    try {
      await ipcBridge.project.removeFolder.invoke({ project_id: projectId, pe_id: peId });
      await mutate();
    } catch {
      Message.error(t('conversation.explorer.removeFailed'));
    }
  };

  // ── File operations (A): rename + delete (parity with the legacy tree) ────
  // Both operate on the tree's `{pe_id, relative_path}` identity over WS fs/*
  // commands; the change is pushed back as a delta on the parent dir's
  // subscription, so the tree updates itself (single source, no manual refetch).
  // Component switcher tab (host component switcher, this round in-container):
  // 'files' = the Explorer, 'changes' = source-control placeholder (that lane is
  // not built yet — the tab exists but shows an empty state).
  const [activeTab, setActiveTab] = useState<'files' | 'changes'>('files');
  const [renameDialog, setRenameDialog] = useState<RenameRequest | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [nameSubmitting, setNameSubmitting] = useState(false);

  const handleRename = (peId: string, rel: string, name: string): void => {
    setRenameDialog({ peId, targetDir: parentRel(rel), origRel: rel });
    setNameValue(name);
  };

  const submitRenameDialog = async (): Promise<void> => {
    if (!renameDialog) return;
    const request = buildRenameRequest(renameDialog, nameValue);
    if (!request) {
      setRenameDialog(null); // empty name or no-op rename
      return;
    }
    setNameSubmitting(true);
    try {
      await initExplorerRuntime().request(request.method, request.params);
      setRenameDialog(null);
    } catch {
      Message.error(t('conversation.explorer.renameFailed'));
    } finally {
      setNameSubmitting(false);
    }
  };

  const handleDelete = (peId: string, rel: string, name: string): void => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('conversation.explorer.deleteConfirm', { name }),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const request = buildRemoveRequest(peId, rel);
        try {
          await initExplorerRuntime().request(request.method, request.params);
        } catch {
          Message.error(t('common.deleteFailed'));
        }
      },
    });
  };

  // Add a tree node to the active conversation's send box as a project file ref.
  // The item carries a `chatRef` so a send collects it as a project ref (backend
  // resolves pe → absolute path). We emit on all agent prefixes carrying the
  // active conversation id; each send box accepts only when the id matches its
  // own conversation (ids are unique), so on the multi-column team route only the
  // focused member's box receives it — no leak to same-type peers.
  const handleAddToChat = (peId: string, rel: string, name: string, isFile: boolean): void => {
    if (!activeConversationId) return;
    const item: FileOrFolderItem = { path: rel, name, isFile, chatRef: projectFileRef(peId, rel) };
    const payload: FileOrFolderItem[] = [item];
    emitter.emit('acp.selected.file.append', payload, activeConversationId);
    emitter.emit('codex.selected.file.append', payload, activeConversationId);
    emitter.emit('aionrs.selected.file.append', payload, activeConversationId);
    Message.success(t('conversation.explorer.addedToChat', { name }));
  };

  // Reveal a node in the OS file manager. The backend resolves the pe-ref to an
  // absolute path and calls shell.showItemInFolder — the front end never builds
  // the absolute path (avoids the Windows verbatim `\\?\` pitfall). The menu item
  // itself is Electron-gated in ExplorerPanel; on failure surface a friendly toast.
  const handleRevealInFolder = (peId: string, rel: string): void => {
    void ipcBridge.fs.reveal.invoke({ pe_id: peId, relative_path: rel }).catch(() => {
      Message.error(t('conversation.workspace.contextMenu.revealFailed'));
    });
  };

  // Search result default action: locate the hit in the tree — switch to the
  // files tab, expand its ancestor chain (reveal subscribes the parent dir), and
  // select it. Reuses the store's existing reveal path; does NOT open preview
  // (product decision Y — the click is "find the file", not "preview it").
  const handleRevealHit = (hit: SearchHit): void => {
    setActiveTab('files');
    reveal({ pe_id: hit.pe_id, relative_path: parentRel(hit.relative_path) });
    select(peKey(hit.pe_id, hit.relative_path));
  };

  // Search result explicit add-to-chat: a hit is always a file; route through the
  // same emitter lane as the tree's context-menu action.
  const handleAddHit = (hit: SearchHit): void => handleAddToChat(hit.pe_id, hit.relative_path, hit.name, true);

  // A-paste: import OS files dropped onto a tree node into that node's dir via
  // the pe-targeted /api/fs/copy. The copied files arrive on the target dir's WS
  // subscription (delta → tree updates itself); conflicts/rejected dirs come back
  // in `failed_files` and are surfaced, never silently dropped.
  const handleImportFiles = async (peId: string, rel: string, filePaths: string[]): Promise<void> => {
    try {
      const res = await ipcBridge.fs.copyFilesToProject.invoke({
        file_paths: filePaths,
        target: { pe_id: peId, relative_path: rel },
      });
      const copied = res.copied_files.length;
      const failed = res.failed_files.length;
      // Nothing imported (all failed) is a failure, not a partial success →
      // error. Some copied + some failed → warn. All copied → success.
      if (copied === 0 && failed > 0) {
        Message.error(t('conversation.explorer.importFailed'));
      } else if (failed > 0) {
        Message.warning(t('conversation.explorer.importPartialFailed', { failed, copied }));
      } else if (copied > 0) {
        Message.success(t('conversation.explorer.imported', { count: copied }));
      }
    } catch {
      Message.error(t('conversation.explorer.importFailed'));
    }
  };

  if (!projectId) return null;
  if (isLoading && !data) return <Spin loading />;

  const roots = data ? toRootRefs(data) : [];
  // Search roots = the project's pe roots (each folder root, rel=''). fs/search
  // spans all bound folders; the front-end ranks the merged hit stream.
  const searchRoots = roots.map((root) => ({ pe_id: root.pe_id, relative_path: '' }));
  // pe_id → folder name for the search result's `PE · REL` secondary label.
  const searchPeNames = Object.fromEntries(roots.map((root) => [root.pe_id, root.title]));
  const workspacePeId = data?.explorer.workspace_pe_id;
  // Absolute path of the workspace root (derived display_path) for the
  // open-externally button.
  const workspacePath = data?.explorer.entries.find((e) => e.pe_id === workspacePeId)?.display_path;

  const tabButton = (key: 'files' | 'changes', label: string) => (
    <Button
      type='text'
      size='small'
      className={`flex-shrink-0 !px-8px ${activeTab === key ? '!text-t-primary !font-medium !bg-2' : '!text-t-secondary'}`}
      onClick={() => setActiveTab(key)}
    >
      {label}
    </Button>
  );

  return (
    <div className='h-full flex flex-col min-h-0'>
      {/* Host component-switcher tab bar: 文件 = explorer, 变更 = source-control
          placeholder (that lane isn't built — tab present, empty state only).
          Tabs are left-aligned and scroll horizontally when they overflow; the
          attach + open-externally cluster is pinned right (flex-shrink-0) with
          container padding, so it never scrolls with the tabs nor clips at narrow
          widths. */}
      <div className='flex items-center gap-4px px-8px py-4px flex-shrink-0 border-b border-[var(--bg-3)]'>
        <div className='flex items-center gap-2px overflow-x-auto flex-1 min-w-0'>
          {tabButton('files', t('conversation.explorer.tabs.files'))}
          {tabButton('changes', t('conversation.explorer.tabs.changes'))}
        </div>
        <div className='flex items-center gap-2px flex-shrink-0'>
          <Button
            type='text'
            size='mini'
            icon={<FolderPlus theme='outline' size='16' />}
            aria-label={t('conversation.explorer.addFolder')}
            title={t('conversation.explorer.addFolder')}
            onClick={handleAddFolder}
          />
          {workspacePath && <WorkspaceOpenButton workspacePath={workspacePath} isTemporary={false} />}
        </div>
      </div>
      {/* Files tab (explorer): kept mounted across tab switches so the tree + WS
          state survive (only hidden when the changes tab is active). Left padding
          clears the sider's col-resize drag handle overlay. */}
      {/* Search area is persistent at the top of the files tab; the tree renders
          underneath (children slot) and stays mounted while searching so its WS
          subscriptions never thrash. SearchPanel owns the scroll region, so this
          container no longer sets overflow. */}
      <div className='flex-1 min-h-0 pl-16px' style={activeTab === 'files' ? undefined : { display: 'none' }}>
        <SearchPanel
          roots={searchRoots}
          peNames={searchPeNames}
          onRevealHit={handleRevealHit}
          onAddHit={activeConversationId ? handleAddHit : undefined}
        >
          <ExplorerPanel
            projectId={projectId}
            roots={roots}
            workspacePeId={workspacePeId}
            onRemoveRoot={handleRemoveFolder}
            onOpenFile={handleOpenFile}
            onRename={handleRename}
            onDelete={handleDelete}
            onAddToChat={activeConversationId ? handleAddToChat : undefined}
            onRevealInFolder={handleRevealInFolder}
            onImportFiles={handleImportFiles}
          />
        </SearchPanel>
      </div>
      {activeTab === 'changes' && (
        <div className='flex-1 min-h-0 flex items-center justify-center px-16px text-center text-t-secondary text-13px'>
          {t('conversation.explorer.changesPlaceholder')}
        </div>
      )}
      <Modal
        title={t('conversation.explorer.contextMenu.rename')}
        visible={renameDialog !== null}
        onCancel={() => setRenameDialog(null)}
        onOk={submitRenameDialog}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={nameSubmitting}
        autoFocus
        focusLock
      >
        <Input
          autoFocus
          value={nameValue}
          onChange={setNameValue}
          onPressEnter={submitRenameDialog}
          placeholder={t('conversation.explorer.namePlaceholder')}
        />
      </Modal>
    </div>
  );
};
