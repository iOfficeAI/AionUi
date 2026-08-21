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

import { Button, Dropdown, Menu, Tree } from '@arco-design/web-react';
import { isElectronDesktop } from '@/renderer/utils/platform';
import type { TreeProps } from '@arco-design/web-react';
import { Caution, MoreOne } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// File-tree icons (catppuccin file-icon theme), now owned by the explorer.
import FileTypeIcon from './fileIcon/FileTypeIcon';

import { getFilesFromDropEvent } from '@/renderer/services/FileService';
import { isMacOS } from '@/renderer/utils/platform';
import type { DragPeRef, ExplorerMenuCaps, ExplorerMenuItemKey, RootRef, TransferOp, TreeNode } from './explorerModel';
import {
  PE_REF_DRAG_MIME,
  canRemoveRoot,
  explorerContextMenuSections,
  isCopyModifierPressed,
  isTransferAllowed,
  keyToRef,
  parentRel,
  parsePeRef,
  resolveTransferOp,
  serializePeRef,
} from './explorerModel';
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
  /** Manually refresh a pe root's subtree — re-fetch its visible directories'
   * listings (and retry an unreachable root). Root-only; omit to hide the item. */
  onRefreshRoot?: (peId: string) => void;
  /** Open a file (leaf) in the preview panel. Called when a file node is selected. */
  onOpenFile?: (peId: string, relativePath: string) => void;
  /** File operations (A): rename + delete on an entry, create-file / create-dir
   * inside a directory. Omit to hide the corresponding context-menu item. */
  onRename?: (peId: string, relativePath: string, name: string) => void;
  onDelete?: (peId: string, relativePath: string, name: string) => void;
  /** Create a new empty file inside the directory `dirRelativePath` (a pe root
   * uses `''`). The name is collected in a dialog by the handler. Only offered on
   * directory / root nodes. Omit to hide the item. */
  onNewFile?: (peId: string, dirRelativePath: string) => void;
  /** Create a new sub-directory inside `dirRelativePath`. Same gating and dialog
   * flow as `onNewFile`. Omit to hide the item. */
  onNewDir?: (peId: string, dirRelativePath: string) => void;
  /** Add a file/folder node to the active conversation's send box. Omit to hide
   * the item (e.g. no single active conversation, as on the team route). */
  onAddToChat?: (peId: string, relativePath: string, name: string, isFile: boolean) => void;
  /** Reveal the node in the OS file manager (Finder/Explorer). The handler
   * resolves the pe-ref to an absolute path backend-side; the item is only shown
   * on Electron desktop (WebUI has no local shell / may be remote). Omit to hide. */
  onRevealInFolder?: (peId: string, relativePath: string) => void;
  /** Copy the node's path relative to its owning pe root to the clipboard. Pure
   * clipboard (no OS shell / no absolute path), so it works for files and folders
   * on both Electron and WebUI. Omit to hide the item. */
  onCopyRelativePath?: (peId: string, relativePath: string, name: string) => void;
  /** Copy the node's ABSOLUTE device path to the clipboard. The absolute path is
   * resolved backend-side (the front end never holds it), so this is Electron
   * desktop-only — a remote WebUI must not expose it. Omit to hide the item. */
  onCopyAbsolutePath?: (peId: string, relativePath: string) => void;
  /** Import OS files (A-paste) dropped onto a node into that node's directory
   * (a file node routes to its parent dir). `filePaths` are absolute OS paths
   * (Electron only — empty in the browser, where the drop is ignored). Omit to
   * disable drop import. */
  onImportFiles?: (targetPeId: string, targetRelativePath: string, filePaths: string[]) => void;
  /** Copy/move a tree node (source B/C) dropped onto a directory node. `source`
   * is the dragged node's identity; the drop lands in `targetRelativePath` under
   * `targetPeId` (a file target routes to its parent dir). `op` is resolved from
   * same-pe/cross-pe + the modifier key. Omit to disable internal drag transfer. */
  onTransfer?: (source: DragPeRef, targetPeId: string, targetRelativePath: string, op: TransferOp) => void;
};

export const ExplorerPanel: React.FC<ExplorerPanelProps> = ({
  projectId,
  roots,
  workspacePeId,
  onRemoveRoot,
  onRefreshRoot,
  onOpenFile,
  onRename,
  onDelete,
  onNewFile,
  onNewDir,
  onAddToChat,
  onRevealInFolder,
  onCopyRelativePath,
  onCopyAbsolutePath,
  onImportFiles,
  onTransfer,
}) => {
  const view = useExplorerView();
  const { t } = useTranslation();
  // Key of the node currently under a drag (for the drop highlight).
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  // The node being dragged internally (set on dragStart, cleared on dragEnd).
  // dragover cannot read the drag data (only drop can), so we stash the source
  // here to compute the op + guard the drop cursor while hovering. Internal
  // drags are same-window, so a ref is sufficient (no cross-window handoff).
  const dragSourceRef = useRef<DragPeRef | null>(null);
  // Scroll container + the last selection we already scrolled to (so we scroll
  // once when a selection's node first appears, not on every tree delta).
  const containerRef = useRef<HTMLDivElement>(null);
  const scrolledSelectionRef = useRef<string | null>(null);

  // Wire the WS runtime once.
  useEffect(() => {
    initExplorerRuntime();
  }, []);

  // Bring the selected node into view — e.g. after a search reveal expands a
  // deep path, the newly-selected file may be off-screen. Runs when the
  // selection changes and again as treeData fills in (reveal subscribes async),
  // scrolling once the selected node is actually in the DOM.
  // NOTE: the tree is not virtualized, so every node is a real DOM element and
  // scrollIntoView works. If virtual scrolling is enabled later, switch to
  // arco's scrollTo API (the off-screen node won't be in the DOM).
  useEffect(() => {
    const key = view.selected;
    if (!key) {
      scrolledSelectionRef.current = null;
      return;
    }
    if (scrolledSelectionRef.current === key) return;
    const node = containerRef.current?.querySelector('.arco-tree-node-selected');
    if (node) {
      node.scrollIntoView({ block: 'nearest' });
      scrolledSelectionRef.current = key;
    }
  }, [view.selected, view.treeData]);

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
    // Only add a key that is NOT already expanded. arco fires loadMore for any
    // non-leaf node lacking a `children` array — which includes an already-expanded
    // dir whose listing has not arrived yet (buildChildren returns undefined until
    // the WS snapshot lands). Re-adding an already-expanded key would still build a
    // fresh expanded set → commit → re-render → arco re-fires loadMore → an unbounded
    // self-triggering loop ("Maximum update depth exceeded"). Skipping the no-op
    // breaks the cycle: an expand only ever moves a key from absent to present.
    if (key && !view.expanded.includes(String(key))) {
      setExpandedKeys([...view.expanded, String(key)]);
    }
    return Promise.resolve();
  };

  const handleSelect: TreeProps['onSelect'] = (selectedKeys, extra) => {
    const key = selectedKeys.length > 0 ? String(selectedKeys[0]) : null;
    select(key);
    // Selecting a file (leaf) opens it in the preview panel. Folders are expanded
    // by arco itself via `actionOnClick` on the <Tree> below — not here, so a row
    // click is never toggled twice.
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

      // Right-click file operations: non-root nodes get rename + delete; pe roots
      // (role set) get "remove from project" (they are pe bindings, not
      // renamed/deleted in place). Any directory node — a real dir or a pe root —
      // additionally gets new-file / new-folder, which create inside that node.
      const ref = keyToRef(key);
      const peId = ref.pe_id;
      const rel = ref.relative_path;
      const isRoot = Boolean(data?.role);

      // Drop target: a dir node accepts into itself; a file node routes to its
      // parent dir (same rule for OS-file import and internal drag transfer).
      const dropTargetRel = isFile ? parentRel(rel) : rel;

      // Internal drag source (B/C): every non-root node is draggable, carrying
      // its identity on a custom MIME so a drop can tell it apart from an OS-file
      // drop (which carries `Files`). Pe roots are bindings, not entries — not
      // draggable.
      const dragProps =
        onTransfer && !isRoot
          ? {
              draggable: true,
              onDragStart: (e: React.DragEvent) => {
                const payload: DragPeRef = { pe_id: peId, relative_path: rel, name, isDir: !isFile };
                e.dataTransfer.setData(PE_REF_DRAG_MIME, serializePeRef(payload));
                e.dataTransfer.effectAllowed = 'copyMove';
                dragSourceRef.current = payload;
              },
              onDragEnd: () => {
                dragSourceRef.current = null;
                setDragOverKey(null);
              },
            }
          : {};

      // Drop handling: an internal drag (source stashed in dragSourceRef) resolves
      // copy/move by same-pe + modifier and is guarded (no drop into self/own
      // subtree, no move into own parent); otherwise fall back to OS-file import.
      // The highlight tracks the hovered node only while the drop is legal.
      const acceptsDrop = Boolean(onImportFiles || onTransfer);
      const dropProps = acceptsDrop
        ? {
            onDragOver: (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              const src = dragSourceRef.current;
              if (src && onTransfer) {
                const target = { pe_id: peId, relative_path: dropTargetRel };
                const op = resolveTransferOp(src.pe_id === peId, isCopyModifierPressed(e, isMacOS()));
                const allowed = isTransferAllowed(src, target, op);
                e.dataTransfer.dropEffect = allowed ? op : 'none';
                setDragOverKey(allowed ? key : null);
              } else if (onImportFiles) {
                e.dataTransfer.dropEffect = 'copy';
                if (dragOverKey !== key) setDragOverKey(key);
              }
            },
            onDragLeave: () => setDragOverKey((prev) => (prev === key ? null : prev)),
            onDrop: (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverKey(null);
              const raw = e.dataTransfer.getData(PE_REF_DRAG_MIME);
              const src = raw ? parsePeRef(raw) : null;
              if (src && onTransfer) {
                const target = { pe_id: peId, relative_path: dropTargetRel };
                const op = resolveTransferOp(src.pe_id === peId, isCopyModifierPressed(e, isMacOS()));
                if (isTransferAllowed(src, target, op)) onTransfer(src, peId, dropTargetRel, op);
                return;
              }
              if (onImportFiles) {
                const paths = getFilesFromDropEvent(e.nativeEvent)
                  .map((f) => f.path)
                  .filter(Boolean);
                if (paths.length) onImportFiles(peId, dropTargetRel, paths);
              }
            },
          }
        : {};

      // `w-full` pairs with the tree's `blockNode`: blockNode makes the arco title
      // wrapper span the full row, and this fills that wrapper so the right-click
      // context menu (its <Dropdown trigger='contextMenu'> is attached to this span)
      // and the drop-target highlight both cover the whole row, not just the label.
      const title = (
        <span
          data-runtime-status={status}
          data-drop-target={dragOverKey === key || undefined}
          className={`flex items-center gap-4px min-w-0 w-full${degraded ? ' text-t-secondary' : ''}${dragOverKey === key ? ' bg-aou-2 rd-4px' : ''}`}
          {...dragProps}
          {...dropProps}
        >
          <FileTypeIcon node={{ name, relativePath: keyToRef(key).relative_path, isFile }} expanded={isExpanded} />
          {/* File names are code-like; bidi-neutral leading dots (.claude) must not flip under RTL. */}
          <span dir='ltr' className='overflow-hidden text-ellipsis whitespace-nowrap'>
            {name}
          </span>
          {degraded && <Caution theme='outline' size='14' className='flex-shrink-0' />}
        </span>
      );
      const removable = isRoot && data?.role ? canRemoveRoot(data.role, peId, workspacePeId) : false;

      // The menu is grouped into three ordered sections drawn with a divider line
      // between them (see explorerContextMenuSections): (1) add-to-chat,
      // (2) locate / copy paths, (3) create / rename / delete / remove-from-project.
      // Which actions are enabled depends on the node and the runtime:
      //  - Reveal-in-folder + copy-absolute-path are Electron-only: they need a
      //    local OS shell / resolve the absolute path backend-side, which must not
      //    be exposed to a remote WebUI.
      //  - New-file / new-dir create inside a directory, so only on directory nodes
      //    (a real dir or a pe root), never on a file leaf.
      //  - Rename / delete are for non-root entries; a pe root instead offers
      //    remove-from-project (disabled for the immutable workspace root).
      // If no action is enabled the node renders its bare title (no dropdown).
      const canReveal = Boolean(onRevealInFolder) && isElectronDesktop();
      const canCopyAbsolutePath = Boolean(onCopyAbsolutePath) && isElectronDesktop();
      const showWebActions = !isElectronDesktop();
      const menuCaps: ExplorerMenuCaps = {
        addToChat: Boolean(onAddToChat),
        revealInFolder: canReveal,
        copyRelativePath: Boolean(onCopyRelativePath),
        copyAbsolutePath: canCopyAbsolutePath,
        // Refresh reloads a pe root's listings, so it is offered only on root nodes.
        refresh: isRoot && Boolean(onRefreshRoot),
        newFile: !isFile && Boolean(onNewFile),
        newDir: !isFile && Boolean(onNewDir),
        rename: !isRoot && Boolean(onRename),
        delete: !isRoot && Boolean(onDelete),
        remove: isRoot && Boolean(onRemoveRoot),
      };
      const menuSections = explorerContextMenuSections(menuCaps);
      if (menuSections.length === 0) return title;

      // Stop menu-item clicks from bubbling. arco renders the droplist as a React
      // child of this Dropdown, which arco itself nests inside the tree node's
      // onClick(select) span — so a menu click would otherwise bubble (React
      // portals propagate through the React tree) into the node's select handler,
      // which opens the preview. Halting here keeps context-menu actions from
      // selecting the node / opening preview.
      //
      // This must happen inside onClickMenuItem rather than in a wrapper <div>
      // around <Menu>: arco only applies its compact dropdown-menu styling when
      // <Menu> is a *direct* child of the droplist. Any wrapper element makes it
      // fall back to the tall sidebar-navigation Menu look (40px rows).
      const onClickMenuItem = (menuKey: string, event: { stopPropagation?: () => void }) => {
        event?.stopPropagation?.();
        if (menuKey === 'addToChat') onAddToChat?.(peId, rel, name, isFile);
        else if (menuKey === 'newFile') onNewFile?.(peId, rel);
        else if (menuKey === 'newDir') onNewDir?.(peId, rel);
        else if (menuKey === 'rename') onRename?.(peId, rel, name);
        else if (menuKey === 'delete') onDelete?.(peId, rel, name);
        else if (menuKey === 'remove' && removable) onRemoveRoot?.(peId);
        else if (menuKey === 'revealInFolder') onRevealInFolder?.(peId, rel);
        else if (menuKey === 'copyRelativePath') onCopyRelativePath?.(peId, rel, name);
        else if (menuKey === 'copyAbsolutePath') onCopyAbsolutePath?.(peId, rel);
        else if (menuKey === 'refresh') onRefreshRoot?.(peId);
      };

      const renderMenuItem = (key: ExplorerMenuItemKey): React.ReactNode => {
        switch (key) {
          case 'addToChat':
            return <Menu.Item key='addToChat'>{t('conversation.explorer.contextMenu.addToChat')}</Menu.Item>;
          case 'revealInFolder':
            return <Menu.Item key='revealInFolder'>{t('conversation.workspace.contextMenu.openLocation')}</Menu.Item>;
          case 'copyRelativePath':
            return (
              <Menu.Item key='copyRelativePath'>{t('conversation.explorer.contextMenu.copyRelativePath')}</Menu.Item>
            );
          case 'copyAbsolutePath':
            return (
              <Menu.Item key='copyAbsolutePath'>{t('conversation.explorer.contextMenu.copyAbsolutePath')}</Menu.Item>
            );
          case 'refresh':
            return <Menu.Item key='refresh'>{t('conversation.explorer.contextMenu.refresh')}</Menu.Item>;
          case 'newFile':
            return <Menu.Item key='newFile'>{t('conversation.explorer.contextMenu.newFile')}</Menu.Item>;
          case 'newDir':
            return <Menu.Item key='newDir'>{t('conversation.explorer.contextMenu.newDir')}</Menu.Item>;
          case 'rename':
            return <Menu.Item key='rename'>{t('conversation.explorer.contextMenu.rename')}</Menu.Item>;
          case 'delete':
            return <Menu.Item key='delete'>{t('common.delete')}</Menu.Item>;
          case 'remove':
            return (
              <Menu.Item key='remove' disabled={!removable}>
                {t('conversation.explorer.removeFolder')}
              </Menu.Item>
            );
        }
      };

      const renderMenu = () => (
        // `explorer-context-menu` opts this menu out of Arco's 200px dropdown
        // height cap (arco-override.css) so all items show without a scrollbar.
        // Sections are separated by a plain `<div role='separator'>`: arco passes
        // non-menu HTML children through untouched, and flatMenuGroup ignores them,
        // so the divider never disturbs keyboard nav or first/last-child styling.
        <Menu className='explorer-context-menu' onClickMenuItem={onClickMenuItem}>
          {menuSections.flatMap((keys, section) => {
            const items = keys.map(renderMenuItem);
            if (section === 0) return items;
            return [
              <div
                key={`sep-${section}`}
                className='explorer-context-menu-divider'
                role='separator'
                aria-hidden='true'
              />,
              ...items,
            ];
          })}
        </Menu>
      );

      const rowTitle = showWebActions ? (
        <span className='flex items-center min-w-0 w-full'>
          <span className='min-w-0 flex-1'>{title}</span>
          <span onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
            <Dropdown trigger='click' position='br' droplist={renderMenu()}>
              <Button
                type='text'
                size='mini'
                className='flex-shrink-0'
                aria-label={t('common.more')}
                icon={<MoreOne theme='outline' size='16' />}
              />
            </Dropdown>
          </span>
        </span>
      ) : (
        title
      );

      return (
        <Dropdown trigger='contextMenu' position='bl' droplist={renderMenu()}>
          {rowTitle}
        </Dropdown>
      );
    },
    [
      onRemoveRoot,
      onRefreshRoot,
      onRename,
      onDelete,
      onNewFile,
      onNewDir,
      onAddToChat,
      onImportFiles,
      onTransfer,
      dragOverKey,
      workspacePeId,
      t,
      view.expanded,
    ]
  );

  // Container-level import target: the workspace root ('' rel). Node drops set
  // their own precise target and stopPropagation, so this only fires for drops on
  // empty space and for keyboard paste (Cmd/Ctrl+V) while the tree has focus.
  const importToWorkspaceRoot = (filePaths: string[]): void => {
    if (onImportFiles && workspacePeId && filePaths.length) onImportFiles(workspacePeId, '', filePaths);
  };

  // Internal drag dropped on empty space (not on a node — node drops
  // stopPropagation) lands at the workspace root, resolving copy/move + guarding
  // exactly like a node drop.
  const transferToWorkspaceRoot = (src: DragPeRef, op: TransferOp): void => {
    if (!onTransfer || !workspacePeId) return;
    const target = { pe_id: workspacePeId, relative_path: '' };
    if (isTransferAllowed(src, target, op)) onTransfer(src, workspacePeId, '', op);
  };

  const containerProps =
    onImportFiles || onTransfer
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            const src = dragSourceRef.current;
            if (src && onTransfer && workspacePeId) {
              const op = resolveTransferOp(src.pe_id === workspacePeId, isCopyModifierPressed(e, isMacOS()));
              e.dataTransfer.dropEffect = isTransferAllowed(src, { pe_id: workspacePeId, relative_path: '' }, op)
                ? op
                : 'none';
            }
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData(PE_REF_DRAG_MIME);
            const src = raw ? parsePeRef(raw) : null;
            if (src && onTransfer) {
              transferToWorkspaceRoot(
                src,
                resolveTransferOp(src.pe_id === workspacePeId, isCopyModifierPressed(e, isMacOS()))
              );
              return;
            }
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
              // Electron 32+ 移除 File.path，优先走 preload 的 getPathForFile。
              const p = window.electronAPI?.getPathForFile?.(files[i]) || (files[i] as File & { path?: string }).path;
              if (p) paths.push(p);
            }
            if (paths.length) importToWorkspaceRoot(paths);
          },
        }
      : {};

  return (
    <div className='h-full' tabIndex={-1} ref={containerRef} {...containerProps}>
      {/* `workspace-tree` opts into the full-row VSCode-style hover + selected
          backgrounds in arco-override.css (selected = --color-fill-3), so a
          revealed/selected node has a clearly visible highlight. */}
      <Tree
        className='workspace-tree'
        treeData={view.treeData as TreeProps['treeData']}
        expandedKeys={view.expanded}
        selectedKeys={view.selected ? [view.selected] : []}
        /* 让节点标题块（arco 的点击目标 .arco-tree-node-title）铺满整行剩余宽度：
           blockNode 给它加 .arco-tree-node-title-block { flex: 1 }，于是箭头右侧
           那片空白也成为有效点击区域，而不是只有图标+文字那一小段。行的
           hover/选中背景本就画在整行（.arco-tree-node，见 arco-override.css），
           这里补齐的是「可点击/可右键的命中区域」。
           Make the node's title block (arco's click target, .arco-tree-node-title)
           fill the row: blockNode adds .arco-tree-node-title-block { flex: 1 }, so
           the blank space right of the arrow becomes part of the clickable area
           instead of just the icon+label. The full-row hover/selected backgrounds
           already live on .arco-tree-node (arco-override.css); this fills in the
           hit area to match. */
        blockNode
        /* 点一整行就展开/收起文件夹，不必精准点中前面那个小箭头（arco 默认只有
           'select'，所以整行点击此前只会选中、不会展开）。arco 内部对同一次点击只
           走一条展开路径（有 loadMore 且未展开时走 loadMore，否则走 onExpand），
           所以不会重复切换；点箭头本身仍然照旧生效。
           Clicking anywhere on a folder row expands/collapses it, instead of
           requiring a precise hit on the small leading arrow (arco defaults to
           'select' alone, which is why a row click previously only selected).
           Internally arco takes exactly one expand path per click — loadMore when
           children are absent and the node is collapsed, onExpand otherwise — so
           nothing toggles twice, and clicking the arrow still works as before. */
        actionOnClick={['select', 'expand']}
        loadMore={handleLoadMore}
        onExpand={handleExpand}
        onSelect={handleSelect}
        renderTitle={renderTitle}
      />
    </div>
  );
};
