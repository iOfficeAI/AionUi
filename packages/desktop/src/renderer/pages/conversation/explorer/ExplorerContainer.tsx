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

import { Button, Input, Message, Modal, Spin, Tooltip } from '@arco-design/web-react';
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
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { classifyPreviewError, previewErrorToI18nKey } from '@/renderer/utils/previewError';
// PATCH(ELECTRON-3SZ): used only by the preview payload patch below — remove with it.
import type { PreviewContentType } from '@/common/types/office/preview';

import { copyText } from '@/renderer/utils/ui/clipboard';
import { emitter } from '@/renderer/utils/emitter';
import { projectFileRef } from '@/common/types/chatFile';
import type { ChatFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import { resolvePreviewPayload } from '@/renderer/utils/file/previewPayload';

import { ExplorerPanel } from './ExplorerPanel';
import { buildRemoveRequest, buildRenameRequest, parentRel, peKey, type RenameRequest } from './explorerModel';
import { initExplorerRuntime } from './monitorTransport';
import { toRootRefs } from './projectRoots';
import { reveal, select } from './explorerStore';
import { useCurrentConversation } from './currentConversationStore';
import { SearchPanel } from './search/SearchPanel';
import type { SearchHit } from './search/searchModel';
import { ScmPanel } from '../SourceControl/ScmPanel';

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

/** Args passed to `openPreview` for an Explorer-opened file. */
export type ExplorerPreviewPayload = {
  content: string;
  contentType: PreviewContentType;
  metadata: {
    title: string;
    file_name: string;
    // Project ChatFileRef identity — the sole identity for an explorer-opened
    // file. Preview I/O addresses it by pe id + relative path (content over
    // /api/fs/content, pdf over /api/fs/stream, office via officecli resolve),
    // so the renderer never sees an absolute path.
    fileRef: ChatFileRef;
    language: string;
    editable?: boolean;
    oversized?: boolean;
    sizeBytes?: number;
    thresholdBytes?: number;
    lastModified?: number;
  };
};

// The Explorer tree knows `{pe_id, relative_path}`, mapped straight to a Project
// ChatFileRef. Reading goes through the shared `resolvePreviewPayload` gate, so
// this entry point applies the same size ceiling and picks up the same
// save-conflict timestamp as every other way of opening a file. No absolute path
// is ever exposed — the old WS path-resolve patch is gone.
export const buildExplorerPreviewPayload = async (
  peId: string,
  relativePath: string
): Promise<ExplorerPreviewPayload> => {
  const name = relativePath.split('/').pop() || relativePath;
  const { contentType, editable } = getFileTypeInfo(name);
  const fileRef = projectFileRef(peId, relativePath);

  const payload = await resolvePreviewPayload(fileRef, contentType);

  return {
    content: payload.content,
    contentType,
    metadata: {
      title: name,
      file_name: name,
      fileRef,
      language: name.split('.').pop() || '',
      // Taken from the type table, then tightened — never decided here.
      //
      // This entry point used to compute editability itself, which made it a second
      // source for one fact. It happened to agree with the table on everything that
      // mattered, and "happened to agree" is the whole problem: nothing kept the two in
      // step, and the day they diverged the symptom would be one file behaving
      // differently depending on whether it was opened from the tree or from a message.
      // It also produced a wrong answer that something else then reasoned from —
      // markdown was marked read-only here, and persistence nearly took that to mean
      // its content could not have been edited.
      //
      // `oversized` still has to be applied on top, because it is a fact about this
      // read rather than about the type: the file was never fully loaded, so letting a
      // fragment reach a saveable editor is what destroyed files before. Tightening is
      // the only direction available here, so this can restrict what the table allows
      // and can never contradict it.
      editable: payload.oversized ? false : editable,
      oversized: payload.oversized,
      sizeBytes: payload.sizeBytes,
      thresholdBytes: payload.thresholdBytes,
      lastModified: payload.lastModified,
    },
  };
};

export const ExplorerContainer: React.FC<ExplorerContainerProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const activeConversationId = useCurrentConversation();
  const { data, isLoading, mutate } = useSWR(projectId ? `explorer-project/${projectId}` : null, (key: string) => {
    // Derive the project id from the SWR key, not the captured `projectId`
    // closure, so a fetch's result can never be filed under a different key.
    const id = key.slice('explorer-project/'.length);
    return ipcBridge.project.get.invoke({ project_id: id });
  });
  // Apply-time guard: only feed the store roots whose detail actually belongs to
  // the current project. Combined with the per-project remount (this component is
  // keyed by `projectId` in ProjectPanelHost), a stale/other-project detail can
  // never reach the tree — a mismatch yields no roots rather than another
  // project's (宁空勿画错).
  const detail = data && data.project_id === projectId ? data : undefined;

  // Let the workspace-collapse hook (keyed per-project via workspacePreferenceKey)
  // read + restore this project's panel open/closed preference. The hook starts
  // collapsed and expands on this signal (pref takes priority); without it the
  // panel would stay collapsed on every conversation switch.
  useEffect(() => {
    if (!projectId || !detail) return;
    dispatchWorkspaceHasFilesEvent(detail.explorer.entries.length > 0, undefined, false);
  }, [projectId, detail]);

  // Open a file in the preview panel. The tree only knows `{pe_id, relative_path}`,
  // mapped to a Project ChatFileRef — content is read over `/api/fs/content` (text/
  // image) and pdf/office render from the ref, so no absolute path is resolved.
  // Per-project preview isolation is handled by the scope key (C5); opening a file
  // appends a new tab (dedup keeps an already-open file focused) so multiple files
  // can stay open at once.
  const handleOpenFile = async (peId: string, relativePath: string): Promise<void> => {
    try {
      const { content, contentType, metadata } = await buildExplorerPreviewPayload(peId, relativePath);
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
  // 'files' = the Explorer, 'changes' = the Source Control panel. Switching tabs
  // unmounts the inactive one for `changes`, which is safe because the SCM
  // subscription is owned by its store per project, not by the component's mount
  // (see ScmPanel's lifecycle note) — a tab switch never drops the backend watch.
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
    // Optimistic success: the emitter is fire-and-forget with no landing ack, so
    // this reports "dispatched", not "rendered a chip". It is accurate whenever a
    // send box for this conversation is mounted (the type-matching box consumes
    // the event synchronously). The chip-drop bugs that made this toast lie for a
    // folder / pe-root ref (empty-path identity + the folder render filter) are
    // fixed in SendBox; a genuine no-op only remains in the edge case where no
    // send box is mounted for the active conversation.
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

  // Copy the node's path relative to its owning pe root — the tree's native
  // identity (`relative_path`, always `/`-separated, cross-platform). A pe-root
  // node's relative_path is '' (it IS the root); copy '.' (its own literal
  // relative path) rather than the display `name`, which may be a custom label or
  // even the internal pe_id — never a real path. Pure clipboard (no OS shell / no
  // absolute path), so it works for files and folders on both Electron and WebUI.
  const handleCopyRelativePath = (_peId: string, rel: string): void => {
    void copyText(rel === '' ? '.' : rel)
      .then(() => Message.success(t('conversation.explorer.pathCopied')))
      .catch(() => Message.error(t('conversation.explorer.copyFailed')));
  };

  // Copy the node's ABSOLUTE device path. The front end never holds it (project
  // refs are pe_id + relative_path only) and never receives it: the backend
  // resolves the path AND writes the clipboard itself (mirrors reveal), returning
  // void — we only toast on success/failure. Desktop-only: the menu item is
  // Electron-gated in ExplorerPanel, so this handler only runs there (a remote
  // WebUI must not surface it). A pe-root node (rel '') resolves to the root
  // folder's own absolute path server-side.
  const handleCopyAbsolutePath = (peId: string, rel: string): void => {
    void ipcBridge.fs.copyAbsolutePath
      .invoke({ pe_id: peId, relative_path: rel })
      .then(() => Message.success(t('conversation.explorer.pathCopied')))
      .catch(() => Message.error(t('conversation.explorer.copyFailed')));
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
  // Spin only while the CURRENT project's detail is still loading. A stale value
  // for a different project (detail undefined) falls through to empty roots, not
  // another project's tree.
  if (!detail && isLoading) return <Spin loading />;

  const roots = detail ? toRootRefs(detail) : [];
  // Search roots = the project's pe roots (each folder root, rel=''). fs/search
  // spans all bound folders; the front-end ranks the merged hit stream.
  const searchRoots = roots.map((root) => ({ pe_id: root.pe_id, relative_path: '' }));
  // pe_id → folder name for the search result's `PE · REL` secondary label.
  const searchPeNames = Object.fromEntries(roots.map((root) => [root.pe_id, root.title]));
  const workspacePeId = detail?.explorer.workspace_pe_id;
  // Absolute path of the workspace root (derived display_path) for the
  // open-externally button.
  const workspacePath = detail?.explorer.entries.find((e) => e.pe_id === workspacePeId)?.display_path;

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
      {/* Host component-switcher tab bar: 文件 = explorer, 变更 = source control.
          Tabs are left-aligned and scroll horizontally when they overflow; the
          attach + open-externally cluster is pinned right (flex-shrink-0) with
          container padding, so it never scrolls with the tabs nor clips at narrow
          widths.

          左内边距 12px 是本面板的对齐基准线，三处必须一致（见下方 SearchPanel 与
          arco-override.css 的 .workspace-tree 规则）：外框一律从 12px 起，框内内容
          （tab 文字 / 搜索图标 / 树箭头）一律从 20px 起。12px 不是随手取的——侧栏
          的拖宽把手正好盖住最左 12px 且层级更高，任何落在其左侧的东西都点不到。

          The 12px left padding is this panel's alignment baseline and must match in
          all three places (see SearchPanel below and the .workspace-tree rules in
          arco-override.css): outer boxes start at 12px, their inner content (tab
          text / search icon / tree arrow) starts at 20px. 12px is not arbitrary —
          the sider's resize handle covers the leftmost 12px and sits above this
          content, so anything placed to its left cannot be clicked. */}
      <div className='flex items-center gap-4px ps-12px pe-8px py-4px flex-shrink-0 border-b border-[var(--bg-3)]'>
        <div className='flex items-center gap-2px overflow-x-auto flex-1 min-w-0'>
          {tabButton('files', t('conversation.explorer.tabs.files'))}
          {tabButton('changes', t('conversation.explorer.tabs.changes'))}
        </div>
        <div className='flex items-center gap-2px flex-shrink-0'>
          {/* Tooltip 与右侧「打开工作区」按钮保持同一形态（mini），让相邻按钮的
              悬浮提示观感一致。注意：Arco 的 Tooltip 不能包裹 Dropdown（会取到
              非 DOM 节点而崩），这里包的是普通 Button，安全。
              Same `mini` Tooltip as the neighboring workspace-open button so
              adjacent buttons feel consistent. Note: an Arco Tooltip must not wrap
              a Dropdown (it would resolve a non-DOM node and crash); wrapping a
              plain Button like this is safe. */}
          <Tooltip content={t('conversation.explorer.addFolder')} mini>
            <Button
              type='text'
              size='small'
              className='flex items-center justify-center'
              icon={<FolderPlus theme='outline' size='16' />}
              aria-label={t('conversation.explorer.addFolder')}
              onClick={handleAddFolder}
            />
          </Tooltip>
          {workspacePath && <WorkspaceOpenButton workspacePath={workspacePath} isTemporary={false} />}
        </div>
      </div>
      {/* Files tab (explorer): kept mounted across tab switches so the tree + WS
          state survive (only hidden when the changes tab is active). */}
      {/* Search area is persistent at the top of the files tab; the tree renders
          underneath (children slot) and stays mounted while searching so its WS
          subscriptions never thrash. SearchPanel owns the scroll region, so this
          container no longer sets overflow.

          没有左内边距是刻意的：搜索框和文件树各自对齐到 12px 基准线（前者靠自身
          padding，后者靠 arco-override.css 里的 .workspace-tree 规则），在这里再加
          一层会把两者一起推离基准线。
          Deliberately no left padding: the search box and the tree each align to
          the 12px baseline on their own (the former via its own padding, the latter
          via the .workspace-tree rules in arco-override.css). Adding a layer here
          would push both off that baseline. */}
      <div className='flex-1 min-h-0' style={activeTab === 'files' ? undefined : { display: 'none' }}>
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
            onCopyRelativePath={handleCopyRelativePath}
            onCopyAbsolutePath={handleCopyAbsolutePath}
            onImportFiles={handleImportFiles}
          />
        </SearchPanel>
      </div>
      {activeTab === 'changes' && (
        <div className='flex-1 min-h-0'>
          <ScmPanel projectId={projectId} />
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
