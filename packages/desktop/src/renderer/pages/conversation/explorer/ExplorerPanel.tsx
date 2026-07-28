/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stage-2/3 exploration panel: binds the explorer store's projected tree to an
 * arco `Tree`. Expand state is controlled from the store (`expandedKeys`), lazy
 * expansion drives subscribe/unsubscribe, and each root row carries its
 * `runtime_status` (greyed + caution icon when unreachable). Attached roots get
 * a right-click "Remove from project" action; the workspace root is immutable.
 */

import { Dropdown, Menu, Tree } from '@arco-design/web-react';
import type { TreeProps } from '@arco-design/web-react';
import { Caution } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// File-tree icons (VSCode "vscode-icons" theme), now owned by the explorer.
import FileTypeIcon from './fileIcon/FileTypeIcon';

import { getFilesFromDropEvent } from '@/renderer/services/FileService';
import type { RootRef, TreeNode } from './explorerModel';
import { canRemoveRoot, keyToRef, parentRel } from './explorerModel';
import { openProject, select, setExpandedKeys } from './explorerStore';
import { initExplorerRuntime } from './monitorTransport';
import { useExplorerView } from './useExplorerView';

export type ExplorerPanelProps = {
  projectId: string;
  roots: RootRef[];
  /** pe_id of the workspace root — its remove action is disabled (immutable). */
  workspacePeId?: string;
  /** Remove an attached root from the project. Omit to disable the action. */
  onRemoveRoot?: (peId: string) => void;
  /** Open a file (leaf) in the preview panel. Called when a file node is selected. */
  onOpenFile?: (peId: string, relativePath: string) => void;
  /** File operations (A) — parity with the legacy tree: rename + delete only.
   * Omit to hide the corresponding context-menu item. */
  onRename?: (peId: string, relativePath: string, name: string) => void;
  onDelete?: (peId: string, relativePath: string, name: string) => void;
  /** Add a file/folder node to the active conversation's send box. Omit to hide
   * the item (e.g. no single active conversation, as on the team route). */
  onAddToChat?: (peId: string, relativePath: string, name: string, isFile: boolean) => void;
  /** Import OS files (A-paste) dropped onto a node into that node's directory
   * (a file node routes to its parent dir). `filePaths` are absolute OS paths
   * (Electron only — empty in the browser, where the drop is ignored). Omit to
   * disable drop import. */
  onImportFiles?: (targetPeId: string, targetRelativePath: string, filePaths: string[]) => void;
};

export const ExplorerPanel: React.FC<ExplorerPanelProps> = ({
  projectId,
  roots,
  workspacePeId,
  onRemoveRoot,
  onOpenFile,
  onRename,
  onDelete,
  onAddToChat,
  onImportFiles,
}) => {
  const view = useExplorerView();
  const { t } = useTranslation();
  // Key of the node currently under an OS-file drag (for the drop highlight).
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Wire the WS runtime once.
  useEffect(() => {
    initExplorerRuntime();
  }, []);

  // (Re)open the project when it changes. openProject is guarded: same
  // project+roots is a cheap no-op (survives conversation-switch remounts).
  useEffect(() => {
    openProject(projectId, roots);
  }, [projectId, roots]);

  const handleExpand: TreeProps['onExpand'] = (expandedKeys) => {
    setExpandedKeys(expandedKeys.map(String));
  };

  // arco treats a non-leaf node with no `children` array as a leaf UNLESS an
  // async `loadMore` is provided. Our dirs are lazy (children arrive via WS after
  // expand), so without loadMore every unexpanded dir renders as an un-expandable
  // leaf. loadMore makes arco honor `isLeaf: false` and show the expander; it also
  // drives the store expand itself (arco does not reliably fire onExpand for a
  // loadMore node), so the key is added here → subscribe → snapshot → the reactive
  // treeData fills the node's children.
  const handleLoadMore: TreeProps['loadMore'] = (node) => {
    const n = node as unknown as { props?: { dataRef?: { key?: string }; _key?: string } };
    const key = n.props?.dataRef?.key ?? n.props?._key;
    if (key) setExpandedKeys(Array.from(new Set([...view.expanded, String(key)])));
    return Promise.resolve();
  };

  const handleSelect: TreeProps['onSelect'] = (selectedKeys, extra) => {
    const key = selectedKeys.length > 0 ? String(selectedKeys[0]) : null;
    select(key);
    // Selecting a file (leaf) opens it in the preview panel.
    const data = extra?.node?.props?.dataRef as TreeNode | undefined;
    if (key && data?.isLeaf && onOpenFile) {
      const ref = keyToRef(key);
      onOpenFile(ref.pe_id, ref.relative_path);
    }
  };

  const renderTitle = useCallback<NonNullable<TreeProps['renderTitle']>>(
    (node) => {
      const data = node.dataRef as TreeNode | undefined;
      const status = data?.runtimeStatus;
      const degraded = status !== undefined && status !== 'available';
      const key = String(node.dataRef?.key ?? '');
      const name = String(node.title);
      const isFile = Boolean(data?.isLeaf);
      const isExpanded = view.expanded.includes(key);

      // Right-click file operations, mirroring the legacy tree: non-root nodes
      // get rename + delete; pe roots (role set) get "remove from project" (they
      // are pe bindings, not renamed/deleted in place). Matches old-tree parity —
      // no new-file/new-folder (the old tree never had those).
      const ref = keyToRef(key);
      const peId = ref.pe_id;
      const rel = ref.relative_path;

      // A-paste drop: files land in this node's dir (a file node routes to its
      // parent). Handlers only wire up when import is enabled; the highlight
      // tracks the node currently under the drag.
      const dropTargetRel = isFile ? parentRel(rel) : rel;
      const dropProps = onImportFiles
        ? {
            onDragOver: (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragOverKey !== key) setDragOverKey(key);
            },
            onDragLeave: () => setDragOverKey((prev) => (prev === key ? null : prev)),
            onDrop: (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverKey(null);
              const paths = getFilesFromDropEvent(e.nativeEvent)
                .map((f) => f.path)
                .filter(Boolean);
              if (paths.length) onImportFiles(peId, dropTargetRel, paths);
            },
          }
        : {};

      const title = (
        <span
          data-runtime-status={status}
          data-drop-target={dragOverKey === key || undefined}
          className={`flex items-center gap-4px min-w-0${degraded ? ' text-t-secondary' : ''}${dragOverKey === key ? ' bg-aou-2 rd-4px' : ''}`}
          {...dropProps}
        >
          <FileTypeIcon node={{ name, relativePath: keyToRef(key).relative_path, isFile }} expanded={isExpanded} />
          <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{name}</span>
          {degraded && <Caution theme='outline' size='14' className='flex-shrink-0' />}
        </span>
      );
      const isRoot = Boolean(data?.role);
      const removable = isRoot && data?.role ? canRemoveRoot(data.role, peId, workspacePeId) : false;

      // Root nodes only expose "remove from project" + (when available) "add to
      // chat". Non-root nodes get add-to-chat + rename/delete. If a node would
      // have no menu items at all, render the bare title (no dropdown).
      const hasMenu = onAddToChat || (isRoot ? onRemoveRoot : onRename || onDelete);
      if (!hasMenu) return title;

      const onClickMenuItem = (menuKey: string) => {
        if (menuKey === 'addToChat') onAddToChat?.(peId, rel, name, isFile);
        else if (menuKey === 'rename') onRename?.(peId, rel, name);
        else if (menuKey === 'delete') onDelete?.(peId, rel, name);
        else if (menuKey === 'remove' && removable) onRemoveRoot?.(peId);
      };

      return (
        <Dropdown
          trigger='contextMenu'
          position='bl'
          droplist={
            // Stop menu-item clicks from bubbling. arco renders the droplist as a
            // React child of this Dropdown, which arco itself nests inside the
            // tree node's onClick(select) span — so a menu click would otherwise
            // bubble (React portals propagate through the React tree) into the
            // node's select handler, which opens the preview. Halting here keeps
            // context-menu actions from selecting the node / opening preview.
            <div onClick={(e) => e.stopPropagation()}>
              <Menu onClickMenuItem={onClickMenuItem}>
                {onAddToChat && (
                  <Menu.Item key='addToChat'>{t('conversation.explorer.contextMenu.addToChat')}</Menu.Item>
                )}
                {!isRoot && onRename && (
                  <Menu.Item key='rename'>{t('conversation.explorer.contextMenu.rename')}</Menu.Item>
                )}
                {!isRoot && onDelete && <Menu.Item key='delete'>{t('common.delete')}</Menu.Item>}
                {isRoot && onRemoveRoot && (
                  <Menu.Item key='remove' disabled={!removable}>
                    {t('conversation.explorer.removeFolder')}
                  </Menu.Item>
                )}
              </Menu>
            </div>
          }
        >
          {title}
        </Dropdown>
      );
    },
    [onRemoveRoot, onRename, onDelete, onAddToChat, onImportFiles, dragOverKey, workspacePeId, t, view.expanded]
  );

  // Container-level import target: the workspace root ('' rel). Node drops set
  // their own precise target and stopPropagation, so this only fires for drops on
  // empty space and for keyboard paste (Cmd/Ctrl+V) while the tree has focus.
  const importToWorkspaceRoot = (filePaths: string[]): void => {
    if (onImportFiles && workspacePeId && filePaths.length) onImportFiles(workspacePeId, '', filePaths);
  };

  const containerProps = onImportFiles
    ? {
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          importToWorkspaceRoot(
            getFilesFromDropEvent(e.nativeEvent)
              .map((f) => f.path)
              .filter(Boolean)
          );
        },
        onPaste: (e: React.ClipboardEvent) => {
          const files = e.clipboardData?.files;
          if (!files?.length) return;
          const paths: string[] = [];
          for (let i = 0; i < files.length; i += 1) {
            const p = (files[i] as File & { path?: string }).path;
            if (p) paths.push(p);
          }
          if (paths.length) importToWorkspaceRoot(paths);
        },
      }
    : {};

  return (
    <div className='h-full' tabIndex={-1} {...containerProps}>
      <Tree
        treeData={view.treeData as TreeProps['treeData']}
        expandedKeys={view.expanded}
        selectedKeys={view.selected ? [view.selected] : []}
        loadMore={handleLoadMore}
        onExpand={handleExpand}
        onSelect={handleSelect}
        renderTitle={renderTitle}
      />
    </div>
  );
};
