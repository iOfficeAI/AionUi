/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/preview';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface PreviewMetadata {
  language?: string;
  title?: string;
  diff?: string;
  fileName?: string;
  filePath?: string; // 工作空间文件的绝对路径 / Absolute file path in workspace
  workspace?: string; // 工作空间根目录 / Workspace root directory
  editable?: boolean; // 是否可编辑 / Whether editable
}

export interface PreviewTab {
  id: string;
  content: string;
  contentType: PreviewContentType;
  metadata?: PreviewMetadata;
  title: string; // Tab 标题
  isDirty?: boolean; // 是否有未保存的修改 / Whether there are unsaved changes
  originalContent?: string; // 原始内容，用于对比 / Original content for comparison
}

export interface PreviewContextValue {
  // 预览面板状态 / Preview panel state
  isOpen: boolean;
  tabs: PreviewTab[]; // 所有打开的 tabs
  activeTabId: string | null; // 当前激活的 tab ID

  // 获取当前激活的 tab / Get active tab
  activeTab: PreviewTab | null;

  // 预览面板操作 / Preview panel operations
  openPreview: (content: string, type: PreviewContentType, metadata?: PreviewMetadata) => void;
  closePreview: () => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  updateContent: (content: string) => void;
  saveContent: (tabId?: string) => void; // 保存内容 / Save content
  findPreviewTab: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => PreviewTab | null; // 查找匹配的 tab
  closePreviewByIdentity: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => void; // 根据内容关闭指定 tab

  // 发送框集成 / Sendbox integration
  addToSendBox: (text: string) => void;
  setSendBoxHandler: (handler: (text: string) => void) => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

export const PreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tabs, setTabs] = useState<PreviewTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sendBoxHandler, setSendBoxHandlerState] = useState<((text: string) => void) | null>(null);

  // 追踪是否正在保存（避免与流式更新冲突）/ Track if currently saving (to avoid conflicts with streaming updates)
  const savingFilesRef = useRef<Set<string>>(new Set());

  // 获取当前激活的 tab / Get active tab
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || null;

  const normalize = (value?: string | null) => value?.trim() || '';

  // 从可能包含描述的字符串中提取文件名 / Extract filename from string that may contain description
  const extractFileName = (str?: string): string | undefined => {
    if (!str) return undefined;
    // 匹配 "Writing to xxx.md" 或 "Reading xxx.txt" 等模式，提取文件名 / Match patterns like "Writing to xxx.md" and extract filename
    const match = str.match(/(?:Writing to|Reading|Creating|Updating)\s+(.+)$/i);
    return match ? match[1] : str;
  };

  const findPreviewTab = useCallback(
    (type: PreviewContentType, content?: string, meta?: PreviewMetadata) => {
      const normalizedFileName = normalize(meta?.fileName);
      const normalizedTitle = normalize(meta?.title);
      const normalizedFilePath = normalize(meta?.filePath);

      return (
        tabs.find((tab) => {
          if (tab.contentType !== type) return false;
          const tabFileName = normalize(tab.metadata?.fileName);
          const tabTitle = normalize(tab.metadata?.title);
          const tabFilePath = normalize(tab.metadata?.filePath);

          // 优先通过 filePath 匹配（最可靠）/ Prefer matching by filePath (most reliable)
          if (normalizedFilePath && tabFilePath && normalizedFilePath === tabFilePath) return true;

          // 其次通过 fileName 匹配 / Then match by fileName
          if (normalizedFileName && tabFileName && normalizedFileName === tabFileName) return true;

          // 再通过 title 匹配 / Then match by title
          if (!normalizedFileName && normalizedTitle && tabTitle && normalizedTitle === tabTitle) return true;

          // 最后才通过 content 匹配（仅用于小文件）/ Finally match by content (only for small files)
          // 对于大文件（PPT/Excel/Word），不使用 content 比较，避免性能问题
          // For large files (PPT/Excel/Word), skip content comparison to avoid performance issues
          if (!normalizedFileName && !normalizedTitle && !normalizedFilePath && content !== undefined) {
            // 只对小于 100KB 的内容进行比较 / Only compare content smaller than 100KB
            if (content.length < 100000 && tab.content === content) return true;
          }

          return false;
        }) || null
      );
    },
    [tabs]
  );

  const openPreview = useCallback(
    (newContent: string, type: PreviewContentType, meta?: PreviewMetadata) => {
      // 如果同一个文件已经打开，则直接激活现有 tab，避免重复 / Focus existing tab when the same file is opened again
      const existingTab = findPreviewTab(type, newContent, meta);

      if (existingTab) {
        setIsOpen(true);
        setActiveTabId(existingTab.id);
        setTabs((prevTabs) =>
          prevTabs.map((tab) => {
            if (tab.id !== existingTab.id) return tab;

            // 如果用户已编辑内容，则保留当前内容，仅更新元数据 / Keep edited content, only merge metadata
            if (tab.isDirty) {
              return meta ? { ...tab, metadata: { ...tab.metadata, ...meta } } : tab;
            }

            return {
              ...tab,
              content: newContent,
              metadata: meta ? { ...tab.metadata, ...meta } : tab.metadata,
              originalContent: newContent,
            };
          })
        );
        return;
      }

      // Tab 标题：优先使用文件名，并从 title 中提取实际文件名
      // Tab title: Prefer fileName and extract actual filename from title
      const fallbackTitle = (() => {
        // 根据内容类型设置默认标题 / Set default title based on content type
        if (type === 'markdown') return 'Markdown';
        if (type === 'diff') return 'Diff';
        if (type === 'code') return `${meta?.language || 'Code'}`;
        if (type === 'image') return 'Image'; // 图片预览默认标题 / Default title for image preview
        return 'Preview';
      })();

      const title = extractFileName(meta?.fileName) || extractFileName(meta?.title) || fallbackTitle;

      // 生成唯一 ID / Generate unique ID
      const tabId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const newTab: PreviewTab = {
        id: tabId,
        content: newContent,
        contentType: type,
        metadata: meta,
        title,
        isDirty: false,
        originalContent: newContent, // 保存原始内容 / Save original content
      };

      setTabs((prevTabs) => [...prevTabs, newTab]);
      setActiveTabId(tabId);
      setIsOpen(true);
    },
    [findPreviewTab]
  );

  const closePreview = useCallback(() => {
    setIsOpen(false);
    setTabs([]);
    setActiveTabId(null);
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prevTabs) => {
        const newTabs = prevTabs.filter((tab) => tab.id !== tabId);

        // 如果关闭的是当前激活的 tab / If closing the active tab
        if (tabId === activeTabId) {
          if (newTabs.length > 0) {
            // 切换到最后一个 tab / Switch to the last tab
            setActiveTabId(newTabs[newTabs.length - 1].id);
          } else {
            // 没有 tab 了，关闭预览面板 / No more tabs, close preview panel
            setIsOpen(false);
            setActiveTabId(null);
          }
        }

        return newTabs;
      });
    },
    [activeTabId]
  );

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const closePreviewByIdentity = useCallback(
    (type: PreviewContentType, content?: string, meta?: PreviewMetadata) => {
      const tab = findPreviewTab(type, content, meta);
      if (tab) {
        closeTab(tab.id);
      }
    },
    [findPreviewTab, closeTab]
  );

  const updateContent = useCallback(
    (newContent: string) => {
      if (!activeTabId) {
        return;
      }

      // 严格的类型检查，防止 Event 对象被错误传递 / Strict type checking to prevent Event object from being passed incorrectly
      if (typeof newContent !== 'string') {
        return;
      }

      try {
        setTabs((prevTabs) => {
          const updated = prevTabs.map((tab) => {
            if (tab.id === activeTabId) {
              // 检查内容是否与原始内容不同 / Check if content differs from original
              const isDirty = newContent !== tab.originalContent;
              return { ...tab, content: newContent, isDirty };
            }
            return tab;
          });
          return updated;
        });
      } catch {
        // Silently ignore errors
      }
    },
    [activeTabId]
  );

  const saveContent = useCallback(
    async (tabId?: string) => {
      const targetTabId = tabId || activeTabId;
      if (!targetTabId) return;

      const tab = tabs.find((t) => t.id === targetTabId);
      if (!tab) return;

      // 如果有 filePath 和 workspace，写回工作空间文件 / If filePath and workspace exist, write back to workspace file
      if (tab.metadata?.filePath && tab.metadata?.workspace) {
        try {
          const filePath = tab.metadata.filePath;

          // 标记文件正在保存（避免触发文件监听回调）/ Mark file as being saved (to avoid triggering file watch callback)
          savingFilesRef.current.add(filePath);

          // 使用 IPC 写入文件 / Write file via IPC
          const success = await ipcBridge.fs.writeFile.invoke({
            path: filePath,
            data: tab.content,
          });

          if (success) {
            // 标记为已保存（更新 originalContent 和清除 isDirty）/ Mark as saved
            setTabs((prevTabs) =>
              prevTabs.map((t) => {
                if (t.id === targetTabId) {
                  return { ...t, isDirty: false, originalContent: t.content };
                }
                return t;
              })
            );
          } else {
            // 写入失败，静默处理（只记录到控制台）/ Write failed, handle silently (log only)
          }

          // 延迟移除保存标记（给文件监听一点时间忽略变化）/ Delay removing save flag (give file watch time to ignore change)
          setTimeout(() => {
            savingFilesRef.current.delete(filePath);
          }, 500);
        } catch (error) {
          // 发生错误，静默处理（只记录到控制台）/ Error occurred, handle silently (log only)
          // 确保移除保存标记 / Ensure save flag is removed
          if (tab.metadata?.filePath) {
            savingFilesRef.current.delete(tab.metadata.filePath);
          }
        }
      } else {
        // 没有工作空间路径，无法保存 / No workspace path, cannot save
      }
    },
    [activeTabId, tabs]
  );

  const addToSendBox = useCallback(
    (text: string) => {
      if (sendBoxHandler) {
        sendBoxHandler(text);
      }
    },
    [sendBoxHandler]
  );

  const setSendBoxHandler = useCallback((handler: (text: string) => void) => {
    setSendBoxHandlerState(() => handler);
  }, []);

  // 流式内容订阅：订阅 agent 写入文件时的流式更新（替代文件监听）
  // Streaming content subscription: Subscribe to streaming updates when agent writes files (replaces file watching)
  useEffect(() => {
    const unsubscribe = ipcBridge.fileStream.contentUpdate.on(({ filePath, content, operation }) => {
      // 如果是删除操作，关闭对应的预览 tab / If delete operation, close the corresponding preview tab
      if (operation === 'delete') {
        setTabs((prevTabs) => {
          const tabToClose = prevTabs.find((tab) => tab.metadata?.filePath === filePath);
          if (tabToClose) {
            closeTab(tabToClose.id);
          }
          return prevTabs;
        });
        return;
      }

      // 使用函数式更新来访问最新的 tabs 状态 / Use functional update to access latest tabs state
      setTabs((prevTabs) => {
        // 查找受影响的 tabs / Find affected tabs
        const affectedTabs = prevTabs.filter((tab) => tab.metadata?.filePath === filePath);

        if (affectedTabs.length === 0) {
          return prevTabs;
        }

        return prevTabs.map((tab) => {
          // 只更新匹配的 tab / Only update matching tabs
          if (tab.metadata?.filePath !== filePath) return tab;

          // 🔥 关键修改：对于外部写入（Agent 流式更新），即使 tab 是 dirty 也强制更新
          // Key change: For external writes (Agent streaming), force update even if tab is dirty
          // 这是因为 Agent 写入代表的是文件真实状态，而不是用户的临时编辑
          // This is because Agent writes represent the actual file state, not user's temporary edits

          return {
            ...tab,
            content: content,
            originalContent: content,
            isDirty: false, // 重置 dirty 状态，因为内容已经与文件同步 / Reset dirty state as content is now synced with file
          };
        });
      });
    });

    return () => {
      unsubscribe();
    };
  }, [closeTab]); // 只依赖 closeTab，不依赖 tabs，避免重复订阅 / Only depend on closeTab, not tabs, to avoid re-subscribing

  return (
    <PreviewContext.Provider
      value={{
        isOpen,
        tabs,
        activeTabId,
        activeTab,
        openPreview,
        closePreview,
        closeTab,
        switchTab,
        updateContent,
        saveContent,
        findPreviewTab,
        closePreviewByIdentity,
        addToSendBox,
        setSendBoxHandler,
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
};

export const usePreviewContext = () => {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error('usePreviewContext must be used within PreviewProvider');
  }
  return context;
};
