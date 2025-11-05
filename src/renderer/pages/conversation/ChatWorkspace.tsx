/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { usePasteService } from '@/renderer/hooks/usePasteService';
import { iconColors } from '@/renderer/theme/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { removeWorkspaceEntry, renameWorkspaceEntry } from '@/renderer/utils/workspaceFs';
import { Checkbox, Empty, Input, Message, Modal, Tooltip, Tree } from '@arco-design/web-react';
import { FileAddition, Refresh, Search, FileText, FolderOpen } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useDebounce from '../../hooks/useDebounce';
interface WorkspaceProps {
  workspace: string;
  conversation_id: string;
  eventPrefix?: 'gemini' | 'acp' | 'codex';
}

const useLoading = () => {
  const [loading, setLoading] = useState(false);
  const lastLoadingTime = useRef(Date.now());
  const setLoadingHandler = (newState: boolean) => {
    if (newState) {
      lastLoadingTime.current = Date.now();
      setLoading(true);
    } else {
      //@mark 这么做主要是为了让loading的动画保持， 以免出现图标“闪烁”效果
      if (Date.now() - lastLoadingTime.current > 1000) {
        setLoading(false);
      } else {
        setTimeout(() => {
          setLoading(false);
        }, 1000);
      }
    }
  };
  return [loading, setLoadingHandler] as const;
};

const ChatWorkspace: React.FC<WorkspaceProps> = ({ conversation_id, workspace, eventPrefix = 'gemini' }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<IDirOrFile[]>([]);
  const [loading, setLoading] = useLoading();
  const [treeKey, setTreeKey] = useState(Math.random());
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmFileName, setConfirmFileName] = useState('');
  const [confirmFilesToPaste, setConfirmFilesToPaste] = useState<Array<{ path: string; name: string }>>([]);
  const [doNotAsk, setDoNotAsk] = useState(false);
  const [messageApi, messageContext] = Message.useMessage();
  const [pasteTargetFolder, setPasteTargetFolder] = useState<string | null>(null); // 跟踪粘贴目标文件夹 / Track paste target folder
  const selectedNodeRef = useRef<{ relativePath: string; fullPath: string } | null>(null); // 存储最后选中的文件夹节点 / Store the last selected folder node
  const selectedKeysRef = useRef<string[]>([]); // 存储选中的键供 renderTitle 访问 / Store selected keys for renderTitle to access
  // Context menu state for right-click actions (右键菜单状态管理)
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; node: IDirOrFile | null }>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });
  // Rename modal state (重命名弹窗状态)
  const [renameModal, setRenameModal] = useState<{ visible: boolean; value: string; target: IDirOrFile | null }>({
    visible: false,
    value: '',
    target: null,
  });
  const [renameLoading, setRenameLoading] = useState(false);
  // Delete confirmation modal state (删除确认弹窗状态)
  const [deleteModal, setDeleteModal] = useState<{ visible: boolean; target: IDirOrFile | null; loading: boolean }>({
    visible: false,
    target: null,
    loading: false,
  });
  // Detect correct path separator by platform (根据路径判断平台分隔符)
  const getPathSeparator = useCallback((targetPath: string) => {
    return targetPath.includes('\\') ? '\\' : '/';
  }, []);

  const [searchText, setSearchText] = useState('');

  // 在树中查找节点（通过 relativePath）
  // Find node in tree by relativePath
  const findNodeByKey = useCallback((list: IDirOrFile[], key: string): IDirOrFile | null => {
    for (const item of list) {
      if (item.relativePath === key) return item;
      if (item.children && item.children.length > 0) {
        const found = findNodeByKey(item.children, key);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const closeContextMenu = useCallback(() => {
    // Hide context menu if visible (如菜单已显示则关闭)
    setContextMenu((prev) => (prev.visible ? { visible: false, x: 0, y: 0, node: null } : prev));
  }, []);

  const closeRenameModal = useCallback(() => {
    // Reset rename modal state (重置重命名弹窗状态)
    setRenameModal({ visible: false, value: '', target: null });
    setRenameLoading(false);
  }, []);

  const closeDeleteModal = useCallback(() => {
    // Reset delete confirmation modal (重置删除确认弹窗)
    setDeleteModal({ visible: false, target: null, loading: false });
  }, []);

  // 获取目标文件夹路径（从 selectedNodeRef 或 selected keys）
  // Get target folder path from selectedNodeRef or selected keys
  const getTargetFolderPath = useCallback((): { fullPath: string; relativePath: string | null } => {
    // 优先使用 selectedNodeRef
    // Prioritize selectedNodeRef
    if (selectedNodeRef.current) {
      return {
        fullPath: selectedNodeRef.current.fullPath,
        relativePath: selectedNodeRef.current.relativePath,
      };
    }

    // 回退逻辑：从 selected 中查找最深的文件夹
    // Fallback: find the deepest folder from selected keys
    if (selected && selected.length > 0) {
      const folderNodes: IDirOrFile[] = [];
      for (const key of selected) {
        const node = findNodeByKey(files, key);
        if (node && !node.isFile && node.fullPath) {
          folderNodes.push(node);
        }
      }

      if (folderNodes.length > 0) {
        // 按最深的相对路径排序（路径段越多越深）
        // Sort by deepest relativePath (more path segments)
        folderNodes.sort((a, b) => {
          const aDepth = (a.relativePath || '').split('/').length;
          const bDepth = (b.relativePath || '').split('/').length;
          return bDepth - aDepth;
        });
        return {
          fullPath: folderNodes[0].fullPath,
          relativePath: folderNodes[0].relativePath,
        };
      }
    }

    // 默认使用工作空间根目录
    // Default to workspace root
    return {
      fullPath: workspace,
      relativePath: null,
    };
  }, [selected, files, workspace, findNodeByKey]);

  // 监听清空选中文件事件（发送消息后）
  // Listen to clear selected files event (after sending message)
  useAddEventListener(`${eventPrefix}.selected.file.clear`, () => {
    setSelected([]);
    selectedKeysRef.current = []; // 同时清空 ref，保持状态同步 / Also clear ref to keep state synchronized
  });

  // 注意：不再监听 `${eventPrefix}.selected.file` 事件进行反向同步
  // 工作空间的选中状态应该只由工作空间自己管理，避免 SendBox 的绝对路径污染 selected state
  // Note: No longer listen to `${eventPrefix}.selected.file` event for reverse synchronization
  // Workspace selection state should only be managed by workspace itself, avoiding SendBox's absolute paths polluting selected state

  const loadWorkspace = useCallback(
    (path: string, search?: string) => {
      setLoading(true);
      return ipcBridge.conversation.getWorkspace
        .invoke({ path, workspace, conversation_id, search: search || '' })
        .then((res) => {
          setFiles(res);
          // 只在搜索时才重置 Tree key，否则保持选中状态
          if (search) {
            setTreeKey(Math.random());
          }

          // 只展开第一层文件夹（根节点）
          const getFirstLevelKeys = (nodes: IDirOrFile[]): string[] => {
            if (nodes.length > 0 && nodes[0].relativePath === '') {
              // 如果第一个节点是根节点（relativePath 为空），展开它
              return [''];
            }
            return [];
          };

          setExpandedKeys(getFirstLevelKeys(res));
          return res;
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [conversation_id, workspace]
  );

  const refreshWorkspace = useCallback(() => {
    void loadWorkspace(workspace).then((files) => {
      setShowSearch(files.length > 0 && files[0]?.children?.length > 0);
    });
  }, [workspace, loadWorkspace]);

  const ensureNodeSelected = useCallback(
    // Keep tree selection state consistent and optionally emit file/folder paths to send box.
    // 确保树形控件的选中状态一致，必要时把文件/文件夹路径同步给发送框。
    (nodeData: IDirOrFile, options?: { emit?: boolean }) => {
      const key = nodeData.relativePath;
      const shouldEmit = Boolean(options?.emit);

      if (!key) {
        setSelected([]);
        selectedKeysRef.current = [];
        if (!nodeData.isFile && nodeData.fullPath) {
          // Remember the latest selected folder so paste operations target it.
          // 记录最后选中的文件夹，便于粘贴操作找到目标。
          selectedNodeRef.current = {
            relativePath: key ?? '',
            fullPath: nodeData.fullPath,
          };
        }
        if (shouldEmit && nodeData.fullPath) {
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: nodeData.isFile,
            },
          ]);
        } else if (shouldEmit) {
          emitter.emit(`${eventPrefix}.selected.file`, []);
        }
        return;
      }

      setSelected([key]);
      selectedKeysRef.current = [key];

      if (!nodeData.isFile) {
        selectedNodeRef.current = {
          relativePath: key,
          fullPath: nodeData.fullPath,
        };
        if (shouldEmit && nodeData.fullPath) {
          // Emit folder object to send box so it can display as a tag.
          // 将文件夹对象发给发送框，以便显示为标签。
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: false,
            },
          ]);
        }
      } else if (nodeData.fullPath) {
        selectedNodeRef.current = null;
        if (shouldEmit) {
          // When a file is selected, broadcast its info for the send box preview.
          // 选中文件时，将文件信息广播给发送框用于预览。
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: true,
            },
          ]);
        }
      }
    },
    [eventPrefix]
  );

  const handleOpenNode = useCallback(
    // Open the selected file or folder with the operating system's default handler so users can
    // inspect it outside of AionUi when needed. (使用操作系统默认程序打开当前文件或文件夹，便于用户在
    // AionUi 之外查看。)
    async (nodeData: IDirOrFile | null) => {
      if (!nodeData) return;
      try {
        await ipcBridge.shell.openFile.invoke(nodeData.fullPath);
      } catch (error) {
        console.error('Failed to open path:', error);
        messageApi.error(t('conversation.workspace.contextMenu.openFailed') || 'Failed to open');
      }
    },
    [messageApi, t]
  );

  const handleRevealNode = useCallback(
    // Highlight the item in the OS file explorer, giving users a familiar folder context. (在系统
    // 文件管理器中定位目标项，让用户在熟悉的目录环境中继续操作。)
    async (nodeData: IDirOrFile | null) => {
      if (!nodeData) return;
      try {
        await ipcBridge.shell.showItemInFolder.invoke(nodeData.fullPath);
      } catch (error) {
        console.error('Failed to reveal item in folder:', error);
        messageApi.error(t('conversation.workspace.contextMenu.revealFailed') || 'Failed to reveal');
      }
    },
    [messageApi, t]
  );

  const handleDeleteNode = useCallback(
    // Show the delete confirmation modal and keep selection synced so users know exactly which
    // entry is being removed. (弹出删除确认框并同步树形选中状态，让用户明确删除目标。)
    (nodeData: IDirOrFile | null, options?: { emit?: boolean }) => {
      if (!nodeData || !nodeData.relativePath) return;
      ensureNodeSelected(nodeData, { emit: Boolean(options?.emit) });
      closeContextMenu();
      setDeleteModal({ visible: true, target: nodeData, loading: false });
    },
    [closeContextMenu, ensureNodeSelected]
  );

  const handleDeleteConfirm = useCallback(async () => {
    // After confirmation, remove the entry from disk and clear stale selections so the UI reflects
    // the latest directory structure. (用户确认后在磁盘上删除目标，并清理失效的选中状态，让界面展示最新目录结构。)
    if (!deleteModal.target) return;
    try {
      setDeleteModal((prev) => ({ ...prev, loading: true }));
      const res = await removeWorkspaceEntry(deleteModal.target.fullPath);
      if (!res?.success) {
        const errorMsg = res?.msg || t('conversation.workspace.contextMenu.deleteFailed');
        messageApi.error(errorMsg);
        setDeleteModal((prev) => ({ ...prev, loading: false }));
        return;
      }

      messageApi.success(t('conversation.workspace.contextMenu.deleteSuccess'));
      setSelected([]);
      selectedKeysRef.current = [];
      selectedNodeRef.current = null;
      emitter.emit(`${eventPrefix}.selected.file`, []);
      closeDeleteModal();
      setTimeout(() => refreshWorkspace(), 200);
    } catch (error) {
      console.error('Failed to delete item:', error);
      messageApi.error(t('conversation.workspace.contextMenu.deleteFailed'));
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  }, [deleteModal.target, closeDeleteModal, eventPrefix, messageApi, refreshWorkspace, t]);

  const replacePathInList = useCallback((keys: string[], oldPath: string, newPath: string) => {
    // Update relative paths inside selection/expand arrays so renames do not collapse the tree the
    // user is viewing. (在节点重命名时更新选中/展开列表中的路径，避免用户正在查看的树分支被意外折叠。)
    if (!oldPath) return keys;
    const oldPrefix = `${oldPath}/`;
    const newPrefix = newPath ? `${newPath}/` : '';
    return keys.map((key) => {
      if (!key) return key;
      if (key === oldPath) return newPath;
      if (key.startsWith(oldPrefix)) {
        return `${newPrefix}${key.slice(oldPrefix.length)}`;
      }
      return key;
    });
  }, []);

  // eslint-disable-next-line max-len
  const updateChildrenPaths = useCallback((children: IDirOrFile[] | undefined, oldFullPrefix: string, newFullPrefix: string, oldRelativePrefix: string, newRelativePrefix: string): IDirOrFile[] | undefined => {
    if (!children) return children;
    return children.map((child) => {
      let updatedFullPath = child.fullPath;
      if (child.fullPath.startsWith(oldFullPrefix)) {
        updatedFullPath = `${newFullPrefix}${child.fullPath.slice(oldFullPrefix.length)}`;
      }

      let updatedRelativePath = child.relativePath;
      if (child.relativePath.startsWith(oldRelativePrefix)) {
        updatedRelativePath = `${newRelativePrefix}${child.relativePath.slice(oldRelativePrefix.length)}`;
      }
      return {
        ...child,
        fullPath: updatedFullPath,
        relativePath: updatedRelativePath,
        children: updateChildrenPaths(child.children, oldFullPrefix, newFullPrefix, oldRelativePrefix, newRelativePrefix),
      };
    });
  }, []);

  const updateTreeForRename = useCallback(
    (tree: IDirOrFile[], target: IDirOrFile, newName: string, newFullPath: string, newRelativePath: string): IDirOrFile[] => {
      const sep = getPathSeparator(target.fullPath);
      const ensureSuffix = (value: string) => (value.endsWith(sep) ? value : `${value}${sep}`);
      const oldFullPrefix = ensureSuffix(target.fullPath);
      const newFullPrefix = ensureSuffix(newFullPath);
      const oldRelativePrefix = target.relativePath ? `${target.relativePath}/` : '';
      const newRelativePrefix = newRelativePath ? `${newRelativePath}/` : '';

      return tree.map((node) => {
        if (node.fullPath === target.fullPath) {
          return {
            ...node,
            name: newName,
            fullPath: newFullPath,
            relativePath: newRelativePath,
            children: updateChildrenPaths(node.children, oldFullPrefix, newFullPrefix, oldRelativePrefix, newRelativePrefix),
          };
        }
        if (node.children) {
          return {
            ...node,
            children: updateTreeForRename(node.children, target, newName, newFullPath, newRelativePath),
          };
        }
        return node;
      });
    },
    [getPathSeparator, updateChildrenPaths]
  );

  // Wrap promise with timeout guard to avoid stuck UI (包装 Promise 增加超时保护，防止界面卡住)
  const waitWithTimeout = useCallback(<T,>(promise: Promise<T>, timeoutMs = 8000) => {
    // Guard long-running IPC requests so the UI can surface a timeout instead of hanging forever.
    // (为耗时的 IPC 请求增加超时保护，避免界面一直无响应。)
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('timeout'));
      }, timeoutMs);

      promise
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timer);
          reject(error);
        });
    });
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    // Submit the rename to the backend, update the tree optimistically, and keep selection/expand
    // state aligned so the user remains in the same context. (向后端提交重命名，乐观更新树结构，并保持选中
    // /展开状态一致，让用户留在同一上下文。)
    const target = renameModal.target;
    if (!target) return;
    if (renameLoading) return;
    const trimmedName = renameModal.value.trim();

    if (!trimmedName) {
      messageApi.warning(t('conversation.workspace.contextMenu.renameEmpty'));
      return;
    }

    if (trimmedName === target.name) {
      closeRenameModal();
      return;
    }

    const newFullPath = (() => {
      // New absolute filesystem path after rename. (重命名后的绝对文件系统路径)
      const sep = getPathSeparator(target.fullPath);
      const parentFull = target.fullPath.slice(0, target.fullPath.lastIndexOf(sep));
      return parentFull ? `${parentFull}${sep}${trimmedName}` : trimmedName;
    })();

    const newRelativePath = (() => {
      // Relative key used by the tree component after rename. (重命名后树组件使用的相对路径标识)
      if (!target.relativePath) {
        return target.isFile ? trimmedName : '';
      }
      const segments = target.relativePath.split('/');
      segments[segments.length - 1] = trimmedName;
      return segments.join('/');
    })();

    try {
      setRenameLoading(true);
      const response = await waitWithTimeout(renameWorkspaceEntry(target.fullPath, trimmedName));
      if (!response?.success) {
        const errorMsg = response?.msg || t('conversation.workspace.contextMenu.renameFailed');
        messageApi.error(errorMsg);
        return;
      }

      closeRenameModal();

      setFiles((prev) => updateTreeForRename(prev, target, trimmedName, newFullPath, newRelativePath));

      const oldRelativePath = target.relativePath ?? '';
      setExpandedKeys((prev) => replacePathInList(prev, oldRelativePath, newRelativePath));

      setSelected((prev) => replacePathInList(prev, oldRelativePath, newRelativePath));
      selectedKeysRef.current = replacePathInList(selectedKeysRef.current, oldRelativePath, newRelativePath);

      if (!target.isFile) {
        selectedNodeRef.current = {
          relativePath: newRelativePath,
          fullPath: newFullPath,
        };
        emitter.emit(`${eventPrefix}.selected.file`, []);
      } else {
        selectedNodeRef.current = null;
      }

      messageApi.success(t('conversation.workspace.contextMenu.renameSuccess'));
    } catch (error) {
      if (error instanceof Error && error.message === 'timeout') {
        messageApi.error(t('conversation.workspace.contextMenu.renameTimeout'));
      } else {
        console.error('Failed to rename item:', error);
        messageApi.error(t('conversation.workspace.contextMenu.renameFailed'));
      }
    } finally {
      setRenameLoading(false);
    }
  }, [closeRenameModal, emitter, eventPrefix, getPathSeparator, messageApi, renameLoading, renameModal, replacePathInList, t, updateTreeForRename, waitWithTimeout]);

  const handleAddToChat = useCallback(
    (nodeData: IDirOrFile | null) => {
      // Queue the file or folder for the next chat message so it appears in the attachment preview area.
      // (将文件或文件夹加入下一条聊天消息的附件列表，并立即显示在附件预览区。)
      if (!nodeData || !nodeData.fullPath) return;
      ensureNodeSelected(nodeData, { emit: true });
      closeContextMenu();
      messageApi.success(t('conversation.workspace.contextMenu.addedToChat'));
    },
    [closeContextMenu, ensureNodeSelected, messageApi, t]
  );

  const openRenameModal = useCallback(
    (nodeData: IDirOrFile | null) => {
      // Pre-fill the rename dialog with the selected node's name while keeping the tree selection
      // intact. (使用选中节点名称预填重命名弹窗，同时保持树的选中状态不变。)
      if (!nodeData) return;
      ensureNodeSelected(nodeData);
      closeContextMenu();
      setRenameModal({ visible: true, value: nodeData.name, target: nodeData });
    },
    [closeContextMenu, ensureNodeSelected]
  );

  const handleAddFiles = useCallback(() => {
    ipcBridge.dialog.showOpen
      .invoke({
        properties: ['openFile', 'multiSelections'],
        defaultPath: workspace,
      })
      .then((selectedFiles) => {
        if (selectedFiles && selectedFiles.length > 0) {
          return ipcBridge.fs.copyFilesToWorkspace.invoke({ filePaths: selectedFiles, workspace }).then((result) => {
            if (result.success && result.data?.copiedFiles.length > 0) {
              setTimeout(() => {
                refreshWorkspace();
              }, 300);
            } else {
              console.error('Failed to copy files:', result.msg);
            }
          });
        }
      })
      .catch((error) => {
        console.error('Failed to add files:', error);
      });
  }, [workspace, refreshWorkspace]);

  const onSearch = useDebounce(
    (value: string) => {
      void loadWorkspace(workspace, value);
    },
    200,
    [workspace, loadWorkspace]
  );

  useEffect(() => {
    setFiles([]);
    setSelected([]);
    setExpandedKeys([]);
    selectedNodeRef.current = null; // 重置选中节点引用
    selectedKeysRef.current = []; // 重置选中keys引用
    setTreeKey(Math.random()); // 切换对话时重置 Tree
    setContextMenu({ visible: false, x: 0, y: 0, node: null });
    setRenameModal({ visible: false, value: '', target: null });
    setDeleteModal({ visible: false, target: null, loading: false });
    refreshWorkspace();
    emitter.emit(`${eventPrefix}.selected.file`, []);
  }, [conversation_id, eventPrefix, refreshWorkspace]);

  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClose = () => {
      closeContextMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.visible, closeContextMenu]);

  // 粘贴处理：为工作空间组件注册粘贴服务
  // Paste handling: register paste service for workspace component
  const handleFilesToAdd = useCallback(
    async (filesMeta: { name: string; path: string }[]) => {
      // 如果没有文件或未选择文件夹，则忽略
      // If no files or not folder selected, ignore
      if (!filesMeta || filesMeta.length === 0) return;

      // 使用工具函数获取目标文件夹路径
      // Use utility function to get target folder path
      const targetFolder = getTargetFolderPath();
      const targetFolderPath = targetFolder.fullPath;
      const targetFolderKey = targetFolder.relativePath;

      // 设置粘贴目标文件夹以提供视觉反馈
      // Set paste target folder for visual feedback
      if (targetFolderKey) {
        setPasteTargetFolder(targetFolderKey);
      }

      // 如果用户已禁用确认，直接执行复制
      // If user has disabled confirmation, perform copy directly
      const skipConfirm = await ConfigStorage.get('workspace.pasteConfirm');
      if (skipConfirm) {
        try {
          const filePaths = filesMeta.map((f) => f.path);
          const res = await ipcBridge.fs.copyFilesToWorkspace.invoke({ filePaths, workspace: targetFolderPath });
          if (res.success) {
            messageApi.success(t('messages.responseSentSuccessfully') || 'Pasted');
            setTimeout(() => refreshWorkspace(), 300);
          }
        } catch (error) {
          console.error('Paste failed:', error);
          messageApi.error(t('messages.unknownError') || 'Paste failed');
        } finally {
          // 操作完成后重置粘贴目标文件夹（成功或失败都重置）
          // Reset paste target folder after operation completes (success or failure)
          setPasteTargetFolder(null);
        }
        return;
      }

      // 否则显示确认对话框，使用第一个文件名
      // Otherwise show confirmation modal for first file name
      setConfirmFileName(filesMeta[0].name);
      setConfirmFilesToPaste(filesMeta.map((f) => ({ path: f.path, name: f.name })));
      setDoNotAsk(false);
      setConfirmVisible(true);
    },
    [workspace, refreshWorkspace, t, messageApi, getTargetFolderPath]
  );

  // 注册粘贴服务以在工作空间组件获得焦点时捕获全局粘贴事件
  // Register paste service to catch global paste events when workspace component is focused
  const { onFocus } = usePasteService({
    // 传递空数组以指示 PasteService 中"允许所有文件类型"
    // Pass an empty array to indicate "allow all file types" in PasteService
    supportedExts: [],
    onFilesAdded: (files) => {
      // files 是来自 PasteService 的 FileMetadata；映射到简单的格式
      // files are FileMetadata from PasteService; map to simple shape
      const meta = files.map((f) => ({ name: f.name, path: f.path }));
      void handleFilesToAdd(meta);
    },
  });

  useEffect(() => {
    const handleGeminiResponse = (data: { type: string }) => {
      if (data.type === 'tool_group' || data.type === 'tool_call') {
        refreshWorkspace();
      }
    };
    const handleAcpResponse = (data: { type: string }) => {
      if (data.type === 'acp_tool_call') {
        refreshWorkspace();
      }
    };
    const handleCodexResponse = (data: { type: string }) => {
      if (data.type === 'codex_tool_call') {
        refreshWorkspace();
      }
    };
    const unsubscribeGemini = ipcBridge.geminiConversation.responseStream.on(handleGeminiResponse);
    const unsubscribeAcp = ipcBridge.acpConversation.responseStream.on(handleAcpResponse);
    const unsubscribeCodex = ipcBridge.codexConversation.responseStream.on(handleCodexResponse);

    return () => {
      unsubscribeGemini();
      unsubscribeAcp();
      unsubscribeCodex();
    };
  }, [conversation_id, eventPrefix]);

  useAddEventListener(`${eventPrefix}.workspace.refresh`, () => refreshWorkspace(), [refreshWorkspace]);

  useEffect(() => {
    return ipcBridge.conversation.responseSearchWorkSpace.provider((data) => {
      if (data.match) setFiles([data.match]);
      return Promise.resolve();
    });
  }, []);

  const hasOriginalFiles = files.length > 0 && files[0]?.children?.length > 0;

  let contextMenuStyle: React.CSSProperties | undefined;
  if (contextMenu.visible) {
    let x = contextMenu.x;
    let y = contextMenu.y;
    if (typeof window !== 'undefined') {
      x = Math.min(x, window.innerWidth - 220);
      y = Math.min(y, window.innerHeight - 220);
    }
    contextMenuStyle = { top: y, left: x };
  }

  const contextMenuNode = contextMenu.node;
  const isContextMenuNodeFile = !!contextMenuNode?.isFile;
  const isContextMenuNodeRoot = !!contextMenuNode && (!contextMenuNode.relativePath || contextMenuNode.relativePath === '');
  const menuButtonBase = 'w-full flex items-center gap-8px px-14px py-6px text-13px text-left text-t-primary rounded-md transition-colors duration-150 hover:bg-2 border-none bg-transparent appearance-none focus:outline-none focus-visible:outline-none';
  const menuButtonDisabled = 'opacity-40 cursor-not-allowed hover:bg-transparent'; // Disabled style for menu items (禁用状态样式)

  return (
    <div className='size-full flex flex-col' tabIndex={0} onFocus={onFocus} onClick={onFocus}>
      {messageContext}
      <Modal
        visible={confirmVisible}
        title={null}
        onCancel={() => {
          setConfirmVisible(false);
          setPasteTargetFolder(null);
        }}
        footer={null}
        style={{ borderRadius: '12px' }}
        className='paste-confirm-modal'
      >
        <div className='px-24px py-20px'>
          {/* 标题区域 */}
          <div className='flex items-center gap-12px mb-20px'>
            <div className='flex items-center justify-center w-48px h-48px rounded-full' style={{ backgroundColor: 'rgb(var(--primary-1))' }}>
              <FileText theme='outline' size='24' fill='rgb(var(--primary-6))' />
            </div>
            <div>
              <div className='text-16px font-semibold mb-4px'>{t('conversation.workspace.pasteConfirm_title')}</div>
              <div className='text-13px' style={{ color: 'var(--color-text-3)' }}>
                {confirmFilesToPaste.length > 1 ? t('conversation.workspace.pasteConfirm_multipleFiles', { count: confirmFilesToPaste.length }) : t('conversation.workspace.pasteConfirm_title')}
              </div>
            </div>
          </div>

          {/* 内容区域 */}
          <div className='mb-20px px-12px py-16px rounded-8px' style={{ backgroundColor: 'var(--color-fill-2)' }}>
            <div className='flex items-start gap-12px mb-12px'>
              <FileText theme='outline' size='18' fill='var(--color-text-2)' style={{ marginTop: '2px' }} />
              <div className='flex-1'>
                <div className='text-13px mb-4px' style={{ color: 'var(--color-text-3)' }}>
                  {t('conversation.workspace.pasteConfirm_fileName')}
                </div>
                <div className='text-14px font-medium break-all' style={{ color: 'var(--color-text-1)' }}>
                  {confirmFileName}
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
                  {getTargetFolderPath().fullPath}
                </div>
              </div>
            </div>
          </div>

          {/* Checkbox区域 */}
          <div className='mb-20px'>
            <Checkbox checked={doNotAsk} onChange={(v) => setDoNotAsk(v)}>
              <span className='text-13px' style={{ color: 'var(--color-text-2)' }}>
                {t('conversation.workspace.pasteConfirm_noAsk')}
              </span>
            </Checkbox>
          </div>

          {/* 按钮区域 */}
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
                setConfirmVisible(false);
                setPasteTargetFolder(null);
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
                setConfirmVisible(false);
                try {
                  const filePaths = confirmFilesToPaste.map((f) => f.path);

                  // 使用工具函数获取目标文件夹路径
                  // Use utility function to get target folder path
                  const targetFolderPath = getTargetFolderPath().fullPath;

                  const res = await ipcBridge.fs.copyFilesToWorkspace.invoke({ filePaths, workspace: targetFolderPath });
                  if (res.success) {
                    messageApi.success(t('conversation.workspace.pasteConfirm_paste') || 'Pasted');
                    setTimeout(() => refreshWorkspace(), 300);
                  }
                  if (doNotAsk) {
                    await ConfigStorage.set('workspace.pasteConfirm', true);
                  }
                } catch (error) {
                  console.error('Paste failed:', error);
                  messageApi.error(t('messages.unknownError') || 'Paste failed');
                } finally {
                  setPasteTargetFolder(null);
                }
              }}
            >
              {t('conversation.workspace.pasteConfirm_paste')}
            </button>
          </div>
        </div>
      </Modal>
      <Modal visible={renameModal.visible} title={t('conversation.workspace.contextMenu.renameTitle')} onCancel={closeRenameModal} onOk={handleRenameConfirm} okText={t('common.confirm')} cancelText={t('common.cancel')} confirmLoading={renameLoading} style={{ borderRadius: '12px' }}>
        <Input autoFocus value={renameModal.value} onChange={(value) => setRenameModal((prev) => ({ ...prev, value }))} onPressEnter={handleRenameConfirm} placeholder={t('conversation.workspace.contextMenu.renamePlaceholder')} />
      </Modal>
      <Modal visible={deleteModal.visible} title={t('conversation.workspace.contextMenu.deleteTitle')} onCancel={closeDeleteModal} onOk={handleDeleteConfirm} okText={t('common.confirm')} cancelText={t('common.cancel')} confirmLoading={deleteModal.loading} style={{ borderRadius: '12px' }}>
        <div className='text-14px text-t-secondary'>{t('conversation.workspace.contextMenu.deleteConfirm')}</div>
      </Modal>
      <div className='px-16px pb-8px'>
        <div className='flex items-center justify-start gap-8px'>
          <span className='font-bold text-14px text-t-primary'>{t('common.file')}</span>
          <div className='flex items-center gap-8px'>
            <Tooltip content={t('conversation.workspace.addFile')}>
              <span>
                <FileAddition className='cursor-pointer flex' theme='outline' size='16' fill={iconColors.secondary} onClick={handleAddFiles} />
              </span>
            </Tooltip>
            <Tooltip content={t('conversation.workspace.refresh')}>
              <span>
                <Refresh className={loading ? 'loading lh-[1] flex cursor-pointer' : 'flex cursor-pointer'} theme='outline' size='16' fill={iconColors.secondary} onClick={() => refreshWorkspace()} />
              </span>
            </Tooltip>
          </div>
        </div>
      </div>
      {(showSearch || searchText) && (
        <div className='px-16px pb-8px'>
          <Input
            className='w-full'
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
      <FlexFullContainer containerClassName='overflow-y-auto'>
        {contextMenu.visible && contextMenuNode && contextMenuStyle && (
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
                  void handleOpenNode(contextMenuNode);
                  closeContextMenu();
                }}
              >
                {t('conversation.workspace.contextMenu.open')}
              </button>
              {isContextMenuNodeFile && (
                <button
                  type='button'
                  className={menuButtonBase}
                  onClick={() => {
                    void handleRevealNode(contextMenuNode);
                    closeContextMenu();
                  }}
                >
                  {t('conversation.workspace.contextMenu.openLocation')}
                </button>
              )}
              <div className='h-1px bg-3 my-2px'></div>
              <button
                type='button'
                className={`${menuButtonBase} ${isContextMenuNodeRoot ? menuButtonDisabled : ''}`.trim()}
                disabled={isContextMenuNodeRoot}
                onClick={() => {
                  handleDeleteNode(contextMenuNode);
                }}
              >
                {t('common.delete')}
              </button>
              <button
                type='button'
                className={`${menuButtonBase} ${isContextMenuNodeRoot ? menuButtonDisabled : ''}`.trim()}
                disabled={isContextMenuNodeRoot}
                onClick={() => {
                  openRenameModal(contextMenuNode);
                }}
              >
                {t('conversation.workspace.contextMenu.rename')}
              </button>
              <div className='h-1px bg-3 my-2px'></div>
              <button
                type='button'
                className={menuButtonBase}
                onClick={() => {
                  handleAddToChat(contextMenuNode);
                }}
              >
                {t('conversation.workspace.contextMenu.addToChat')}
              </button>
            </div>
          </div>
        )}
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
            key={treeKey}
            selectedKeys={selected}
            expandedKeys={expandedKeys}
            treeData={files}
            fieldNames={{
              children: 'children',
              title: 'name',
              key: 'relativePath',
              isLeaf: 'isFile',
            }}
            multiple
            renderTitle={(node) => {
              const path = node.dataRef.fullPath;
              const relativePath = node.dataRef.relativePath;
              const isFile = node.dataRef.isFile;

              // 使用 ref 来获取最新的选中状态
              const isPasteTarget = !isFile && pasteTargetFolder === relativePath;

              return (
                <span
                  className='flex items-center gap-4px'
                  style={{ color: 'inherit' }}
                  onDoubleClick={() => {
                    void ipcBridge.shell.openFile.invoke(path);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    ensureNodeSelected(node.dataRef as IDirOrFile);
                    setContextMenu({
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
              // 检测点击的节点，实现取消选中功能
              // Detect clicked node to implement deselection feature
              const clickedKey = extra?.node ? (extra.node as any).props?.dataRef?.relativePath || (extra.node as any).key : null;

              let newKeys: string[];

              // 完全由我们自己控制选中状态，不依赖 Tree 返回的 keys（可能被污染）
              // Fully control selection state ourselves, don't rely on Tree's returned keys (may be polluted)
              if (clickedKey && selectedKeysRef.current.includes(clickedKey)) {
                // 如果点击的节点已经在选中列表中，则移除它（取消选中）
                // If clicked node is already selected, remove it (deselect)
                newKeys = selectedKeysRef.current.filter((key) => key !== clickedKey);
              } else if (clickedKey) {
                // 添加点击的节点到选中列表（多选模式）
                // Add clicked node to selection list (multiple selection mode)
                newKeys = [...selectedKeysRef.current, clickedKey];
              } else {
                // 没有 clickedKey（边界情况），使用 Tree 返回的值作为后备
                // No clickedKey (edge case), use Tree's returned value as fallback
                newKeys = keys.filter((key) => key !== workspace);
              }

              // 同时更新 state 和 ref，确保状态同步
              // Update both state and ref to ensure state synchronization
              setSelected(newKeys);
              selectedKeysRef.current = newKeys;

              // 更新 selectedNodeRef：找到最后选中的文件夹节点
              // Update selectedNodeRef: find the last selected folder node
              if (extra && extra.node) {
                // 尝试不同的方式访问节点数据
                // Try different ways to access node data
                const nodeProps = (extra.node as any).props;
                const nodeData = nodeProps?.dataRef || nodeProps?._data || (extra.node as any)._data || (extra.node as any).dataRef;

                if (nodeData) {
                  if (!nodeData.isFile && nodeData.fullPath && nodeData.relativePath) {
                    selectedNodeRef.current = {
                      relativePath: nodeData.relativePath,
                      fullPath: nodeData.fullPath,
                    };
                  } else if (nodeData.isFile) {
                    selectedNodeRef.current = null;
                  }
                }
              }

              // 向 SendBox 发送文件和文件夹对象
              // 使用 fullPath（绝对路径）而不是 relativePath，以便 FilePreview 组件能正确显示图片预览
              // Emit both file and folder objects to SendBox
              // Use fullPath (absolute path) instead of relativePath so FilePreview can display image previews correctly
              const items: Array<{ path: string; name: string; isFile: boolean }> = [];

              // 遍历选中的节点，收集文件和文件夹的完整信息（使用工具函数 findNodeByKey）
              // Iterate through selected nodes and collect full info of files and folders (using utility function findNodeByKey)
              for (const k of newKeys) {
                const node = findNodeByKey(files, k);
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
              // eslint-disable-next-line no-console
              setExpandedKeys(keys);
            }}
            loadMore={(treeNode) => {
              const path = treeNode.props.dataRef.fullPath;
              return ipcBridge.conversation.getWorkspace.invoke({ conversation_id, workspace, path }).then((res) => {
                treeNode.props.dataRef.children = res[0].children;
                setFiles([...files]);
              });
            }}
          ></Tree>
        )}
      </FlexFullContainer>
    </div>
  );
};

export default ChatWorkspace;
