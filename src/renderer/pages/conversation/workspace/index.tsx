/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import useDebounce from '@/renderer/hooks/useDebounce';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { iconColors } from '@/renderer/theme/colors';
import { emitter } from '@/renderer/utils/emitter';
import { Checkbox, Empty, Input, Message, Modal, Tooltip, Tree } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { FileAddition, FileText, FolderOpen, Refresh, Search } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceEvents } from './hooks/useWorkspaceEvents';
import { useWorkspaceFileOps } from './hooks/useWorkspaceFileOps';
import { useWorkspaceModals } from './hooks/useWorkspaceModals';
import { useWorkspacePaste } from './hooks/useWorkspacePaste';
import { useWorkspaceTree } from './hooks/useWorkspaceTree';
import { useWorkspaceDragImport } from './hooks/useWorkspaceDragImport';
import type { WorkspaceProps } from './types';
import { extractNodeData, extractNodeKey, findNodeByKey, getTargetFolderPath } from './utils/treeHelpers';

const ChatWorkspace: React.FC<WorkspaceProps> = ({ conversation_id, workspace, eventPrefix = 'gemini', messageApi: externalMessageApi }) => {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();

  // Message API setup
  const [internalMessageApi, messageContext] = Message.useMessage();
  const messageApi = externalMessageApi ?? internalMessageApi;
  const shouldRenderLocalMessageContext = !externalMessageApi;

  // Search state
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(true);
  const searchInputRef = useRef<RefInputType | null>(null);

  // Initialize all hooks
  const treeHook = useWorkspaceTree({ workspace, conversation_id, eventPrefix });
  const modalsHook = useWorkspaceModals();
  const pasteHook = useWorkspacePaste({
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
  });
  useEffect(() => {
    if (!showSearch) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [showSearch]);

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

  // Debounced search handler
  const onSearch = useDebounce(
    (value: string) => {
      void treeHook.loadWorkspace(workspace, value).then((files) => {
        setShowSearch(files.length > 0 && files[0]?.children?.length > 0);
      });
    },
    200,
    [workspace, treeHook.loadWorkspace]
  );

  // Context menu calculations
  const hasOriginalFiles = treeHook.files.length > 0 && treeHook.files[0]?.children?.length > 0;
  const normalizedWorkspaceName = workspace.toLowerCase();
  const rootName = treeHook.files[0]?.name?.toLowerCase() ?? '';
  const containsTempMarker = (value: string) => value.includes('codex-temp-') || value.includes('gemini-temp-');
  const shouldFlattenRoot = treeHook.files.length === 1 && (treeHook.files[0]?.children?.length ?? 0) > 0 && (containsTempMarker(rootName) || containsTempMarker(normalizedWorkspaceName));
  // 当自动创建的临时目录只有一层时，隐藏根目录直接展示子文件
  // Hide auto-generated codex/gemini temp root folders and show children directly
  const treeData = shouldFlattenRoot ? (treeHook.files[0]?.children ?? []) : treeHook.files;
  let contextMenuStyle: React.CSSProperties | undefined;
  if (modalsHook.contextMenu.visible) {
    let x = modalsHook.contextMenu.x;
    let y = modalsHook.contextMenu.y;
    if (typeof window !== 'undefined') {
      x = Math.min(x, window.innerWidth - 220);
      y = Math.min(y, window.innerHeight - 220);
    }
    contextMenuStyle = { top: y, left: x };
  }

  const contextMenuNode = modalsHook.contextMenu.node;
  const isContextMenuNodeFile = !!contextMenuNode?.isFile;
  const isContextMenuNodeRoot = !!contextMenuNode && (!contextMenuNode.relativePath || contextMenuNode.relativePath === '');

  // Check if file supports preview
  const isPreviewSupported = (() => {
    if (!contextMenuNode?.isFile || !contextMenuNode.name) return false;
    const ext = contextMenuNode.name.toLowerCase().split('.').pop() || '';
    const supportedExts = [
      // Markdown formats
      'md',
      'markdown',
      // Diff formats
      'diff',
      'patch',
      // PDF format
      'pdf',
      // PPT formats
      'ppt',
      'pptx',
      'odp',
      // Word formats
      'doc',
      'docx',
      'odt',
      // Excel formats
      'xls',
      'xlsx',
      'ods',
      'csv',
      // HTML formats
      'html',
      'htm',
      // Code formats
      'js',
      'ts',
      'tsx',
      'jsx',
      'py',
      'java',
      'go',
      'rs',
      'c',
      'cpp',
      'h',
      'hpp',
      'css',
      'scss',
      'json',
      'xml',
      'yaml',
      'yml',
      // Image formats
      'png',
      'jpg',
      'jpeg',
      'gif',
      'bmp',
      'webp',
      'svg',
      'ico',
      'tif',
      'tiff',
      'avif',
    ];
    return supportedExts.includes(ext);
  })();

  const menuButtonBase = 'w-full flex items-center gap-8px px-14px py-6px text-13px text-left text-t-primary rounded-md transition-colors duration-150 hover:bg-2 border-none bg-transparent appearance-none focus:outline-none focus-visible:outline-none';
  const menuButtonDisabled = 'opacity-40 cursor-not-allowed hover:bg-transparent';

  // Get target folder path for paste confirm modal
  const targetFolderPathForModal = getTargetFolderPath(treeHook.selectedNodeRef.current, treeHook.selected, treeHook.files, workspace);

  return (
    <>
      {shouldRenderLocalMessageContext && messageContext}
      <div
        className='size-full flex flex-col relative'
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
              <div className='flex items-center justify-center w-48px h-48px rounded-full' style={{ backgroundColor: 'rgb(var(--primary-1))' }}>
                <FileText theme='outline' size='24' fill='rgb(var(--primary-6))' />
              </div>
              <div>
                <div className='text-16px font-semibold mb-4px'>{t('conversation.workspace.pasteConfirm_title')}</div>
                <div className='text-13px' style={{ color: 'var(--color-text-3)' }}>
                  {modalsHook.pasteConfirm.filesToPaste.length > 1 ? t('conversation.workspace.pasteConfirm_multipleFiles', { count: modalsHook.pasteConfirm.filesToPaste.length }) : t('conversation.workspace.pasteConfirm_title')}
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
              <Checkbox checked={modalsHook.pasteConfirm.doNotAsk} onChange={(v) => modalsHook.setPasteConfirm((prev) => ({ ...prev, doNotAsk: v }))}>
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
        <Modal visible={modalsHook.renameModal.visible} title={t('conversation.workspace.contextMenu.renameTitle')} onCancel={modalsHook.closeRenameModal} onOk={fileOpsHook.handleRenameConfirm} okText={t('common.confirm')} cancelText={t('common.cancel')} confirmLoading={modalsHook.renameLoading} style={{ borderRadius: '12px' }} alignCenter getPopupContainer={() => document.body}>
          <Input autoFocus value={modalsHook.renameModal.value} onChange={(value) => modalsHook.setRenameModal((prev) => ({ ...prev, value }))} onPressEnter={fileOpsHook.handleRenameConfirm} placeholder={t('conversation.workspace.contextMenu.renamePlaceholder')} />
        </Modal>

        {/* Delete Modal */}
        <Modal visible={modalsHook.deleteModal.visible} title={t('conversation.workspace.contextMenu.deleteTitle')} onCancel={modalsHook.closeDeleteModal} onOk={fileOpsHook.handleDeleteConfirm} okText={t('common.confirm')} cancelText={t('common.cancel')} confirmLoading={modalsHook.deleteModal.loading} style={{ borderRadius: '12px' }} alignCenter getPopupContainer={() => document.body}>
          <div className='text-14px text-t-secondary'>{t('conversation.workspace.contextMenu.deleteConfirm')}</div>
        </Modal>

        {/* Toolbar */}
        <div className='px-16px pb-8px'>
          <div className='flex items-center justify-start gap-8px'>
            <span className='font-bold text-14px text-t-primary'>{t('common.file')}</span>
            <div className='flex items-center gap-8px'>
              <Tooltip content={t('conversation.workspace.addFile')}>
                <span>
                  <FileAddition className='cursor-pointer flex' theme='outline' size='16' fill={iconColors.secondary} onClick={pasteHook.handleAddFiles} />
                </span>
              </Tooltip>
              <Tooltip content={t('conversation.workspace.refresh')}>
                <span>
                  <Refresh className={treeHook.loading ? 'loading lh-[1] flex cursor-pointer' : 'flex cursor-pointer'} theme='outline' size='16' fill={iconColors.secondary} onClick={() => treeHook.refreshWorkspace()} />
                </span>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Search Input */}
        {(showSearch || searchText) && (
          <div className='px-16px pb-8px'>
            <Input
              className='w-full'
              ref={searchInputRef}
              placeholder={t('conversation.workspace.searchPlaceholder')}
              value={searchText}
              onChange={(value) => {
                setSearchText(value);
                onSearch(value);
              }}
              allowClear
              prefix={<Search theme='outline' size='14' fill={iconColors.primary} />}
            />
          </div>
        )}

        {/* Main content area */}
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
                <div className='h-1px bg-3 my-2px'></div>
                <button
                  type='button'
                  className={menuButtonBase}
                  onClick={() => {
                    fileOpsHook.handleAddToChat(contextMenuNode);
                  }}
                >
                  {t('conversation.workspace.contextMenu.addToChat')}
                </button>
              </div>
            </div>
          )}

          {/* Empty state or Tree */}
          {!hasOriginalFiles ? (
            <div className=' flex-1 size-full flex items-center justify-center px-16px box-border'>
              <Empty
                description={
                  <div>
                    <span className='text-t-secondary font-bold text-14px'>{searchText ? t('conversation.workspace.search.empty') : t('conversation.workspace.empty')}</span>
                    <div className='text-t-secondary'>{searchText ? '' : t('conversation.workspace.emptyDescription')}</div>
                  </div>
                }
              />
            </div>
          ) : (
            <Tree
              className={'!px-16px workspace-tree'}
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

                return (
                  <span
                    className='flex items-center gap-4px'
                    style={{ color: 'inherit' }}
                    onDoubleClick={() => {
                      if (isFile) {
                        fileOpsHook.handleAddToChat(node.dataRef as IDirOrFile);
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      treeHook.ensureNodeSelected(node.dataRef as IDirOrFile);
                      modalsHook.setContextMenu({
                        visible: true,
                        x: event.clientX,
                        y: event.clientY,
                        node: node.dataRef as IDirOrFile,
                      });
                    }}
                  >
                    {node.title}
                    {isPasteTarget && <span className='ml-1 text-xs text-blue-700 font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded'>PASTE</span>}
                  </span>
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
                return ipcBridge.conversation.getWorkspace.invoke({ conversation_id, workspace, path }).then((res) => {
                  treeNode.props.dataRef.children = res[0].children;
                  treeHook.setFiles([...treeHook.files]);
                });
              }}
            ></Tree>
          )}
        </FlexFullContainer>
      </div>
    </>
  );
};

export default ChatWorkspace;
