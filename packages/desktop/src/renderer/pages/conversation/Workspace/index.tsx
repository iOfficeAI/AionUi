/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useEditorContext } from '@/renderer/pages/conversation/Editor';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { getWorkspaceDisplayName as getDisplayName } from '@/renderer/utils/workspace/workspace';
import { Empty, Message, Tree } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FileChangeList from './components/FileChangeList';
import PasteConfirmModal from './components/PasteConfirmModal';
import WorkspaceContextMenu from './components/WorkspaceContextMenu';
import WorkspaceDialogs from './components/WorkspaceDialogs';
import WorkspaceTabBar from './components/WorkspaceTabBar';
import WorkspaceToolbar from './components/WorkspaceToolbar';
import { useFileChanges } from './hooks/useFileChanges';
import { useWorkspaceCollapse } from './hooks/useWorkspaceCollapse';
import { useWorkspaceDragImport } from './hooks/useWorkspaceDragImport';
import { useWorkspaceEvents } from './hooks/useWorkspaceEvents';
import { useWorkspaceFileOps } from './hooks/useWorkspaceFileOps';
import { useWorkspaceModals } from './hooks/useWorkspaceModals';
import { useWorkspacePaste } from './hooks/useWorkspacePaste';
import { useAbortUploadsOnConversationChange } from '@/renderer/hooks/file/useAbortUploadsOnConversationChange';
import { useWorkspaceSearch } from './hooks/useWorkspaceSearch';
import { useWorkspaceTree } from './hooks/useWorkspaceTree';
import type { WorkspaceProps, WorkspaceTab } from './types';
import {
  computeContextMenuPosition,
  extractNodeData,
  extractNodeKey,
  flattenSingleRoot,
  getTargetFolderPath,
} from './utils/treeHelpers';
import './workspace.css';

const ChatWorkspace: React.FC<WorkspaceProps> = ({
  conversation_id,
  workspace,
  isTemporaryWorkspace: isTemporaryWorkspaceProp,
  eventPrefix = 'acp',
  messageApi: externalMessageApi,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { openPreview } = usePreviewContext();
  const { openEditorFile } = useEditorContext();

  // Message API setup
  const [internalMessageApi, messageContext] = Message.useMessage();
  const messageApi = externalMessageApi ?? internalMessageApi;
  const shouldRenderLocalMessageContext = !externalMessageApi;

  // Tab state and file changes
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('files');
  const fileChangesHook = useFileChanges({ workspace });

  // Bind workspace uploads to the conversation lifecycle: switching the
  // workspace conversation or unmounting the panel cancels in-flight uploads.
  useAbortUploadsOnConversationChange(conversation_id, 'workspace');

  // Initialize all hooks
  const { isWorkspaceCollapsed, setIsWorkspaceCollapsed } = useWorkspaceCollapse();
  const treeHook = useWorkspaceTree({ workspace, conversation_id, eventPrefix });
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

  const dragImportHook = useWorkspaceDragImport({
    messageApi,
    t,
    onFilesDropped: pasteHook.handleFilesToAdd,
    conversation_id: conversation_id,
  });

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
    openPreview,
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

  // Auto-refresh changes when switching to changes tab
  useEffect(() => {
    if (activeTab === 'changes') {
      fileChangesHook.refreshChanges();
    }
  }, [activeTab, fileChangesHook.refreshChanges]);

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
              className='w-full max-w-480px text-center text-white rounded-16px px-32px py-28px'
              style={{
                background: 'rgba(6, 11, 25, 0.85)',
                border: '1px dashed rgb(var(--primary-6))',
                boxShadow: '0 20px 60px rgba(15, 23, 42, 0.45)',
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

        {/* Paste Confirm Modal */}
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

        {/* Tab bar */}
        <WorkspaceTabBar
          t={t}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          changeCount={fileChangesHook.changeCount}
          branch={fileChangesHook.snapshotInfo?.branch ?? null}
        />

        {/* Toolbar: search input + directory name + action buttons */}
        {activeTab === 'files' && (
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

        {/* Main content area */}
        {!isWorkspaceCollapsed && activeTab === 'files' && (
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
                className={`${isMobile ? '!pl-20px !pr-10px chat-workspace-tree--mobile' : '!pl-32px !pr-16px'} workspace-tree`}
                showLine
                key={treeHook.treeKey}
                selectedKeys={treeHook.selected}
                expandedKeys={treeHook.expandedKeys}
                actionOnClick={['select', 'expand']}
                // Reuse the +/- glyph during lazy-load so the switcher doesn't
                // flash a spinner on first expand of each folder.
                icons={(nodeProps) => ({
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

                  return (
                    <div
                      className='flex items-center justify-between gap-6px min-w-0'
                      style={{ color: 'inherit' }}
                      onDoubleClick={() => {
                        if (isFile) {
                          fileOpsHook.handleAddToChat(nodeData);
                        }
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openNodeContextMenu(nodeData, event.clientX, event.clientY);
                      }}
                    >
                      <span className='flex items-center gap-4px min-w-0'>
                        <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{node.title}</span>
                        {isPasteTarget && (
                          <span className='ml-1 text-xs text-blue-700 font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded'>
                            PASTE
                          </span>
                        )}
                      </span>
                      {isMobile && (
                        <button
                          type='button'
                          className='workspace-header__toggle workspace-node-more-btn h-28px w-28px rd-8px flex items-center justify-center text-t-secondary hover:text-t-primary active:text-t-primary flex-shrink-0'
                          aria-label={t('common.more')}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                          }}
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

        {/* Changes tab content */}
        {!isWorkspaceCollapsed && activeTab === 'changes' && (
          <FlexFullContainer containerClassName='overflow-y-auto'>
            <FileChangeList
              t={t}
              workspace={workspace}
              staged={fileChangesHook.staged}
              unstaged={fileChangesHook.unstaged}
              loading={fileChangesHook.loading}
              snapshotInfo={fileChangesHook.snapshotInfo}
              onRefresh={fileChangesHook.refreshChanges}
              onOpenDiff={handleOpenChangeDiff}
              onStageFile={fileChangesHook.stageFile}
              onStageAll={fileChangesHook.stageAll}
              onUnstageFile={fileChangesHook.unstageFile}
              onUnstageAll={fileChangesHook.unstageAll}
              onDiscardFile={fileChangesHook.discardFile}
              onResetFile={fileChangesHook.resetFile}
            />
          </FlexFullContainer>
        )}
      </div>
    </>
  );
};

export default ChatWorkspace;
