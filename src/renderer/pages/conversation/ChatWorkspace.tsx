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
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmFileName, setConfirmFileName] = useState('');
  const [confirmFilesToPaste, setConfirmFilesToPaste] = useState<Array<{ path: string; name: string }>>([]);
  const [doNotAsk, setDoNotAsk] = useState(false);
  const [messageApi, messageContext] = Message.useMessage();
  const [pasteTargetFolder, setPasteTargetFolder] = useState<string | null>(null); // 跟踪粘贴目标文件夹 / Track paste target folder
  const selectedNodeRef = useRef<{ relativePath: string; fullPath: string } | null>(null); // 存储最后选中的文件夹节点 / Store the last selected folder node
  const selectedKeysRef = useRef<string[]>([]); // 存储选中的键供 renderTitle 访问 / Store selected keys for renderTitle to access

  const [searchText, setSearchText] = useState('');

  // ==================== 工具函数 / Utility Functions ====================

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

  // ==================== 事件监听 / Event Listeners ====================

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
    refreshWorkspace();
    emitter.emit(`${eventPrefix}.selected.file`, []);
  }, [conversation_id, eventPrefix, refreshWorkspace]);

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
  const { onPaste, onFocus } = usePasteService({
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
      <div className='px-16px pb-8px' onMouseEnter={() => setIsHeaderHovered(true)} onMouseLeave={() => setIsHeaderHovered(false)}>
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
            className={'!px-16px'}
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
              const isSelected = selectedKeysRef.current.includes(relativePath);
              const isPasteTarget = !isFile && pasteTargetFolder === relativePath;

              // 使用内联样式：参考 Arco Design 的选中样式
              const titleStyle: React.CSSProperties = {
                backgroundColor: isPasteTarget ? '#dbeafe' : isSelected ? 'rgb(var(--primary-1))' : undefined, // 主题色浅色背景
                color: isPasteTarget || isSelected ? 'rgb(var(--primary-6))' : undefined, // 主题色文字
                border: isPasteTarget ? '2px solid #3b82f6' : undefined,
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: isPasteTarget || isSelected ? 500 : undefined, // 选中时加粗
                transition: 'all 0.15s ease',
              };

              return (
                <span
                  className='flex items-center gap-4px'
                  style={titleStyle}
                  onDoubleClick={() => {
                    void ipcBridge.shell.openFile.invoke(path);
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

              // 只向 SendBox 发送文件路径（不发送文件夹）
              // 使用 fullPath（绝对路径）而不是 relativePath，以便 FilePreview 组件能正确显示图片预览
              // Emit only file paths to selected.file (folders should not be sent to SendBox)
              // Use fullPath (absolute path) instead of relativePath so FilePreview can display image previews correctly
              const filePaths: string[] = [];

              // 遍历选中的节点，只收集文件的完整路径（使用工具函数 findNodeByKey）
              // Iterate through selected nodes and collect only full paths of files (using utility function findNodeByKey)
              for (const k of newKeys) {
                const node = findNodeByKey(files, k);
                if (node && node.isFile && node.fullPath) {
                  filePaths.push(node.fullPath);
                }
              }

              emitter.emit(`${eventPrefix}.selected.file`, filePaths);
            }}
            onExpand={(keys) => {
              // eslint-disable-next-line no-console
              console.debug('[ChatWorkspace] onExpand called, keys:', keys);
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
