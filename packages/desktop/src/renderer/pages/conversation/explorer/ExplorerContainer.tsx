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
 * Scope (stage-3 C): data wiring + tree + attach/remove. Search, file context
 * menu (new/delete/rename), and the Files/Changes tabs are out of this round.
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

import { emitter } from '@/renderer/utils/emitter';
import { projectFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

import { ExplorerPanel } from './ExplorerPanel';
import { buildRemoveRequest, buildRenameRequest, parentRel, peKey, type RenameRequest } from './explorerModel';
import { initExplorerRuntime } from './monitorTransport';
import { toRootRefs } from './projectRoots';
import { select } from './explorerStore';
import { useCurrentConversation } from './currentConversationStore';

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
  // project preview isolation is handled by the scope key (C5); switching files
  // replaces the active tab.
  const handleOpenFile = async (peId: string, relativePath: string): Promise<void> => {
    const name = relativePath.split('/').pop() || relativePath;
    const contentType = getContentTypeByExtension(name);
    try {
      let content = '';
      const skipRead =
        contentType === 'pdf' || contentType === 'word' || contentType === 'excel' || contentType === 'ppt';
      if (!skipRead) {
        const client = initExplorerRuntime();
        const encoding = contentType === 'image' ? 'base64' : 'utf-8';
        const res = (await client.request('fs/read', {
          file: { pe_id: peId, relative_path: relativePath },
          encoding,
        })) as {
          content?: string;
        };
        content = res.content ?? '';
      }
      openPreview(
        content,
        contentType,
        {
          title: name,
          file_name: name,
          language: name.split('.').pop() || '',
          editable: contentType === 'markdown' || contentType === 'image' ? false : undefined,
        },
        { replace: true }
      );
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
  const workspacePeId = data?.explorer.workspace_pe_id;
  // Absolute path of the workspace root (derived display_path) for the
  // open-externally button. No search box: file search (with chat-ref) is a
  // separate lane, not the explorer.
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
      <div
        className='flex-1 min-h-0 overflow-auto pl-16px'
        style={activeTab === 'files' ? undefined : { display: 'none' }}
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
          onImportFiles={handleImportFiles}
        />
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
