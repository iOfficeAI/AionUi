/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
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
import { useWorkspace } from './hooks/useWorkspace';
import { useWorkspaceCollapse } from './hooks/useWorkspaceCollapse';
import { useWorkspaceDragImport } from './hooks/useWorkspaceDragImport';
import { useWorkspaceModals } from './hooks/useWorkspaceModals';
import { useWorkspaceSearch } from './hooks/useWorkspaceSearch';
import { WorkspaceProvider } from './store/WorkspaceProvider';
import type { WorkspaceProps, WorkspaceTab } from './types';
import {
  computeContextMenuPosition,
  extractNodeData,
  extractNodeKey,
  flattenSingleRoot,
  getTargetFolderPath,
} from './utils/treeHelpers';
import './workspace.css';

const ChatWorkspaceInner: React.FC<WorkspaceProps> = ({
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

  const [internalMessageApi, messageContext] = Message.useMessage();
  const messageApi = externalMessageApi ?? internalMessageApi;
  const shouldRenderLocalMessageContext = !externalMessageApi;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('files');
  const fileChangesHook = useFileChanges({ workspace });

  const { isWorkspaceCollapsed, setIsWorkspaceCollapsed } = useWorkspaceCollapse();
  const modals = useWorkspaceModals();

  // Single source of truth for everything tree-related (data, ws, ops, paste).
  const ws = useWorkspace({
    messageApi,
    t,
    collapsed: isWorkspaceCollapsed,
    openPreview,
    renameModal: modals.renameModal,
    deleteModal: modals.deleteModal,
    renameLoading: modals.renameLoading,
    setRenameLoading: modals.setRenameLoading,
    closeRenameModal: modals.closeRenameModal,
    closeDeleteModal: modals.closeDeleteModal,
    closeContextMenu: modals.closeContextMenu,
    setRenameModal: modals.setRenameModal,
    setDeleteModal: modals.setDeleteModal,
    pasteConfirm: modals.pasteConfirm,
    setPasteConfirm: modals.setPasteConfirm,
    closePasteConfirm: modals.closePasteConfirm,
  });

  const dragImport = useWorkspaceDragImport({
    messageApi,
    t,
    onFilesDropped: ws.handleFilesToAdd,
    conversation_id,
  });

  const search = useWorkspaceSearch({ workspace, loadWorkspace: ws.loadWorkspace });

  const hasOriginalFiles = ws.files.length > 0 && (ws.files[0]?.children?.length ?? 0) > 0;
  const treeData = flattenSingleRoot(ws.files);

  const isTemporaryWorkspace = isTemporaryWorkspaceProp ?? false;

  const workspaceDisplayName = useMemo(
    () => getDisplayName(workspace, isTemporaryWorkspace, t),
    [workspace, isTemporaryWorkspace, t]
  );

  let contextMenuStyle: React.CSSProperties | undefined;
  if (modals.contextMenu.visible) {
    contextMenuStyle = computeContextMenuPosition(modals.contextMenu.x, modals.contextMenu.y);
  }

  const openNodeContextMenu = useCallback(
    (node: IDirOrFile, x: number, y: number) => {
      ws.ensureNodeSelected(node);
      modals.setContextMenu({ visible: true, x, y, node });
    },
    [ws, modals]
  );

  const handleOpenChangeDiff = useCallback(
    (diffContent: string, file_name: string, file_path: string) => {
      openPreview(diffContent, 'diff', { file_name, file_path, workspace });
    },
    [openPreview, workspace]
  );

  useEffect(() => {
    if (activeTab === 'changes') {
      fileChangesHook.refreshChanges();
    }
  }, [activeTab, fileChangesHook.refreshChanges]);

  // Context menu close handlers (kept inline since they're trivial DOM listeners).
  useEffect(() => {
    const handleClose = () => modals.closeContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') modals.closeContextMenu();
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modals.closeContextMenu]);

  const targetFolderPathForModal = getTargetFolderPath(ws.selectedNodeRef.current, ws.selected, ws.files, workspace);

  return (
    <>
      {shouldRenderLocalMessageContext && messageContext}
      <div
        className='chat-workspace size-full flex flex-col relative'
        tabIndex={0}
        onFocus={ws.onFocusPaste}
        onClick={ws.onFocusPaste}
        {...dragImport.dragHandlers}
        style={
          dragImport.isDragging
            ? {
                border: '1px dashed rgb(var(--primary-6))',
                borderRadius: '18px',
                backgroundColor: 'rgba(var(--primary-1), 0.25)',
                transition: 'all 0.2s ease',
              }
            : undefined
        }
      >
        {dragImport.isDragging && (
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
                {t('conversation.workspace.dragOverlayTitle', { defaultValue: 'Drop to import' })}
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

        <PasteConfirmModal
          pasteConfirm={modals.pasteConfirm}
          setPasteConfirm={modals.setPasteConfirm}
          closePasteConfirm={modals.closePasteConfirm}
          handlePasteConfirm={ws.handlePasteConfirm}
          targetFolderPath={targetFolderPathForModal}
          t={t}
        />

        <WorkspaceDialogs
          t={t}
          renameModal={modals.renameModal}
          setRenameModal={modals.setRenameModal}
          closeRenameModal={modals.closeRenameModal}
          handleRenameConfirm={ws.handleRenameConfirm}
          renameLoading={modals.renameLoading}
          deleteModal={modals.deleteModal}
          closeDeleteModal={modals.closeDeleteModal}
          handleDeleteConfirm={ws.handleDeleteConfirm}
        />

        <WorkspaceTabBar
          t={t}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          changeCount={fileChangesHook.changeCount}
          branch={fileChangesHook.snapshotInfo?.branch ?? null}
        />

        {activeTab === 'files' && (
          <WorkspaceToolbar
            t={t}
            isWorkspaceCollapsed={isWorkspaceCollapsed}
            setIsWorkspaceCollapsed={setIsWorkspaceCollapsed}
            workspaceDisplayName={workspaceDisplayName}
            showSearch={search.showSearch}
            searchText={search.searchText}
            setSearchText={search.setSearchText}
            onSearch={search.onSearch}
            searchInputRef={search.searchInputRef}
            loading={ws.loading}
            refreshWorkspace={ws.refreshWorkspace}
            handleSelectHostFiles={ws.handleSelectHostFiles}
            handleUploadDeviceFiles={ws.handleUploadDeviceFiles}
            setShowHostFileSelector={search.setShowHostFileSelector}
          />
        )}

        {!isWorkspaceCollapsed && activeTab === 'files' && (
          <FlexFullContainer containerClassName='overflow-y-auto'>
            <WorkspaceContextMenu
              visible={modals.contextMenu.visible}
              style={contextMenuStyle}
              node={modals.contextMenu.node}
              t={t}
              handleAddToChat={ws.handleAddToChat}
              handleOpenNode={ws.handleOpenNode}
              handleRevealNode={ws.handleRevealNode}
              handlePreviewFile={ws.handlePreviewFile}
              handleDownloadFile={ws.handleDownloadFile}
              handleDeleteNode={ws.handleDeleteNode}
              openRenameModal={ws.openRenameModal}
              closeContextMenu={modals.closeContextMenu}
            />

            {!hasOriginalFiles ? (
              <div className=' flex-1 size-full flex items-center justify-center px-12px box-border'>
                <Empty
                  description={
                    <div>
                      <span className='text-t-secondary font-bold text-14px'>
                        {search.searchText
                          ? t('conversation.workspace.search.empty')
                          : t('conversation.workspace.empty')}
                      </span>
                      <div className='text-t-secondary'>
                        {search.searchText ? '' : t('conversation.workspace.emptyDescription')}
                      </div>
                    </div>
                  }
                />
              </div>
            ) : (
              <Tree
                className={`${isMobile ? '!pl-20px !pr-10px chat-workspace-tree--mobile' : '!pl-32px !pr-16px'} workspace-tree`}
                showLine
                key={ws.treeKey}
                selectedKeys={ws.selected}
                expandedKeys={ws.expandedKeys}
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
                  const isPasteTarget = !isFile && ws.pasteTargetFolder === relativePath;
                  const nodeData = node.dataRef as IDirOrFile;

                  return (
                    <div
                      className='flex items-center justify-between gap-6px min-w-0'
                      style={{ color: 'inherit' }}
                      onDoubleClick={() => {
                        if (isFile) ws.handleAddToChat(nodeData);
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
                  const wasSelected = clickedKey ? ws.selectedKeysRef.current.includes(clickedKey) : false;

                  if (isFileNode) {
                    if (clickedKey) {
                      const filteredKeys = ws.selectedKeysRef.current.filter((key) => key !== clickedKey);
                      ws.setSelected(filteredKeys);
                    }
                    ws.selectedNodeRef.current = null;
                    if (nodeData && clickedKey && !wasSelected) {
                      void ws.handlePreviewFile(nodeData);
                    }
                    return;
                  }
                  // Folder: actionOnClick={['select','expand']} on the Tree
                  // already toggles expand via onExpand. Right-click menu
                  // remains the entry point for "Add to Chat".
                }}
                onExpand={(keys) => {
                  const prevKeys = ws.expandedKeys;
                  // arco Tree onExpand never returns the implicit root key "" — filtering it
                  // out of both diffs preserves the panel-lifetime root subscription that
                  // user expand/collapse must never tear down.
                  const expanded = (keys as string[]).filter((k) => k !== '' && !prevKeys.includes(k));
                  const collapsed = prevKeys.filter((k) => k !== '' && !(keys as string[]).includes(k));
                  ws.setExpandedKeys(keys as string[]);
                  if (expanded.length > 0) ws.onDirsExpand(expanded);
                  if (collapsed.length > 0) ws.onDirsCollapse(collapsed);
                }}
                loadMore={(treeNode) => {
                  const path = treeNode.props.dataRef.fullPath;
                  const targetRelPath = treeNode.props.dataRef.relativePath;
                  return ipcBridge.conversation.getWorkspace
                    .invoke({ conversation_id, workspace, path })
                    .then((res) => {
                      const newChildren = res[0]?.children;
                      if (!newChildren?.length) return;
                      ws.store.replaceChildren(targetRelPath, newChildren);
                    })
                    .catch((err) => {
                      console.error('[Workspace] loadMore failed:', err);
                    });
                }}
              ></Tree>
            )}
          </FlexFullContainer>
        )}

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

const ChatWorkspace: React.FC<WorkspaceProps> = (props) => {
  return (
    <WorkspaceProvider
      workspace={props.workspace}
      conversationId={props.conversation_id}
      eventPrefix={props.eventPrefix ?? 'acp'}
    >
      <ChatWorkspaceInner {...props} />
    </WorkspaceProvider>
  );
};

export default ChatWorkspace;
