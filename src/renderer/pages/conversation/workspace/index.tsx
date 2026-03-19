/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { iconColors } from '@/renderer/styles/colors';
import { emitter } from '@/renderer/utils/emitter';
import { isElectronDesktop } from '@/renderer/utils/platform';
import {
  getLastDirectoryName,
  isTemporaryWorkspace as checkIsTemporaryWorkspace,
  getWorkspaceDisplayName as getDisplayName,
} from '@/renderer/utils/workspace/workspace';
import { Checkbox, Dropdown, Empty, Input, Menu, Message, Modal, Tooltip, Tree } from '@arco-design/web-react';
import { Down, FileText, FolderOpen, Plus, Refresh, Search, AlarmClock } from '@icon-park/react';
import React, { useCallback, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import DirectorySelectionModal from '@/renderer/components/settings/DirectorySelectionModal';
import { useWorkspaceCollapse } from './hooks/useWorkspaceCollapse';
import { useWorkspaceEvents } from './hooks/useWorkspaceEvents';
import { useWorkspaceFileOps } from './hooks/useWorkspaceFileOps';
import { useWorkspaceMigration } from './hooks/useWorkspaceMigration';
import { useWorkspaceModals } from './hooks/useWorkspaceModals';
import { useWorkspacePaste } from './hooks/useWorkspacePaste';
import { useWorkspaceSearch } from './hooks/useWorkspaceSearch';
import { useWorkspaceTree } from './hooks/useWorkspaceTree';
import './workspace.css';
import { useWorkspaceDragImport } from './hooks/useWorkspaceDragImport';
import type { WorkspaceProps } from './types';
import {
  computeContextMenuPosition,
  extractNodeData,
  extractNodeKey,
  findNodeByKey,
  flattenSingleRoot,
  getTargetFolderPath,
} from './utils/treeHelpers';
import { isPreviewSupportedExt } from './utils/filePreview';

const ChangeWorkspaceIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({ className, ...rest }) => {
  const clipPathId = useId();
  return (
    <svg className={className} viewBox='0 0 24 24' role='img' aria-hidden='true' focusable='false' {...rest}>
      <rect width='24' height='24' rx='2' fill='var(--workspace-btn-bg, var(--color-bg-1))' />
      <g clipPath={`url(#${clipPathId})`}>
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M10.8215 8.66602L9.15482 6.99935H5.33333V16.9993H18.6667V8.66602H10.8215ZM4.5 6.99935C4.5 6.53912 4.8731 6.16602 5.33333 6.16602H9.15482C9.37583 6.16602 9.5878 6.25382 9.74407 6.41009L11.1667 7.83268H18.6667C19.1269 7.83268 19.5 8.20578 19.5 8.66602V16.9993C19.5 17.4596 19.1269 17.8327 18.6667 17.8327H5.33333C4.8731 17.8327 4.5 17.4596 4.5 16.9993V6.99935Z'
          fill='var(--color-text-3, var(--text-secondary))'
        />
        <path
          d='M13.0775 12.4158L12.1221 11.4603L12.7113 10.8711L14.6726 12.8324L12.7113 14.7937L12.1221 14.2044L13.0774 13.2491H9.5V12.4158H13.0775Z'
          fill='var(--color-text-3, var(--text-secondary))'
        />
      </g>
      <defs>
        <clipPath id={clipPathId}>
          <rect width='20' height='20' fill='transparent' transform='translate(2 2)' />
        </clipPath>
      </defs>
    </svg>
  );
};

const ChatWorkspace: React.FC<WorkspaceProps> = ({
  conversation_id,
  workspace,
  eventPrefix = 'gemini',
  messageApi: externalMessageApi,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { openPreview } = usePreviewContext();

  // Message API setup
  const [internalMessageApi, messageContext] = Message.useMessage();
  const messageApi = externalMessageApi ?? internalMessageApi;
  const shouldRenderLocalMessageContext = !externalMessageApi;

  // Initialize all hooks
  const { isWorkspaceCollapsed, setIsWorkspaceCollapsed } = useWorkspaceCollapse();
  const treeHook = useWorkspaceTree({ workspace, conversation_id, eventPrefix });
  const modalsHook = useWorkspaceModals();
  const pasteHook = useWorkspacePaste({
    conversationId: conversation_id,
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
    conversationId: conversation_id,
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

  // 当只有一个根目录且有子文件时，隐藏根目录直接展示子文件，因为 Toolbar 已经作为一级目录
  // Hide root directory when there's a single root with children, as Toolbar serves as the first-level directory
  const treeData = flattenSingleRoot(treeHook.files);

  // Check if this is a temporary workspace (check both path and root folder name)
  const isTemporaryWorkspace = checkIsTemporaryWorkspace(workspace) || checkIsTemporaryWorkspace(rootName);

  // Get workspace display name using shared utility
  const workspaceDisplayName = useMemo(() => {
    if (isTemporaryWorkspace) {
      return t('conversation.workspace.temporarySpace');
    }
    return getDisplayName(workspace);
  }, [workspace, isTemporaryWorkspace, t]);

  // Migration hook
  const migrationHook = useWorkspaceMigration({
    conversation_id,
    workspace,
    messageApi,
    t,
    isTemporaryWorkspace,
  });

  let contextMenuStyle: React.CSSProperties | undefined;
  if (modalsHook.contextMenu.visible) {
    contextMenuStyle = computeContextMenuPosition(modalsHook.contextMenu.x, modalsHook.contextMenu.y);
  }

  const contextMenuNode = modalsHook.contextMenu.node;
  const isContextMenuNodeFile = !!contextMenuNode?.isFile;
  const isContextMenuNodeRoot =
    !!contextMenuNode && (!contextMenuNode.relativePath || contextMenuNode.relativePath === '');
  const workspaceUploadMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'host') {
          if (isElectronDesktop()) {
            pasteHook.handleSelectHostFiles();
          } else {
            searchHook.setShowHostFileSelector(true);
          }
        }
        if (key === 'device') {
          pasteHook.handleUploadDeviceFiles();
        }
      }}
    >
      <Menu.Item key='host'>{t('common.fileAttach.hostFiles')}</Menu.Item>
      <Menu.Item key='device'>{t('common.fileAttach.myDevice')}</Menu.Item>
    </Menu>
  );

  // Check if file supports preview
  const isPreviewSupported =
    !!contextMenuNode?.isFile && !!contextMenuNode.name && isPreviewSupportedExt(contextMenuNode.name);

  const menuButtonBase =
    'w-full flex items-center gap-8px px-14px py-6px text-13px text-left text-t-primary rounded-md transition-colors duration-150 hover:bg-2 border-none bg-transparent appearance-none focus:outline-none focus-visible:outline-none';
  const menuButtonDisabled = 'opacity-40 cursor-not-allowed hover:bg-transparent';

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
        <Modal
          visible={modalsHook.pasteConfirm.visible}
          title={null}
          onCancel={() => {
            modalsHook.closePasteConfirm();
          }}
          footer={null}
          style={{ borderRadius: '12px' }}
          className='paste-confirm-modal'
          alignCenter
          getPopupContainer={() => document.body}
        >
          <div className='px-24px py-20px'>
            {/* Title area */}
            <div className='flex items-center gap-12px mb-20px'>
              <div
                className='flex items-center justify-center w-48px h-48px rounded-full'
                style={{ backgroundColor: 'rgb(var(--primary-1))' }}
              >
                <FileText theme='outline' size='24' fill='rgb(var(--primary-6))' />
              </div>
              <div>
                <div className='text-16px font-semibold mb-4px'>{t('conversation.workspace.pasteConfirm_title')}</div>
                <div className='text-13px' style={{ color: 'var(--color-text-3)' }}>
                  {modalsHook.pasteConfirm.filesToPaste.length > 1
                    ? t('conversation.workspace.pasteConfirm_multipleFiles', {
                        count: modalsHook.pasteConfirm.filesToPaste.length,
                      })
                    : t('conversation.workspace.pasteConfirm_title')}
                </div>
              </div>
            </div>

            {/* Content area */}
            <div className='mb-20px px-12px py-16px rounded-8px' style={{ backgroundColor: 'var(--color-fill-2)' }}>
              <div className='flex items-start gap-12px mb-12px'>
                <FileText theme='outline' size='18' fill='var(--color-text-2)' style={{ marginTop: '2px' }} />
                <div className='flex-1'>
                  <div className='text-13px mb-4px' style={{ color: 'var(--color-text-3)' }}>
                    {t('conversation.workspace.pasteConfirm_fileName')}
                  </div>
                  <div className='text-14px font-medium break-all' style={{ color: 'var(--color-text-1)' }}>
                    {modalsHook.pasteConfirm.fileName}
                  </div>
                </div>
              </div>
              <div className='flex items-start gap-12px'>
                <FolderOpen theme='outline' size='18' fill='var(--color-text-2)' style={{ marginTop: '2px' }} />
                <div className='flex-1'>
                  <div className='text-13px mb-4px' style={{ color: 'var(--color-text-3)' }}>
                    {t('conversation.workspace.pasteConfirm_targetFolder')}
                  </div>
                  <div className='text-14px font-medium font-mono break-all' style={{ color: 'rgb(var(--primary-6))' }}>
                    {targetFolderPathForModal.fullPath}
                  </div>
                </div>
              </div>
            </div>

            {/* Checkbox area */}
            <div className='mb-20px'>
              <Checkbox
                checked={modalsHook.pasteConfirm.doNotAsk}
                onChange={(v) => modalsHook.setPasteConfirm((prev) => ({ ...prev, doNotAsk: v }))}
              >
                <span className='text-13px' style={{ color: 'var(--color-text-2)' }}>
                  {t('conversation.workspace.pasteConfirm_noAsk')}
                </span>
              </Checkbox>
            </div>

            {/* Button area */}
            <div className='flex gap-12px justify-end'>
              <button
                className='px-16px py-8px rounded-6px text-14px font-medium transition-all'
                style={{
                  border: '1px solid var(--color-border-2)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={() => {
                  modalsHook.closePasteConfirm();
                }}
              >
                {t('conversation.workspace.pasteConfirm_cancel')}
              </button>
              <button
                className='px-16px py-8px rounded-6px text-14px font-medium transition-all'
                style={{
                  border: 'none',
                  backgroundColor: 'rgb(var(--primary-6))',
                  color: 'white',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgb(var(--primary-5))';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgb(var(--primary-6))';
                }}
                onClick={async () => {
                  await pasteHook.handlePasteConfirm();
                }}
              >
                {t('conversation.workspace.pasteConfirm_paste')}
              </button>
            </div>
          </div>
        </Modal>

        {/* Rename Modal */}
        <Modal
          visible={modalsHook.renameModal.visible}
          title={t('conversation.workspace.contextMenu.renameTitle')}
          onCancel={modalsHook.closeRenameModal}
          onOk={fileOpsHook.handleRenameConfirm}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
          confirmLoading={modalsHook.renameLoading}
          style={{ borderRadius: '12px' }}
          alignCenter
          getPopupContainer={() => document.body}
        >
          <Input
            autoFocus
            value={modalsHook.renameModal.value}
            onChange={(value) => modalsHook.setRenameModal((prev) => ({ ...prev, value }))}
            onPressEnter={fileOpsHook.handleRenameConfirm}
            placeholder={t('conversation.workspace.contextMenu.renamePlaceholder')}
          />
        </Modal>

        {/* Delete Modal */}
        <Modal
          visible={modalsHook.deleteModal.visible}
          title={t('conversation.workspace.contextMenu.deleteTitle')}
          onCancel={modalsHook.closeDeleteModal}
          onOk={fileOpsHook.handleDeleteConfirm}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
          confirmLoading={modalsHook.deleteModal.loading}
          style={{ borderRadius: '12px' }}
          alignCenter
          getPopupContainer={() => document.body}
        >
          <div className='text-14px text-t-secondary'>{t('conversation.workspace.contextMenu.deleteConfirm')}</div>
        </Modal>

        {/* Workspace Migration Modal */}
        <Modal
          visible={migrationHook.showMigrationModal}
          title={t('conversation.workspace.migration.title')}
          onCancel={migrationHook.handleCloseMigrationModal}
          footer={null}
          style={{ borderRadius: '12px' }}
          className='workspace-migration-modal'
          alignCenter
          getPopupContainer={() => document.body}
        >
          <div className='py-8px'>
            {/* Current workspace info */}
            <div className='text-14px mb-16px' style={{ color: 'var(--color-text-3)' }}>
              {t('conversation.workspace.migration.currentWorkspaceLabel')}
              <span className='font-mono'>/{getLastDirectoryName(workspace)}</span>
            </div>

            {/* Target folder selection card */}
            <div className='mb-16px p-16px rounded-12px' style={{ backgroundColor: 'var(--color-fill-1)' }}>
              <div className='text-14px mb-8px' style={{ color: 'var(--color-text-1)' }}>
                {t('conversation.workspace.migration.moveToNewFolder')}
              </div>
              <div
                className='flex items-center justify-between px-12px py-10px rounded-8px cursor-pointer transition-colors hover:bg-[var(--color-fill-2)]'
                style={{
                  backgroundColor: 'var(--color-bg-1)',
                  border: '1px solid var(--color-border-2)',
                }}
                onClick={migrationHook.handleSelectFolder}
              >
                <span
                  className='text-14px'
                  style={{ color: migrationHook.selectedTargetPath ? 'var(--color-text-1)' : 'var(--color-text-3)' }}
                >
                  {migrationHook.selectedTargetPath || t('conversation.workspace.migration.selectFolder')}
                </span>
                <FolderOpen theme='outline' size='18' fill='var(--color-text-3)' />
              </div>
            </div>

            {/* Hint */}
            <div className='flex items-center gap-8px mb-20px text-14px' style={{ color: 'var(--color-text-3)' }}>
              <span>💡</span>
              <span>{t('conversation.workspace.migration.hint')}</span>
            </div>

            {/* Button area */}
            <div className='flex gap-12px justify-end'>
              <button
                className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
                style={{
                  border: '1px solid var(--color-border-2)',
                  backgroundColor: 'var(--color-fill-2)',
                  color: 'var(--color-text-1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
                }}
                onClick={migrationHook.handleCloseMigrationModal}
                disabled={migrationHook.migrationLoading}
              >
                {t('common.cancel')}
              </button>
              <button
                className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
                style={{
                  border: 'none',
                  backgroundColor: migrationHook.migrationLoading ? 'var(--color-fill-3)' : 'var(--color-text-1)',
                  color: 'var(--color-bg-1)',
                  cursor: migrationHook.migrationLoading ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!migrationHook.migrationLoading) {
                    e.currentTarget.style.opacity = '0.85';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!migrationHook.migrationLoading) {
                    e.currentTarget.style.opacity = '1';
                  }
                }}
                onClick={migrationHook.handleMigrationConfirm}
                disabled={migrationHook.migrationLoading || !migrationHook.selectedTargetPath}
              >
                {migrationHook.migrationLoading ? t('conversation.workspace.migration.migrating') : t('common.confirm')}
              </button>
            </div>
          </div>
        </Modal>

        {/* Cron Migration Modal */}
        <Modal
          visible={migrationHook.showCronMigrationPrompt}
          title={t('conversation.workspace.migration.cronMigrationTitle')}
          onCancel={migrationHook.handleCloseMigrationModal}
          footer={null}
          style={{ borderRadius: '12px' }}
          className='cron-migration-modal'
          alignCenter
          getPopupContainer={() => document.body}
        >
          <div className='py-8px'>
            <div
              className='flex items-center gap-12px p-16px rounded-12px mb-16px'
              style={{ backgroundColor: 'var(--color-fill-1)' }}
            >
              <div
                className='w-40px h-40px rounded-full flex items-center justify-center'
                style={{ backgroundColor: 'rgba(var(--primary-6), 0.1)' }}
              >
                <AlarmClock theme='outline' size='22' fill='rgb(var(--primary-6))' />
              </div>
              <div className='flex-1'>
                <div className='text-15px font-medium mb-4px'>
                  {t('conversation.workspace.migration.cronMigrationTitle')}
                </div>
                <div className='text-13px text-t-secondary'>
                  {t('conversation.workspace.migration.cronMigrationHint')}
                </div>
              </div>
            </div>

            <div className='flex gap-12px justify-end'>
              <button
                className='px-20px py-8px rounded-20px text-14px font-medium transition-all'
                style={{
                  border: '1px solid var(--color-border-2)',
                  backgroundColor: 'var(--color-fill-2)',
                  color: 'var(--color-text-1)',
                }}
                onClick={() => migrationHook.executeMigration(false)}
                disabled={migrationHook.migrationLoading}
              >
                {t('conversation.workspace.migration.cronMigrationSkip')}
              </button>
              <button
                className='px-20px py-8px rounded-20px text-14px font-medium transition-all'
                style={{
                  border: 'none',
                  backgroundColor: 'var(--color-text-1)',
                  color: 'var(--color-bg-1)',
                  cursor: 'pointer',
                }}
                onClick={() => migrationHook.executeMigration(true)}
                disabled={migrationHook.migrationLoading}
              >
                {t('conversation.workspace.migration.cronMigrationConfirm')}
              </button>
            </div>
          </div>
        </Modal>

        {/* Directory Selection Modal (for WebUI only) */}
        <DirectorySelectionModal
          visible={migrationHook.showDirectorySelector}
          onConfirm={migrationHook.handleSelectDirectoryFromModal}
          onCancel={migrationHook.closeDirectorySelector}
        />

        {/* Host File Selection Modal (for WebUI workspace + button) */}
        <DirectorySelectionModal
          visible={searchHook.showHostFileSelector}
          isFileMode
          onConfirm={(paths) => searchHook.handleHostFileSelected(paths, pasteHook.handleFilesToAdd)}
          onCancel={() => searchHook.setShowHostFileSelector(false)}
        />

        {/* Search Input - 最上方 */}
        <div className='px-12px'>
          {(searchHook.showSearch || searchHook.searchText) && (
            <div className='pb-8px workspace-toolbar-search'>
              <Input
                className='w-full workspace-search-input'
                ref={searchHook.searchInputRef}
                placeholder={t('conversation.workspace.searchPlaceholder')}
                value={searchHook.searchText}
                onChange={(value) => {
                  searchHook.setSearchText(value);
                  searchHook.onSearch(value);
                }}
                allowClear
                prefix={<Search theme='outline' size='14' fill={iconColors.primary} />}
              />
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className='px-12px'>
          {/* Border divider - 搜索框下方分界线 */}
          {!isWorkspaceCollapsed && (searchHook.showSearch || searchHook.searchText) && (
            <div className='border-b border-b-base' />
          )}

          {/* Directory name with collapse and action icons */}
          <div className='workspace-toolbar-row flex items-center justify-between gap-8px'>
            <div
              className='flex items-center gap-8px cursor-pointer flex-1 min-w-0'
              onClick={() => setIsWorkspaceCollapsed(!isWorkspaceCollapsed)}
            >
              <Down
                size={16}
                fill={iconColors.primary}
                className={`line-height-0 transition-transform duration-200 flex-shrink-0 ${isWorkspaceCollapsed ? '-rotate-90' : 'rotate-0'}`}
              />
              {isTemporaryWorkspace ? (
                <Tooltip content={t('conversation.workspace.contextMenu.openLocation')}>
                  <span
                    role='button'
                    tabIndex={0}
                    className='workspace-title-label font-bold text-14px text-t-primary overflow-hidden text-ellipsis whitespace-nowrap transition-colors hover:text-[rgb(var(--primary-6))] hover:underline underline-offset-3'
                    onClick={(event) => {
                      event.stopPropagation();
                      void migrationHook.handleOpenWorkspaceRoot();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        void migrationHook.handleOpenWorkspaceRoot();
                      }
                    }}
                  >
                    {workspaceDisplayName}
                  </span>
                </Tooltip>
              ) : (
                <span className='workspace-title-label font-bold text-14px text-t-primary overflow-hidden text-ellipsis whitespace-nowrap'>
                  {workspaceDisplayName}
                </span>
              )}
            </div>
            <div className='workspace-toolbar-actions flex items-center gap-8px flex-shrink-0'>
              {!isElectronDesktop() && (
                <Dropdown droplist={workspaceUploadMenu} trigger='click' position='bl'>
                  <span>
                    <Plus
                      className='workspace-toolbar-icon-btn lh-[1] flex cursor-pointer'
                      theme='outline'
                      size='16'
                      fill={iconColors.secondary}
                    />
                  </span>
                </Dropdown>
              )}
              {isTemporaryWorkspace && (
                <Tooltip content={t('conversation.workspace.changeWorkspace')}>
                  <span>
                    <ChangeWorkspaceIcon
                      className='workspace-toolbar-icon-btn line-height-0 cursor-pointer w-24px h-24px flex-shrink-0'
                      onClick={migrationHook.handleOpenMigrationModal}
                    />
                  </span>
                </Tooltip>
              )}
              <Tooltip content={t('conversation.workspace.refresh')}>
                <span>
                  <Refresh
                    className={
                      treeHook.loading
                        ? 'workspace-toolbar-icon-btn loading lh-[1] flex cursor-pointer'
                        : 'workspace-toolbar-icon-btn flex cursor-pointer'
                    }
                    theme='outline'
                    size='16'
                    fill={iconColors.secondary}
                    onClick={() => treeHook.refreshWorkspace()}
                  />
                </span>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Main content area */}
        {!isWorkspaceCollapsed && (
          <FlexFullContainer containerClassName='overflow-y-auto'>
            {/* Context Menu */}
            {modalsHook.contextMenu.visible && contextMenuNode && contextMenuStyle && (
              <div
                className='fixed z-100 min-w-200px max-w-240px rounded-12px bg-base/95 shadow-[0_12px_40px_rgba(15,23,42,0.16)] backdrop-blur-sm p-6px'
                style={{ top: contextMenuStyle.top, left: contextMenuStyle.left }}
                onClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <div className='flex flex-col gap-4px'>
                  <button
                    type='button'
                    className={menuButtonBase}
                    onClick={() => {
                      fileOpsHook.handleAddToChat(contextMenuNode);
                    }}
                  >
                    {t('conversation.workspace.contextMenu.addToChat')}
                  </button>
                  <button
                    type='button'
                    className={menuButtonBase}
                    onClick={() => {
                      void fileOpsHook.handleOpenNode(contextMenuNode);
                      modalsHook.closeContextMenu();
                    }}
                  >
                    {t('conversation.workspace.contextMenu.open')}
                  </button>
                  {isContextMenuNodeFile && (
                    <button
                      type='button'
                      className={menuButtonBase}
                      onClick={() => {
                        void fileOpsHook.handleRevealNode(contextMenuNode);
                        modalsHook.closeContextMenu();
                      }}
                    >
                      {t('conversation.workspace.contextMenu.openLocation')}
                    </button>
                  )}
                  {isContextMenuNodeFile && isPreviewSupported && (
                    <button
                      type='button'
                      className={menuButtonBase}
                      onClick={() => {
                        void fileOpsHook.handlePreviewFile(contextMenuNode);
                      }}
                    >
                      {t('conversation.workspace.contextMenu.preview')}
                    </button>
                  )}
                  {isContextMenuNodeFile && (
                    <button
                      type='button'
                      className={menuButtonBase}
                      onClick={() => {
                        void fileOpsHook.handleDownloadFile(contextMenuNode);
                      }}
                    >
                      {t('conversation.workspace.contextMenu.download')}
                    </button>
                  )}
                  <div className='h-1px bg-3 my-2px'></div>
                  <button
                    type='button'
                    className={`${menuButtonBase} ${isContextMenuNodeRoot ? menuButtonDisabled : ''}`.trim()}
                    disabled={isContextMenuNodeRoot}
                    onClick={() => {
                      fileOpsHook.handleDeleteNode(contextMenuNode);
                    }}
                  >
                    {t('common.delete')}
                  </button>
                  <button
                    type='button'
                    className={`${menuButtonBase} ${isContextMenuNodeRoot ? menuButtonDisabled : ''}`.trim()}
                    disabled={isContextMenuNodeRoot}
                    onClick={() => {
                      fileOpsHook.openRenameModal(contextMenuNode);
                    }}
                  >
                    {t('conversation.workspace.contextMenu.rename')}
                  </button>
                </div>
              </div>
            )}

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
                onSelect={(keys, extra) => {
                  const clickedKey = extractNodeKey(extra?.node);
                  const nodeData = extra && extra.node ? extractNodeData(extra.node) : null;
                  const isFileNode = Boolean(nodeData?.isFile);
                  const wasSelected = clickedKey ? treeHook.selectedKeysRef.current.includes(clickedKey) : false;

                  if (isFileNode) {
                    // 单击文件仅打开预览，不改变选中状态 / Single-click file only opens preview without changing selection state
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

                  // 目录节点仍保留原有选中逻辑 / Keep existing selection logic for folders
                  let newKeys: string[];

                  if (clickedKey && wasSelected) {
                    newKeys = treeHook.selectedKeysRef.current.filter((key) => key !== clickedKey);
                  } else if (clickedKey) {
                    newKeys = [...treeHook.selectedKeysRef.current, clickedKey];
                  } else {
                    newKeys = keys.filter((key) => key !== workspace);
                  }

                  treeHook.setSelected(newKeys);
                  treeHook.selectedKeysRef.current = newKeys;

                  if (extra && extra.node && nodeData && nodeData.fullPath && nodeData.relativePath != null) {
                    treeHook.selectedNodeRef.current = {
                      relativePath: nodeData.relativePath,
                      fullPath: nodeData.fullPath,
                    };
                  } else {
                    treeHook.selectedNodeRef.current = null;
                  }

                  const items: Array<{ path: string; name: string; isFile: boolean }> = [];
                  for (const k of newKeys) {
                    const node = findNodeByKey(treeHook.files, k);
                    if (node && node.fullPath) {
                      items.push({
                        path: node.fullPath,
                        name: node.name,
                        isFile: node.isFile,
                      });
                    }
                  }
                  emitter.emit(`${eventPrefix}.selected.file`, items);
                }}
                onExpand={(keys) => {
                  treeHook.setExpandedKeys(keys);
                }}
                loadMore={(treeNode) => {
                  const path = treeNode.props.dataRef.fullPath;
                  return ipcBridge.conversation.getWorkspace
                    .invoke({ conversation_id, workspace, path })
                    .then((res) => {
                      treeNode.props.dataRef.children = res[0].children;
                      treeHook.setFiles([...treeHook.files]);
                    });
                }}
              ></Tree>
            )}
          </FlexFullContainer>
        )}
      </div>
    </>
  );
};

export default ChatWorkspace;
