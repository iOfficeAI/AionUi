/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/preview';
import { emitter } from '@/renderer/utils/emitter';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/** DOM 片段数据结构 / DOM snippet data structure */
export interface DomSnippet {
  /** 唯一 ID / Unique ID */
  id: string;
  /** 简化标签名（用于显示）/ Simplified tag name (for display) */
  tag: string;
  /** 完整 HTML / Full HTML */
  html: string;
}

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
  saveContent: (tabId?: string) => Promise<boolean>; // 保存内容 / Save content
  findPreviewTab: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => PreviewTab | null; // 查找匹配的 tab
  closePreviewByIdentity: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => void; // 根据内容关闭指定 tab

  // 发送框集成 / Sendbox integration
  addToSendBox: (text: string) => void;
  setSendBoxHandler: (handler: ((text: string) => void) | null) => void;

  // DOM 片段管理 / DOM snippet management
  domSnippets: DomSnippet[];
  addDomSnippet: (tag: string, html: string) => void;
  removeDomSnippet: (id: string) => void;
  clearDomSnippets: () => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

// 持久化 key / Persistence key
const PREVIEW_STATE_KEY = 'aionui_preview_state';

// 从 localStorage 恢复状态 / Restore state from localStorage
// 注意：isOpen 不从 localStorage 恢复，新会话时预览面板默认关闭
// Note: isOpen is not restored from localStorage, preview panel is closed by default for new sessions
const loadPersistedState = (): { isOpen: boolean; tabs: PreviewTab[]; activeTabId: string | null } => {
  try {
    const stored = localStorage.getItem(PREVIEW_STATE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 验证数据结构 / Validate data structure
      if (Array.isArray(parsed.tabs)) {
        return {
          isOpen: false, // 始终默认关闭 / Always start closed
          tabs: parsed.tabs,
          activeTabId: parsed.activeTabId || null,
        };
      }
    }
  } catch {
    // 忽略解析错误 / Ignore parsing errors
  }
  return { isOpen: false, tabs: [], activeTabId: null };
};

export const PreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 从 localStorage 恢复初始状态 / Restore initial state from localStorage
  const persistedState = loadPersistedState();
  const [isOpen, setIsOpen] = useState(persistedState.isOpen);
  const [tabs, setTabs] = useState<PreviewTab[]>(persistedState.tabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(persistedState.activeTabId);
  const [sendBoxHandler, setSendBoxHandlerState] = useState<((text: string) => void) | null>(null);
  const [domSnippets, setDomSnippets] = useState<DomSnippet[]>([]);

  // 持久化状态到 localStorage / Persist state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        PREVIEW_STATE_KEY,
        JSON.stringify({
          isOpen,
          tabs,
          activeTabId,
        })
      );
    } catch {
      // 忽略存储错误（如存储空间不足）/ Ignore storage errors (e.g., quota exceeded)
    }
  }, [isOpen, tabs, activeTabId]);

  // 追踪是否正在保存（避免与流式更新冲突）/ Track if currently saving (to avoid conflicts with streaming updates)
  const savingFilesRef = useRef<Set<string>>(new Set());

  // 获取当前激活的 tab / Get active tab
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || null;

  const normalize = useCallback((value?: string | null) => value?.trim() || '', []);

  // 从可能包含描述的字符串中提取文件名 / Extract filename from string that may contain description
  const extractFileName = useCallback((str?: string): string | undefined => {
    if (!str) return undefined;
    // 匹配 "Writing to xxx.md" 或 "Reading xxx.txt" 等模式，提取文件名 / Match patterns like "Writing to xxx.md" and extract filename
    const match = str.match(/(?:Writing to|Reading|Creating|Updating)\s+(.+)$/i);
    return match ? match[1] : str;
  }, []);

  const findPreviewTabInList = useCallback(
    (tabList: PreviewTab[], type: PreviewContentType, content?: string, meta?: PreviewMetadata) => {
      const normalizedFileName = normalize(meta?.fileName);
      const normalizedTitle = normalize(meta?.title);
      const normalizedFilePath = normalize(meta?.filePath);

      return (
        tabList.find((tab) => {
          if (tab.contentType !== type) return false;
          const tabFileName = normalize(tab.metadata?.fileName);
          const tabTitle = normalize(tab.metadata?.title);
          const tabFilePath = normalize(tab.metadata?.filePath);

          // 优先通过 filePath 匹配（最可靠）/ Prefer matching by filePath (most reliable)
          if (normalizedFilePath && tabFilePath && normalizedFilePath === tabFilePath) return true;

          // 通过 fileName 匹配时，需要确保路径兼容（避免同名文件在不同目录的冲突）
          // When matching by fileName, ensure path compatibility (avoid conflicts of same-named files in different directories)
          if (normalizedFileName && tabFileName && normalizedFileName === tabFileName) {
            // 如果两边都有 filePath，则必须完全匹配
            // If both have filePath, they must match exactly
            if (normalizedFilePath && tabFilePath) {
              return normalizedFilePath === tabFilePath;
            }
            // 如果只有一边有 filePath，不能仅凭 fileName 匹配
            // If only one side has filePath, cannot match by fileName alone
            if (normalizedFilePath || tabFilePath) {
              return false;
            }
            // 都没有 filePath 时，可以通过 fileName 匹配
            // When neither has filePath, can match by fileName
            return true;
          }

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
    [normalize]
  );

  const findPreviewTab = useCallback(
    (type: PreviewContentType, content?: string, meta?: PreviewMetadata) => {
      return findPreviewTabInList(tabs, type, content, meta);
    },
    [findPreviewTabInList, tabs]
  );

  const openPreview = useCallback(
    (newContent: string, type: PreviewContentType, meta?: PreviewMetadata) => {
      let nextActiveTabId: string | null = null;

      setTabs((prevTabs) => {
        // 如果同一个文件已经打开，则直接激活现有 tab，避免重复 / Focus existing tab when the same file is opened again
        const existingTab = findPreviewTabInList(prevTabs, type, newContent, meta);

        if (existingTab) {
          nextActiveTabId = existingTab.id;
          return prevTabs.map((tab) => {
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
          });
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

        nextActiveTabId = tabId;
        return [...prevTabs, newTab];
      });

      if (nextActiveTabId) {
        setActiveTabId(nextActiveTabId);
      }
      setIsOpen(true);
    },
    [extractFileName, findPreviewTabInList]
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
      if (!targetTabId) return false;

      const tab = tabs.find((t) => t.id === targetTabId);
      if (!tab) return false;

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
            setTabs((prevTabs) =>
              prevTabs.map((t) => {
                if (t.id === targetTabId) {
                  return { ...t, isDirty: false, originalContent: t.content };
                }
                return t;
              })
            );
          }

          // 延迟移除保存标记（给文件监听一点时间忽略变化）/ Delay removing save flag (give file watch time to ignore change)
          setTimeout(() => {
            savingFilesRef.current.delete(filePath);
          }, 500);

          return success;
        } catch (error) {
          // 发生错误，静默处理（只记录到控制台）/ Error occurred, handle silently (log only)
          // 确保移除保存标记 / Ensure save flag is removed
          if (tab.metadata?.filePath) {
            savingFilesRef.current.delete(tab.metadata.filePath);
          }
          throw error;
        }
      }
      return false;
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

  const setSendBoxHandler = useCallback((handler: ((text: string) => void) | null) => {
    setSendBoxHandlerState(() => handler);
  }, []);

  // DOM 片段管理函数 / DOM snippet management functions
  // 只保留最新的一个片段 / Only keep the latest snippet
  const addDomSnippet = useCallback((tag: string, html: string) => {
    const id = `snippet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setDomSnippets([{ id, tag, html }]);
  }, []);

  const removeDomSnippet = useCallback((id: string) => {
    setDomSnippets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const clearDomSnippets = useCallback(() => {
    setDomSnippets([]);
  }, []);

  // 流式内容订阅：订阅 agent 写入文件时的流式更新（替代文件监听）
  // Streaming content subscription: Subscribe to streaming updates when agent writes files (replaces file watching)
  // 使用防抖优化：等待 agent 完成写入后再更新预览，避免打字动画被频繁中断
  // Use debounce optimization: Wait for agent to finish writing before updating preview, avoiding frequent animation interruptions
  useEffect(() => {
    // 防抖定时器映射：每个文件路径对应一个定时器 / Debounce timer map: one timer per file path
    const debounceTimers = new Map<string, NodeJS.Timeout>();

    const unsubscribe = ipcBridge.fileStream.contentUpdate.on(({ filePath, content, operation }) => {
      // 如果是删除操作，立即处理，不需要防抖 / If delete operation, handle immediately without debounce
      if (operation === 'delete') {
        // 清除该文件的防抖定时器 / Clear debounce timer for this file
        const existingTimer = debounceTimers.get(filePath);
        if (existingTimer) {
          clearTimeout(existingTimer);
          debounceTimers.delete(filePath);
        }

        setTabs((prevTabs) => {
          const tabToClose = prevTabs.find((tab) => tab.metadata?.filePath === filePath);
          if (tabToClose) {
            closeTab(tabToClose.id);
          }
          return prevTabs;
        });
        return;
      }

      // 对写入操作进行防抖：500ms 内没有新的更新才真正更新内容
      // Debounce write operations: Only update content if no new updates within 500ms
      const existingTimer = debounceTimers.get(filePath);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        // 使用函数式更新来访问最新的 tabs 状态 / Use functional update to access latest tabs state
        setTabs((prevTabs) => {
          // 查找受影响的 tabs / Find affected tabs
          const affectedTabs = prevTabs.filter((tab) => tab.metadata?.filePath === filePath);

          if (affectedTabs.length === 0) {
            return prevTabs;
          }

          return prevTabs.map((tab) => {
            if (tab.metadata?.filePath !== filePath) return tab;

            // 如果正在保存或用户已编辑，不更新 / Don't update if saving or user has edited
            if (savingFilesRef.current.has(filePath) || tab.isDirty) {
              return tab;
            }

            return {
              ...tab,
              content,
              originalContent: content,
              isDirty: false,
            };
          });
        });

        // 清除定时器 / Clean up timer
        debounceTimers.delete(filePath);
      }, 500); // 500ms 防抖时间 / 500ms debounce delay

      debounceTimers.set(filePath, timer);
    });

    return () => {
      unsubscribe();
      // 清理所有防抖定时器 / Clean up all debounce timers
      debounceTimers.forEach((timer) => clearTimeout(timer));
      debounceTimers.clear();
    };
  }, [closeTab]); // 只依赖 closeTab，不依赖 tabs，避免重复订阅 / Only depend on closeTab, not tabs, to avoid re-subscribing

  // 监听 preview.open 事件（用于 agent 打开网页预览）/ Listen to preview.open event (for agent to open web preview)
  // 同时监听 IPC 和 renderer emitter 两种方式 / Listen to both IPC and renderer emitter
  useEffect(() => {
    const handlePreviewOpen = (data: { content: string; contentType: PreviewContentType; metadata?: PreviewMetadata }) => {
      if (data && data.content) {
        openPreview(data.content, data.contentType, data.metadata);
      }
    };

    // 监听 renderer emitter 事件 / Listen to renderer emitter event
    emitter.on('preview.open', handlePreviewOpen);

    // 监听 IPC 事件（来自主进程，如 chrome-devtools MCP 导航）/ Listen to IPC event (from main process, e.g., chrome-devtools MCP navigation)
    const unsubscribeIpc = ipcBridge.preview.open.on(handlePreviewOpen);

    return () => {
      emitter.off('preview.open', handlePreviewOpen);
      unsubscribeIpc();
    };
  }, [openPreview]);

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
        domSnippets,
        addDomSnippet,
        removeDomSnippet,
        clearDomSnippets,
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
