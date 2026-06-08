/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { extractAgentEditedPaths } from '@/common/chat/normalizeToolCall';
import type { TMessage } from '@/common/chat/chatLib';
import type { GitFileChange } from '@/common/types/git/gitTypes';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useEditorContext } from '@/renderer/pages/conversation/Editor';
import { getWorkspaceDisplayName as getDisplayName } from '@/renderer/utils/workspace/workspace';
import { Empty, Message, Tree } from '@arco-design/web-react';
import { Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ApprovalsList from './components/ApprovalsList';
import GitChangeList from './components/GitChangeList';
import PasteConfirmModal from './components/PasteConfirmModal';
import TodoList from './components/TodoList';
import WorkspaceContextMenu from './components/WorkspaceContextMenu';
import WorkspaceDialogs from './components/WorkspaceDialogs';
import { WorkspaceFileIcon } from './components/WorkspaceFileIcon';
import WorkspaceTabBar from './components/WorkspaceTabBar';
import FilesTreeToolbar from './components/FilesTreeToolbar';
import { WorkspaceTreeAddToChatButton } from './components/WorkspaceTreeAddToChatButton';
import WorkspaceToolbar from './components/WorkspaceToolbar';
import { useGitChanges } from './hooks/useGitChanges';
import { useWorkspaceCollapse } from './hooks/useWorkspaceCollapse';
import { useWorkspaceDragImport } from './hooks/useWorkspaceDragImport';
import { useWorkspaceEvents } from './hooks/useWorkspaceEvents';
import { useWorkspaceFileOps } from './hooks/useWorkspaceFileOps';
import { useWorkspaceModals } from './hooks/useWorkspaceModals';
import { useWorkspacePaste } from './hooks/useWorkspacePaste';
import { useAbortUploadsOnConversationChange } from '@/renderer/hooks/file/useAbortUploadsOnConversationChange';
import { useWorkspaceSearch } from './hooks/useWorkspaceSearch';
import { useWorkspaceApprovals } from './hooks/useWorkspaceApprovals';
import { useWorkspaceTodos } from './hooks/useWorkspaceTodos';
import { useWorkspaceTree } from './hooks/useWorkspaceTree';
import { useEditorRevealInTree } from './hooks/useEditorRevealInTree';
import type { WorkspaceProps, WorkspaceTab } from './types';
import {
  WORKSPACE_OPEN_REMOTE_CHANGES_EVENT,
  type WorkspaceOpenRemoteChangesDetail,
} from '@/renderer/utils/workspace/workspaceEvents';
import {
  computeContextMenuPosition,
  extractNodeData,
  extractNodeKey,
  flattenSingleRoot,
  getTargetFolderPath,
} from './utils/treeHelpers';
import siderWorkspaceStyles from '@/renderer/components/layout/Sider/SiderWorkspacePanel.module.css';
import './workspace.css';

const ChatWorkspace: React.FC<WorkspaceProps> = ({
  conversation_id,
  workspace,
  isTemporaryWorkspace: isTemporaryWorkspaceProp,
  eventPrefix = 'acp',
  messageApi: externalMessageApi,
  panelMode = 'full',
  onChangesMeta,
  onExpandFlyout,
  onExpandFilesFlyout,
  siderFilesChrome,
  onSiderFilesRefreshReady,
  siderDiffChrome,
  onSiderDiffRefreshReady,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { openEditorFile } = useEditorContext();

  // Message API setup
  const [internalMessageApi, messageContext] = Message.useMessage();
  const messageApi = externalMessageApi ?? internalMessageApi;
  const shouldRenderLocalMessageContext = !externalMessageApi;

  // Tab state and file changes
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('files');
  const isFullMode = panelMode === 'full';
  const isFilesMode = panelMode === 'files';
  const isChangesMode = panelMode === 'changes';
  const showChangesTab = panelMode !== 'files';

  // For 'files' mode (top Sider pane) we disable the local git hooks to avoid
  // double-mounting useGitChanges (which calls ipcBridge.git.unwatch on unmount)
  // when SiderDiffSection mounts a 'changes' instance below. 'changes' mode
  // enables them (dedicated diff pane). 'full' enables for legacy tab behavior.
  const gitChangesHook = useGitChanges(workspace, !isFilesMode);
  const todosHook = useWorkspaceTodos(conversation_id);
  const approvalsHook = useWorkspaceApprovals(conversation_id);

  const changesCount = gitChangesHook.changeCount;

  // ── Agent-edited paths: scan the current conversation's persisted messages
  // for acp_tool_call (kind edit/write) and tool_group (confirmationDetails
  // type edit) entries. Re-fetched on conversation change AND whenever the
  // git status refreshes — that's how the spec wires "after agent edits land
  // → new git status → re-extract" without subscribing to the response stream.
  // statusVersion also bumps on non-edit git events, but the extractor is
  // idempotent so a redundant re-run is harmless. The effect's own cleanup
  // (`cancelled = true`) discards the result if the conversation or version
  // has moved on by the time the IPC round-trip returns.
  const statusVersion = gitChangesHook.statusVersion;
  const [agentEditedPaths, setAgentEditedPaths] = useState<string[]>([]);
  useEffect(() => {
    if (!conversation_id) {
      setAgentEditedPaths([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await ipcBridge.database.getConversationMessages.invoke({
          conversation_id,
          page: 0,
          page_size: 10000,
        });
        if (cancelled) return;
        const items: readonly TMessage[] = result?.items ?? [];
        setAgentEditedPaths(extractAgentEditedPaths(items));
      } catch (err) {
        if (cancelled) return;
        // Non-fatal: the Git changes panel just shows the list without badges.
        console.error('[ChatWorkspace] Failed to load agent-edited paths:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversation_id, statusVersion]);

  // Build a memoized Set of repo-relative POSIX paths the agent has touched,
  // so the row predicate is O(1). Path normalization is repeated here because
  // the GitFileChange `path` is absolute (workdir) and the agent tool paths
  // are repo-relative POSIX; we match both shapes for safety.
  const agentRelSet = useMemo(() => {
    const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '');
    const wsRoot = norm(workspace).replace(/\/+$/, '');
    const toRel = (p: string): string => {
      const n = norm(p);
      return n.startsWith(wsRoot + '/') ? n.slice(wsRoot.length + 1) : n;
    };
    return new Set(agentEditedPaths.map(toRel));
  }, [agentEditedPaths, workspace]);

  const isAgentModified = useCallback(
    (change: GitFileChange): boolean => {
      if (agentRelSet.size === 0) return false;
      const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '');
      const wsRoot = norm(workspace).replace(/\/+$/, '');
      const toRel = (p: string): string => {
        const n = norm(p);
        return n.startsWith(wsRoot + '/') ? n.slice(wsRoot.length + 1) : n;
      };
      return agentRelSet.has(norm(change.relativePath)) || agentRelSet.has(toRel(change.path));
    },
    [agentRelSet, workspace]
  );

  // Live meta for outer headers (SiderDiffSection etc.). We notify the parent
  // (e.g. SiderDiffSection header) so it can render "Diff (N)" / branch without
  // duplicating the hooks. Only relevant for changes-aware modes.
  const currentMeta = useMemo(
    () => ({
      count: changesCount,
      branch: gitChangesHook.repoInfo?.branch ?? null,
      isRemote: false,
    }),
    [changesCount, gitChangesHook.repoInfo?.branch]
  );
  useEffect(() => {
    if (onChangesMeta) onChangesMeta(currentMeta);
  }, [onChangesMeta, currentMeta]);

  // Bind workspace uploads to the conversation lifecycle: switching the
  // workspace conversation or unmounting the panel cancels in-flight uploads.
  useAbortUploadsOnConversationChange(conversation_id, 'workspace');

  // Initialize all hooks
  const { isWorkspaceCollapsed, setIsWorkspaceCollapsed } = useWorkspaceCollapse();
  const treeHook = useWorkspaceTree({ workspace, conversation_id, eventPrefix });

  // Editor ↔ tree reveal handoff. The editor dispatches a window event
  // (`editor.reveal.path`) when the active buffer changes; this hook
  // applies the request to the tree by selecting the file and expanding
  // its parent directory chain.
  useEditorRevealInTree({
    workspace,
    setSelected: treeHook.setSelected,
    setExpandedKeys: treeHook.setExpandedKeys,
    expandedKeysRef: treeHook.expandedKeysRef,
  });

  useEffect(() => {
    onSiderFilesRefreshReady?.(treeHook.refreshWorkspace);
  }, [onSiderFilesRefreshReady, treeHook.refreshWorkspace]);

  useEffect(() => {
    onSiderDiffRefreshReady?.(gitChangesHook.refresh);
  }, [onSiderDiffRefreshReady, gitChangesHook.refresh]);

  const modalsHook = useWorkspaceModals();
  const pasteHook = useWorkspacePaste({
    conversation_id: conversation_id,
    workspace,
    messageApi,
    t,
    files: treeHook.files,
    selected: treeHook.selected,
    selectedNodeRef: treeHook.selectedNodeRef,
    refreshWorkspace: treeHook.refreshWorkspace,
    pasteConfirm: modalsHook.pasteConfirm,
    setPasteConfirm: modalsHook.setPasteConfirm,
    closePasteConfirm: modalsHook.closePasteConfirm,
  });

  // Drag import only makes sense for the full files tree (not for the pure 'changes' diff pane).
  const dragImportHook =
    isFullMode || isFilesMode
      ? useWorkspaceDragImport({
          messageApi,
          t,
          onFilesDropped: pasteHook.handleFilesToAdd,
          conversation_id: conversation_id,
        })
      : { dragHandlers: {}, isDragging: false };

  const searchHook = useWorkspaceSearch({ workspace, loadWorkspace: treeHook.loadWorkspace });

  const fileOpsHook = useWorkspaceFileOps({
    workspace,
    eventPrefix,
    messageApi,
    t,
    setFiles: treeHook.setFiles,
    setSelected: treeHook.setSelected,
    setExpandedKeys: treeHook.setExpandedKeys,
    selectedKeysRef: treeHook.selectedKeysRef,
    selectedNodeRef: treeHook.selectedNodeRef,
    ensureNodeSelected: treeHook.ensureNodeSelected,
    refreshWorkspace: treeHook.refreshWorkspace,
    renameModal: modalsHook.renameModal,
    deleteModal: modalsHook.deleteModal,
    renameLoading: modalsHook.renameLoading,
    setRenameLoading: modalsHook.setRenameLoading,
    closeRenameModal: modalsHook.closeRenameModal,
    closeDeleteModal: modalsHook.closeDeleteModal,
    closeContextMenu: modalsHook.closeContextMenu,
    setRenameModal: modalsHook.setRenameModal,
    setDeleteModal: modalsHook.setDeleteModal,
    openEditorFile,
  });

  // Setup events
  useWorkspaceEvents({
    conversation_id,
    eventPrefix,
    refreshWorkspace: treeHook.refreshWorkspace,
    clearSelection: treeHook.clearSelection,
    setFiles: treeHook.setFiles,
    setSelected: treeHook.setSelected,
    setExpandedKeys: treeHook.setExpandedKeys,
    setTreeKey: treeHook.setTreeKey,
    selectedNodeRef: treeHook.selectedNodeRef,
    selectedKeysRef: treeHook.selectedKeysRef,
    closeContextMenu: modalsHook.closeContextMenu,
    setContextMenu: modalsHook.setContextMenu,
    closeRenameModal: modalsHook.closeRenameModal,
    closeDeleteModal: modalsHook.closeDeleteModal,
  });

  // Context menu calculations
  const hasOriginalFiles = treeHook.files.length > 0 && treeHook.files[0]?.children?.length > 0;
  const rootName = treeHook.files[0]?.name ?? '';

  // Hide root directory when there's a single root with children, as Toolbar serves as the first-level directory
  const treeData = flattenSingleRoot(treeHook.files);

  // Authoritative source: `conversation.extra.is_temporary_workspace` is
  // derived by the backend on every response (see
  // aionui-conversation::convert::row_to_response). We never inspect the
  // directory path shape — the backend's temp-workspace layout is not a
  // public contract. Default to false when the prop is unavailable (e.g.
  // tests that render the panel outside a conversation).
  const isTemporaryWorkspace = isTemporaryWorkspaceProp ?? false;
  void rootName; // reserved for future UI hints; no longer used for detection.

  // Get workspace display name using shared utility
  const workspaceDisplayName = useMemo(
    () => getDisplayName(workspace, isTemporaryWorkspace, t),
    [workspace, isTemporaryWorkspace, t]
  );

  let contextMenuStyle: React.CSSProperties | undefined;
  if (modalsHook.contextMenu.visible) {
    contextMenuStyle = computeContextMenuPosition(modalsHook.contextMenu.x, modalsHook.contextMenu.y);
  }

  const openNodeContextMenu = useCallback(
    (node: IDirOrFile, x: number, y: number) => {
      treeHook.ensureNodeSelected(node);
      modalsHook.setContextMenu({
        visible: true,
        x,
        y,
        node,
      });
    },
    [treeHook.ensureNodeSelected, modalsHook.setContextMenu]
  );

  // Changes-tab "Preview" button → open the changed file in the native editor.
  // The Changes panel already shows the inline diff expand for seeing what
  // changed; the Preview button is now an "open this file" shortcut.
  const handleOpenChangeDiff = useCallback(
    (_diffContent: string, _file_name: string, file_path: string) => {
      void openEditorFile({ path: file_path, workspace });
    },
    [openEditorFile, workspace]
  );

  useEffect(() => {
    // In dedicated 'changes' panelMode we always keep the list mounted; refresh
    // on mount and whenever the changes tab is reactivated in full mode.
    if (isChangesMode || activeTab === 'changes') {
      void gitChangesHook.refresh();
    }
  }, [isChangesMode, activeTab, gitChangesHook.refresh]);

  // Switch to the Changes tab only when the user explicitly asks (e.g. remote
  // session "View changes"). Never force changes on conversation load — that
  // broke panelMode="files" (top Sider tree) by hiding the file tree.
  useEffect(() => {
    if (typeof window === 'undefined' || isChangesMode || isFilesMode) return undefined;
    const handleOpenRemoteChanges = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceOpenRemoteChangesDetail>).detail;
      if (detail.conversation_id !== conversation_id) return;
      setActiveTab('changes');
    };
    window.addEventListener(WORKSPACE_OPEN_REMOTE_CHANGES_EVENT, handleOpenRemoteChanges);
    return () => window.removeEventListener(WORKSPACE_OPEN_REMOTE_CHANGES_EVENT, handleOpenRemoteChanges);
  }, [conversation_id, isChangesMode, isFilesMode]);

  useEffect(() => {
    if (!isChangesMode) {
      setActiveTab('files');
    }
  }, [conversation_id, isChangesMode]);

  const prevHasTodosRef = React.useRef(false);
  useEffect(() => {
    if (!isChangesMode && todosHook.hasTodos && !prevHasTodosRef.current) {
      setActiveTab('todos');
    }
    prevHasTodosRef.current = todosHook.hasTodos;
  }, [todosHook.hasTodos, isChangesMode]);

  // Auto-select the Approvals tab when a pending approval appears. Approvals
  // are blocking (the agent waits on them), so they take precedence over the
  // Todos auto-select above when both fire.
  const prevHasApprovalsRef = React.useRef(false);
  useEffect(() => {
    if (!isChangesMode && approvalsHook.hasApprovals && !prevHasApprovalsRef.current) {
      setActiveTab('approvals');
    }
    prevHasApprovalsRef.current = approvalsHook.hasApprovals;
  }, [approvalsHook.hasApprovals, isChangesMode]);

  // Get target folder path for paste confirm modal
  const targetFolderPathForModal = getTargetFolderPath(
    treeHook.selectedNodeRef.current,
    treeHook.selected,
    treeHook.files,
    workspace
  );

  return (
    <>
      {shouldRenderLocalMessageContext && messageContext}
      <div
        className='chat-workspace size-full flex flex-col relative'
        tabIndex={0}
        onFocus={pasteHook.onFocusPaste}
        onClick={pasteHook.onFocusPaste}
        {...dragImportHook.dragHandlers}
        style={
          dragImportHook.isDragging
            ? {
                border: '1px dashed rgb(var(--primary-6))',
                borderRadius: '18px',
                backgroundColor: 'rgba(var(--primary-1), 0.25)',
                transition: 'all 0.2s ease',
              }
            : undefined
        }
      >
        {dragImportHook.isDragging && (
          <div className='absolute inset-0 pointer-events-none z-30 flex items-center justify-center px-32px'>
            <div
              className='w-full max-w-480px text-center text-t-primary rounded-16px px-32px py-28px'
              style={{
                background: 'color-mix(in srgb, var(--bg-10) 88%, transparent)',
                border: '1px dashed var(--brand)',
                boxShadow: 'var(--shadow-lg, 0 20px 60px color-mix(in srgb, var(--bg-10) 35%, transparent))',
              }}
            >
              <div className='text-18px font-semibold mb-8px'>
                {t('conversation.workspace.dragOverlayTitle', {
                  defaultValue: 'Drop to import',
                })}
              </div>
              <div className='text-14px opacity-90 mb-4px'>
                {t('conversation.workspace.dragOverlayDesc', {
                  defaultValue: 'Drag files or folders here to copy them into this workspace.',
                })}
              </div>
              <div className='text-12px opacity-70'>
                {t('conversation.workspace.dragOverlayHint', {
                  defaultValue: 'Tip: drop anywhere to import into the selected folder.',
                })}
              </div>
            </div>
          </div>
        )}

        {/* Paste Confirm Modal — only relevant for tree modes that support drag/paste */}
        {!isChangesMode && (
          <>
            <PasteConfirmModal
              pasteConfirm={modalsHook.pasteConfirm}
              setPasteConfirm={modalsHook.setPasteConfirm}
              closePasteConfirm={modalsHook.closePasteConfirm}
              handlePasteConfirm={pasteHook.handlePasteConfirm}
              targetFolderPath={targetFolderPathForModal}
              t={t}
            />

            {/* Rename + Delete Modals */}
            <WorkspaceDialogs
              t={t}
              renameModal={modalsHook.renameModal}
              setRenameModal={modalsHook.setRenameModal}
              closeRenameModal={modalsHook.closeRenameModal}
              handleRenameConfirm={fileOpsHook.handleRenameConfirm}
              renameLoading={modalsHook.renameLoading}
              deleteModal={modalsHook.deleteModal}
              closeDeleteModal={modalsHook.closeDeleteModal}
              handleDeleteConfirm={fileOpsHook.handleDeleteConfirm}
            />
          </>
        )}

        {/* Tab bar — hidden entirely for dedicated 'changes' (diff) pane; also hidden for 'files' mode with embedded chrome (we show inline badges instead) */}
        {!isChangesMode && !(isFilesMode && siderFilesChrome === 'embedded') && (
          <WorkspaceTabBar
            t={t}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            changeCount={changesCount}
            branch={gitChangesHook.repoInfo?.branch ?? null}
            hasTodos={todosHook.hasTodos}
            todoPendingCount={todosHook.totalCount - todosHook.completedCount}
            hasApprovals={approvalsHook.hasApprovals}
            approvalPendingCount={approvalsHook.approvals.length}
            showChangesTab={showChangesTab}
          />
        )}

        {/* Embedded Sider: folder title lives in SiderFileTree header only — optional todos/approvals strip */}
        {!isChangesMode &&
          isFilesMode &&
          siderFilesChrome === 'embedded' &&
          (todosHook.hasTodos || approvalsHook.hasApprovals) && (
            <div className='sider-files-aux-nav flex items-center gap-6px px-12px py-6px border-b border-[var(--bg-3)] bg-[var(--bg-2)] flex-shrink-0'>
              {activeTab !== 'files' ? (
                <button
                  type='button'
                  className='text-11px font-medium text-brand border-0 bg-transparent cursor-pointer p-0'
                  onClick={() => setActiveTab('files')}
                >
                  {t('conversation.workspace.siderBackToTree', { defaultValue: '← File tree' })}
                </button>
              ) : (
                <span className='text-11px font-semibold uppercase tracking-wide text-t-tertiary'>
                  {t('conversation.workspace.siderAuxViews', { defaultValue: 'Also' })}
                </span>
              )}
              {todosHook.hasTodos && (
                <button
                  type='button'
                  className={`text-11px font-medium px-6px py-2px rounded-control border-0 cursor-pointer ${
                    activeTab === 'todos'
                      ? 'bg-[color-mix(in_srgb,var(--brand)_18%,transparent)] text-brand'
                      : 'bg-transparent text-t-secondary hover:text-t-primary'
                  }`}
                  onClick={() => setActiveTab('todos')}
                >
                  {t('conversation.workspace.todos.tab')}
                  {todosHook.totalCount - todosHook.completedCount > 0
                    ? ` (${todosHook.totalCount - todosHook.completedCount})`
                    : ''}
                </button>
              )}
              {approvalsHook.hasApprovals && (
                <button
                  type='button'
                  className={`text-11px font-medium px-6px py-2px rounded-control border-0 cursor-pointer ${
                    activeTab === 'approvals'
                      ? 'bg-[color-mix(in_srgb,var(--warning)_22%,transparent)] text-warning'
                      : 'bg-transparent text-t-secondary hover:text-t-primary'
                  }`}
                  onClick={() => setActiveTab('approvals')}
                >
                  {t('conversation.workspace.approvals.tab')}
                  {approvalsHook.approvals.length > 0 ? ` (${approvalsHook.approvals.length})` : ''}
                </button>
              )}
            </div>
          )}
        {!isChangesMode && activeTab === 'files' && !isFilesMode && (
          <WorkspaceToolbar
            t={t}
            isWorkspaceCollapsed={isWorkspaceCollapsed}
            setIsWorkspaceCollapsed={setIsWorkspaceCollapsed}
            workspaceDisplayName={workspaceDisplayName}
            showSearch={searchHook.showSearch}
            searchText={searchHook.searchText}
            setSearchText={searchHook.setSearchText}
            onSearch={searchHook.onSearch}
            searchInputRef={searchHook.searchInputRef}
            loading={treeHook.loading}
            refreshWorkspace={treeHook.refreshWorkspace}
            handleSelectHostFiles={pasteHook.handleSelectHostFiles}
            handleUploadDeviceFiles={pasteHook.handleUploadDeviceFiles}
            setShowHostFileSelector={searchHook.setShowHostFileSelector}
          />
        )}

        {/* Main content area (tree) — only in non-changes modes on Files tab */}
        {!isChangesMode && activeTab === 'files' && (isFilesMode || !isWorkspaceCollapsed) && (
          <FlexFullContainer containerClassName='overflow-y-auto'>
            {/* Context Menu */}
            <WorkspaceContextMenu
              visible={modalsHook.contextMenu.visible}
              style={contextMenuStyle}
              node={modalsHook.contextMenu.node}
              t={t}
              handleAddToChat={fileOpsHook.handleAddToChat}
              handleOpenNode={fileOpsHook.handleOpenNode}
              handleRevealNode={fileOpsHook.handleRevealNode}
              handlePreviewFile={fileOpsHook.handlePreviewFile}
              handleDownloadFile={fileOpsHook.handleDownloadFile}
              handleDeleteNode={fileOpsHook.handleDeleteNode}
              openRenameModal={fileOpsHook.openRenameModal}
              closeContextMenu={modalsHook.closeContextMenu}
            />

            {/* Empty state or Tree */}
            {!hasOriginalFiles ? (
              <div className=' flex-1 size-full flex items-center justify-center px-12px box-border'>
                <Empty
                  description={
                    <div>
                      <span className='text-t-secondary font-bold text-14px'>
                        {searchHook.searchText
                          ? t('conversation.workspace.search.empty')
                          : t('conversation.workspace.empty')}
                      </span>
                      <div className='text-t-secondary'>
                        {searchHook.searchText ? '' : t('conversation.workspace.emptyDescription')}
                      </div>
                    </div>
                  }
                />
              </div>
            ) : (
              <Tree
                className={`workspace-tree ${isMobile ? 'chat-workspace-tree--mobile' : ''}`}
                key={treeHook.treeKey}
                selectedKeys={treeHook.selected}
                expandedKeys={treeHook.expandedKeys}
                actionOnClick={['select', 'expand']}
                // Reuse the +/- glyph during lazy-load so the switcher doesn't
                // flash a spinner on first expand of each folder.
                icons={(nodeProps) => ({
                  switcherIcon: <Right className='arco-tree-node-switcher-icon' theme='outline' size={14} />,
                  loadingIcon: <span className={`arco-tree-node-${nodeProps.expanded ? 'minus' : 'plus'}-icon`} />,
                })}
                treeData={treeData}
                fieldNames={{
                  children: 'children',
                  title: 'name',
                  key: 'relativePath',
                  isLeaf: 'isFile',
                }}
                multiple
                renderTitle={(node) => {
                  const relativePath = node.dataRef.relativePath;
                  const isFile = node.dataRef.isFile;
                  const isPasteTarget = !isFile && pasteHook.pasteTargetFolder === relativePath;
                  const nodeData = node.dataRef as IDirOrFile;

                  // Double-click a file: open it in the in-app editor (text/code) or
                  // the OS default app for binary/visual formats. Matches the
                  // single-click flow used elsewhere in the tree.
                  const handleNodeDoubleClick = () => {
                    if (!isFile) return;
                    void fileOpsHook.handlePreviewFile(nodeData);
                  };

                  // Inline "Add to chat" button — fires the same path as the
                  // right-click "Add to chat" entry. stopPropagation on mousedown
                  // + click prevents the tree from intercepting the click as a
                  // row-selection event.
                  const handleInlineAddToChat = (event: React.MouseEvent) => {
                    event.stopPropagation();
                    fileOpsHook.handleAddToChat(nodeData);
                  };

                  return (
                    <div
                      className='group flex items-center justify-between gap-6px min-w-0'
                      style={{ color: 'inherit' }}
                      onDoubleClick={handleNodeDoubleClick}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openNodeContextMenu(nodeData, event.clientX, event.clientY);
                      }}
                    >
                      <span className='flex items-center gap-6px min-w-0 flex-1'>
                        <WorkspaceFileIcon
                          name={node.title as string}
                          isFolder={!isFile}
                          expanded={treeHook.expandedKeys.includes(nodeData.relativePath)}
                          size={15}
                        />
                        <span
                          className={`overflow-hidden text-ellipsis whitespace-nowrap ${isFile ? '' : 'opacity-85'}`}
                        >
                          {node.title}
                        </span>
                        {isPasteTarget && (
                          <span className='ml-1 text-11px font-semibold text-t-primary bg-info px-6px py-2px rounded-control'>
                            {t('conversation.workspace.pasteConfirm_paste')}
                          </span>
                        )}
                      </span>
                      <div
                        className='flex items-center gap-4px flex-shrink-0'
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <WorkspaceTreeAddToChatButton onClick={handleInlineAddToChat} />
                        {isMobile && (
                          <button
                            type='button'
                            className='workspace-header__toggle workspace-node-more-btn h-28px w-28px rd-8px flex items-center justify-center text-t-secondary hover:text-t-primary active:text-t-primary flex-shrink-0'
                            aria-label={t('common.more')}
                            onClick={(event) => {
                              event.stopPropagation();
                              const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                              const menuWidth = 220;
                              const menuHeight = 220;
                              const maxX =
                                typeof window !== 'undefined'
                                  ? Math.max(8, window.innerWidth - menuWidth - 8)
                                  : rect.left;
                              const maxY =
                                typeof window !== 'undefined'
                                  ? Math.max(8, window.innerHeight - menuHeight - 8)
                                  : rect.bottom;
                              const menuX = Math.min(Math.max(8, rect.left - menuWidth + rect.width), maxX);
                              const menuY = Math.min(Math.max(8, rect.bottom + 4), maxY);
                              openNodeContextMenu(nodeData, menuX, menuY);
                            }}
                          >
                            <div
                              className='flex flex-col gap-2px items-center justify-center'
                              style={{ width: '12px', height: '12px' }}
                            >
                              <div className='w-2px h-2px rounded-full bg-current'></div>
                              <div className='w-2px h-2px rounded-full bg-current'></div>
                              <div className='w-2px h-2px rounded-full bg-current'></div>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }}
                onSelect={(_keys, extra) => {
                  const clickedKey = extractNodeKey(extra?.node);
                  const nodeData = extra && extra.node ? extractNodeData(extra.node) : null;
                  const isFileNode = Boolean(nodeData?.isFile);
                  const wasSelected = clickedKey ? treeHook.selectedKeysRef.current.includes(clickedKey) : false;

                  if (isFileNode) {
                    // Single-click file only opens preview without changing selection state
                    if (clickedKey) {
                      const filteredKeys = treeHook.selectedKeysRef.current.filter((key) => key !== clickedKey);
                      treeHook.selectedKeysRef.current = filteredKeys;
                      treeHook.setSelected(filteredKeys);
                    }
                    treeHook.selectedNodeRef.current = null;
                    if (nodeData && clickedKey && !wasSelected) {
                      void fileOpsHook.handlePreviewFile(nodeData);
                    }
                    return;
                  }
                  // Folder: actionOnClick={['select','expand']} on the Tree
                  // already toggles expand via onExpand. Right-click menu
                  // remains the entry point for "Add to Chat".
                }}
                onExpand={(keys) => {
                  treeHook.setExpandedKeys(keys);
                }}
                loadMore={(treeNode) => {
                  const path = treeNode.props.dataRef.fullPath;
                  const targetRelPath = treeNode.props.dataRef.relativePath;
                  return ipcBridge.conversation.getWorkspace
                    .invoke({ conversation_id, workspace, path })
                    .then((res) => {
                      const newChildren = res[0]?.children;
                      if (!newChildren?.length) return;
                      treeHook.setFiles((prev) => {
                        const assign = (nodes: IDirOrFile[]): IDirOrFile[] =>
                          nodes.map((n) => {
                            if (n.relativePath === targetRelPath) return { ...n, children: newChildren };
                            if (n.children) return { ...n, children: assign(n.children) };
                            return n;
                          });
                        return assign(prev);
                      });
                    })
                    .catch((err) => {
                      console.error('[Workspace] loadMore failed:', err);
                    });
                }}
              ></Tree>
            )}
          </FlexFullContainer>
        )}

        {/* Changes tab content (or dedicated changes pane) */}
        {(isChangesMode || (!isChangesMode && !isWorkspaceCollapsed && activeTab === 'changes')) && (
          <FlexFullContainer containerClassName='overflow-y-auto'>
            <GitChangeList
              t={t}
              workspace={workspace}
              repoInfo={gitChangesHook.repoInfo}
              staged={gitChangesHook.staged}
              unstaged={gitChangesHook.unstaged}
              conflicted={gitChangesHook.conflicted}
              loading={gitChangesHook.loading}
              error={gitChangesHook.error}
              statusVersion={gitChangesHook.statusVersion}
              onRefresh={gitChangesHook.refresh}
              onInitRepo={gitChangesHook.initRepo}
              onOpenDiff={handleOpenChangeDiff}
              onStageFile={gitChangesHook.stageFile}
              onStageAll={gitChangesHook.stageAll}
              onUnstageFile={gitChangesHook.unstageFile}
              onUnstageAll={gitChangesHook.unstageAll}
              onDiscardFile={gitChangesHook.discardFile}
              onCommit={gitChangesHook.commit}
              onGetDiff={gitChangesHook.getDiff}
              onExpandFlyout={onExpandFlyout}
              hideToolbar={siderDiffChrome === 'embedded'}
              isAgentModified={isAgentModified}
            />
          </FlexFullContainer>
        )}

        {/* Todos tab content — suppressed in dedicated changes pane */}
        {!isChangesMode && !isWorkspaceCollapsed && activeTab === 'todos' && todosHook.hasTodos && (
          <FlexFullContainer containerClassName='overflow-hidden'>
            <TodoList
              t={t}
              entries={todosHook.entries}
              completedCount={todosHook.completedCount}
              totalCount={todosHook.totalCount}
            />
          </FlexFullContainer>
        )}

        {/* Approvals tab content — suppressed in dedicated changes pane */}
        {!isChangesMode && !isWorkspaceCollapsed && activeTab === 'approvals' && approvalsHook.hasApprovals && (
          <FlexFullContainer containerClassName='overflow-hidden'>
            <ApprovalsList t={t} approvals={approvalsHook.approvals} respond={approvalsHook.respond} />
          </FlexFullContainer>
        )}
      </div>
    </>
  );
};

export default ChatWorkspace;
