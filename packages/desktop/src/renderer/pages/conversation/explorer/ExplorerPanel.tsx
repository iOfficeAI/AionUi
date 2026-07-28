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
import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// File-tree icons (VSCode "vscode-icons" theme), now owned by the explorer.
import FileTypeIcon from './fileIcon/FileTypeIcon';

import type { RootRef, TreeNode } from './explorerModel';
import { canRemoveRoot, keyToRef } from './explorerModel';
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
};

export const ExplorerPanel: React.FC<ExplorerPanelProps> = ({
  projectId,
  roots,
  workspacePeId,
  onRemoveRoot,
  onOpenFile,
  onRename,
  onDelete,
}) => {
  const view = useExplorerView();
  const { t } = useTranslation();

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
      const title = (
        <span
          data-runtime-status={status}
          className={`flex items-center gap-4px min-w-0${degraded ? ' text-t-secondary' : ''}`}
        >
          <FileTypeIcon node={{ name, relativePath: keyToRef(key).relative_path, isFile }} expanded={isExpanded} />
          <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{name}</span>
          {degraded && <Caution theme='outline' size='14' className='flex-shrink-0' />}
        </span>
      );

      // Right-click file operations, mirroring the legacy tree: non-root nodes
      // get rename + delete; pe roots (role set) get "remove from project" (they
      // are pe bindings, not renamed/deleted in place). Matches old-tree parity —
      // no new-file/new-folder (the old tree never had those).
      const ref = keyToRef(key);
      const peId = ref.pe_id;
      const rel = ref.relative_path;
      const isRoot = Boolean(data?.role);
      const removable = isRoot && data?.role ? canRemoveRoot(data.role, peId, workspacePeId) : false;

      // Root nodes only expose "remove from project"; without that handler there
      // is no menu for them. Non-root nodes always have rename/delete.
      if (isRoot && !onRemoveRoot) return title;

      const onClickMenuItem = (menuKey: string) => {
        if (menuKey === 'rename') onRename?.(peId, rel, name);
        else if (menuKey === 'delete') onDelete?.(peId, rel, name);
        else if (menuKey === 'remove' && removable) onRemoveRoot?.(peId);
      };

      return (
        <Dropdown
          trigger='contextMenu'
          position='bl'
          droplist={
            <Menu onClickMenuItem={onClickMenuItem}>
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
          }
        >
          {title}
        </Dropdown>
      );
    },
    [onRemoveRoot, onRename, onDelete, workspacePeId, t, view.expanded]
  );

  return (
    <Tree
      treeData={view.treeData as TreeProps['treeData']}
      expandedKeys={view.expanded}
      selectedKeys={view.selected ? [view.selected] : []}
      loadMore={handleLoadMore}
      onExpand={handleExpand}
      onSelect={handleSelect}
      renderTitle={renderTitle}
    />
  );
};
