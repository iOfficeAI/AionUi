/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewHistoryTarget, PreviewSnapshotInfo } from '@/common/types/preview';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { usePreviewContext } from '@/renderer/context/PreviewContext';
import { useResizableSplit } from '@/renderer/hooks/useResizableSplit';
import { iconColors } from '@/renderer/theme/colors';
import { Dropdown, Message, Modal } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CodePreview from './CodePreview';
import DiffPreview from './DiffPreview';
import ExcelPreview from './ExcelPreview';
import HTMLEditor from './HTMLEditor';
import HTMLRenderer from './HTMLRenderer';
import MarkdownEditor from './MarkdownEditor';
import MarkdownPreview from './MarkdownPreview';
import PDFPreview from './PDFPreview';
import PPTPreview from './PPTPreview';
import TextEditor from './TextEditor';
import WordPreview from './WordPreview';
import ImagePreview from './ImagePreview';

/**
 * 预览面板主组件
 * Main preview panel component
 *
 * 支持多 Tab 切换，每个 Tab 可以显示不同类型的内容
 * Supports multiple tabs, each tab can display different types of content
 */
const PreviewPanel: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, tabs, activeTabId, activeTab, closeTab, switchTab, closePreview, updateContent, saveContent } = usePreviewContext();
  const layout = useLayoutContext();
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('preview');
  const [isSplitScreenEnabled, setIsSplitScreenEnabled] = useState(false); // 分屏模式状态 / Split-screen mode state
  const [isEditMode, setIsEditMode] = useState(false); // 编辑模式状态 / Edit mode state
  const [showExitConfirm, setShowExitConfirm] = useState(false); // 退出编辑确认弹窗 / Exit edit confirmation modal
  const [closeTabConfirm, setCloseTabConfirm] = useState<{ show: boolean; tabId: string | null }>({ show: false, tabId: null }); // 关闭tab确认弹窗 / Close tab confirmation modal
  const [historyVersions, setHistoryVersions] = useState<PreviewSnapshotInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const lastSnapshotTimeRef = useRef<number>(0); // 记录上次快照保存时间 / Track last snapshot save time
  const editorContainerRef = useRef<HTMLDivElement>(null); // 编辑器容器引用 / Editor container ref
  const previewContainerRef = useRef<HTMLDivElement>(null); // 预览容器引用 / Preview container ref
  const tabsContainerRef = useRef<HTMLDivElement>(null); // Tabs 容器引用 / Tabs container ref
  const [tabFadeState, setTabFadeState] = useState({ left: false, right: false }); // Tabs 渐变状态 / Gradient indicators for tabs
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  const [inspectMode, setInspectMode] = useState(false); // HTML 检查模式 / HTML inspect mode
  const [contextMenu, setContextMenu] = useState<{ show: boolean; x: number; y: number; tabId: string | null }>({ show: false, x: 0, y: 0, tabId: null }); // Tab 右键菜单 / Tab context menu
  const contextMenuRef = useRef<HTMLDivElement>(null); // 右键菜单引用 / Context menu ref

  // 点击外部关闭上下文菜单 / Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!contextMenu.show) return;
      // 如果点击的是菜单内部，不关闭 / Don't close if clicking inside menu
      if (contextMenuRef.current && contextMenuRef.current.contains(e.target as Node)) {
        return;
      }
      setContextMenu({ show: false, x: 0, y: 0, tabId: null });
    };

    // 使用 mousedown 而不是 click,避免与右键菜单的 onClick 冲突
    // Use mousedown instead of click to avoid conflicts with context menu onClick
    document.addEventListener('mousedown', handleClickOutside, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.show]);

  // 监听主题变化 / Monitor theme changes
  useEffect(() => {
    const updateTheme = () => {
      const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setCurrentTheme(theme);
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  // 监听快捷键 Cmd/Ctrl + S 保存 / Listen for Cmd/Ctrl + S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault(); // 阻止浏览器默认保存行为 / Prevent default browser save
        if (activeTab?.isDirty) {
          saveContent(); // 保存当前 tab / Save current tab
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, saveContent]);

  // Tabs 横向溢出状态检测，用于显示左右渐变指示器
  // Track tab overflow for displaying left/right gradient indicators
  const updateTabOverflow = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;

    // 检查是否有横向溢出（内容宽度大于容器宽度）
    // Check if there's horizontal overflow (content width exceeds container width)
    const hasOverflow = scrollWidth > clientWidth + 1;

    const nextState = {
      // 左侧渐变：有溢出且已向右滚动 / Left gradient: has overflow and scrolled right
      left: hasOverflow && scrollLeft > 2,
      // 右侧渐变：有溢出且未滚动到最右侧 / Right gradient: has overflow and not scrolled to rightmost
      right: hasOverflow && scrollLeft + clientWidth < scrollWidth - 2,
    };

    // 只在状态变化时更新，避免不必要的重渲染 / Only update when state changes to avoid unnecessary re-renders
    setTabFadeState((prev) => {
      if (prev.left === nextState.left && prev.right === nextState.right) return prev;
      return nextState;
    });
  }, []);

  // 当 tabs 或 activeTabId 变化时更新溢出状态
  // Update overflow state when tabs or activeTabId changes
  useEffect(() => {
    updateTabOverflow();
  }, [tabs, activeTabId, updateTabOverflow]);

  // 监听滚动、窗口大小变化和容器大小变化
  // Listen to scroll, window resize, and container size changes
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const handleScroll = () => updateTabOverflow();
    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateTabOverflow);

    // 使用 ResizeObserver 监听容器大小变化 / Use ResizeObserver to monitor container size changes
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateTabOverflow());
      resizeObserver.observe(container);
    }

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateTabOverflow);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [updateTabOverflow]);

  // 内层分割：编辑器和预览的分割比例（默认 50/50）
  // Inner split: Split ratio between editor and preview (default 50/50)
  const { splitRatio, dragHandle } = useResizableSplit({
    defaultWidth: 50,
    minWidth: 20,
    maxWidth: 80,
    storageKey: 'preview-panel-split-ratio',
  });

  // 🔄 分屏模式下的滚动同步 / Scroll sync in split-screen mode
  const isSyncingRef = useRef(false);

  const handleEditorScroll = useCallback(
    (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      if (!isSplitScreenEnabled || isSyncingRef.current) return;
      isSyncingRef.current = true;
      const previewContainer = previewContainerRef.current;
      if (previewContainer) {
        const scrollPercentage = scrollTop / (scrollHeight - clientHeight || 1);
        previewContainer.scrollTop = scrollPercentage * (previewContainer.scrollHeight - previewContainer.clientHeight);
      }
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 100);
    },
    [isSplitScreenEnabled]
  );

  const handlePreviewScroll = useCallback(
    (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      if (!isSplitScreenEnabled || isSyncingRef.current) return;
      isSyncingRef.current = true;
      const editorContainer = editorContainerRef.current;
      if (editorContainer) {
        const scrollPercentage = scrollTop / (scrollHeight - clientHeight || 1);
        editorContainer.scrollTop = scrollPercentage * (editorContainer.scrollHeight - editorContainer.clientHeight);
      }
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 100);
    },
    [isSplitScreenEnabled]
  );

  // 使用 useCallback 包装 updateContent，确保引用稳定 / Wrap updateContent with useCallback for stable reference
  const handleContentChange = useCallback(
    (newContent: string) => {
      // 严格的类型检查，防止 Event 对象被错误传递 / Strict type checking to prevent Event object from being passed incorrectly
      if (typeof newContent !== 'string') {
        return;
      }
      try {
        updateContent(newContent);
      } catch {
        // Silently ignore errors
      }
    },
    [updateContent]
  );

  // 处理退出编辑模式 / Handle exit edit mode
  const handleExitEdit = useCallback(() => {
    // 如果有未保存的修改，弹出确认对话框 / If there are unsaved changes, show confirmation dialog
    if (activeTab?.isDirty) {
      setShowExitConfirm(true);
    } else {
      // 没有未保存的修改，直接退出 / No unsaved changes, exit directly
      setIsEditMode(false);
    }
  }, [activeTab?.isDirty]);

  // 确认退出编辑 / Confirm exit edit
  const handleConfirmExit = useCallback(() => {
    setIsEditMode(false);
    setShowExitConfirm(false);
  }, []);

  // 取消退出编辑 / Cancel exit edit
  const handleCancelExit = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  // 处理关闭tab / Handle close tab
  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      // 如果tab有未保存的修改，显示确认对话框 / If tab has unsaved changes, show confirmation dialog
      if (tab?.isDirty) {
        setCloseTabConfirm({ show: true, tabId });
      } else {
        // 没有未保存的修改，直接关闭 / No unsaved changes, close directly
        closeTab(tabId);
      }
    },
    [tabs, closeTab]
  );

  // 保存并关闭tab / Save and close tab
  const handleSaveAndCloseTab = useCallback(() => {
    if (!closeTabConfirm.tabId) return;

    try {
      // 先保存 / Save first
      saveContent(closeTabConfirm.tabId);
      // 再关闭 / Then close
      closeTab(closeTabConfirm.tabId);
      setCloseTabConfirm({ show: false, tabId: null });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      messageApi.error(`${t('common.saveFailed')}: ${errorMsg}`);
      // 即使保存失败，也关闭确认对话框 / Close dialog even if save failed
      setCloseTabConfirm({ show: false, tabId: null });
    }
  }, [closeTabConfirm.tabId, saveContent, closeTab, messageApi, t]);

  // 不保存直接关闭tab / Close tab without saving
  const handleCloseWithoutSave = useCallback(() => {
    if (!closeTabConfirm.tabId) return;
    closeTab(closeTabConfirm.tabId);
    setCloseTabConfirm({ show: false, tabId: null });
  }, [closeTabConfirm.tabId, closeTab]);

  // 取消关闭tab / Cancel close tab
  const handleCancelCloseTab = useCallback(() => {
    setCloseTabConfirm({ show: false, tabId: null });
  }, []);

  // 处理 tab 右键菜单 / Handle tab context menu
  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
    });
  }, []);

  // 关闭左侧 tabs / Close tabs to the left
  const handleCloseLeft = useCallback(
    (tabId: string) => {
      const currentIndex = tabs.findIndex((t) => t.id === tabId);
      if (currentIndex <= 0) return; // 没有左侧 tabs / No tabs to the left

      const tabsToClose = tabs.slice(0, currentIndex);
      tabsToClose.forEach((tab) => closeTab(tab.id));
      setContextMenu({ show: false, x: 0, y: 0, tabId: null });
    },
    [tabs, closeTab]
  );

  // 关闭右侧 tabs / Close tabs to the right
  const handleCloseRight = useCallback(
    (tabId: string) => {
      const currentIndex = tabs.findIndex((t) => t.id === tabId);
      if (currentIndex < 0 || currentIndex >= tabs.length - 1) return; // 没有右侧 tabs / No tabs to the right

      const tabsToClose = tabs.slice(currentIndex + 1);
      tabsToClose.forEach((tab) => closeTab(tab.id));
      setContextMenu({ show: false, x: 0, y: 0, tabId: null });
    },
    [tabs, closeTab]
  );

  // 关闭其他 tabs / Close other tabs
  const handleCloseOthers = useCallback(
    (tabId: string) => {
      const tabsToClose = tabs.filter((t) => t.id !== tabId);
      tabsToClose.forEach((tab) => closeTab(tab.id));
      setContextMenu({ show: false, x: 0, y: 0, tabId: null });
    },
    [tabs, closeTab]
  );

  // 关闭全部 tabs / Close all tabs
  const handleCloseAll = useCallback(() => {
    tabs.forEach((tab) => closeTab(tab.id));
    setContextMenu({ show: false, x: 0, y: 0, tabId: null });
  }, [tabs, closeTab]);

  // 如果预览面板未打开，不渲染 / Don't render if preview panel is not open
  if (!isOpen || !activeTab) return null;

  const { content, contentType, metadata } = activeTab;
  const isMarkdown = contentType === 'markdown';
  const isHTML = contentType === 'html';
  const isEditable = metadata?.editable !== false; // 默认可编辑 / Default editable

  // 检查文件类型是否已有内置的打开按钮（Word、PPT、PDF、Excel 组件内部已提供）
  // Check if file type already has built-in open button (Word, PPT, PDF, Excel components provide their own)
  const hasBuiltInOpenButton = contentType === 'word' || contentType === 'ppt' || contentType === 'pdf' || contentType === 'excel';

  // 仅对有 filePath 且没有内置打开按钮的文件显示"在系统中打开"按钮
  // Show "Open in System" button only for files with filePath and without built-in open button
  const showOpenInSystemButton = Boolean(metadata?.filePath) && !hasBuiltInOpenButton;

  const historyTarget = useMemo<PreviewHistoryTarget | null>(() => {
    if (!activeTab) return null;
    const meta = activeTab.metadata;
    const fallbackName = meta?.fileName || meta?.title || activeTab.title;
    return {
      contentType: activeTab.contentType,
      filePath: meta?.filePath,
      workspace: meta?.workspace,
      fileName: fallbackName,
      title: meta?.title || activeTab.title,
      language: meta?.language,
    };
  }, [activeTab]);

  const refreshHistory = useCallback(async () => {
    if (!historyTarget) {
      setHistoryVersions([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const versions = await ipcBridge.previewHistory.list.invoke({ target: historyTarget });
      setHistoryVersions(versions || []);
      setHistoryError(null);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      setHistoryError(`${t('preview.loadHistoryFailed')}: ${errorMsg}`);
      setHistoryVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyTarget, t]);

  useEffect(() => {
    void refreshHistory().catch((): void => undefined);
  }, [refreshHistory]);

  const handleSaveSnapshot = useCallback(async () => {
    if (!historyTarget || !activeTab) {
      return;
    }
    if (snapshotSaving) return;

    // 防抖检查：如果距离上次保存快照时间小于1秒，则忽略 / Debounce check: Ignore if less than 1 second since last save
    const now = Date.now();
    const DEBOUNCE_TIME = 1000; // 1秒防抖时间 / 1 second debounce time
    if (now - lastSnapshotTimeRef.current < DEBOUNCE_TIME) {
      messageApi.info(t('preview.tooFrequent'));
      return;
    }

    try {
      setSnapshotSaving(true);
      lastSnapshotTimeRef.current = now; // 更新最后保存时间 / Update last save time
      await ipcBridge.previewHistory.save.invoke({ target: historyTarget, content: activeTab.content });
      messageApi.success(t('preview.snapshotSaved'));
      await refreshHistory();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      messageApi.error(`${t('preview.snapshotSaveFailed')}: ${errorMsg}`);
    } finally {
      setSnapshotSaving(false);
    }
  }, [historyTarget, activeTab, snapshotSaving, messageApi, refreshHistory, t]);

  const handleSnapshotSelect = useCallback(
    async (snapshot: PreviewSnapshotInfo) => {
      if (!historyTarget) {
        return;
      }
      try {
        const result = await ipcBridge.previewHistory.getContent.invoke({ target: historyTarget, snapshotId: snapshot.id });
        if (result?.content) {
          updateContent(result.content);
          messageApi.success(t('preview.historyLoaded'));
        } else {
          throw new Error('快照内容为空');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        messageApi.error(`${t('preview.historyLoadFailed')}: ${errorMsg}`);
      }
    },
    [historyTarget, messageApi, updateContent, t]
  );

  const renderHistoryDropdown = () => {
    return (
      <div
        className='min-w-220px rd-6px shadow-lg'
        style={{
          backgroundColor: currentTheme === 'dark' ? '#1d1d1f' : '#ffffff',
          border: '1px solid var(--border-base, #e5e6eb)',
          zIndex: 9999,
        }}
      >
        {/* 头部：历史版本标题 + 文件名 / Header: History title + filename */}
        <div className='px-8px py-6px' style={{ borderColor: 'var(--border-base, #e5e6eb)' }}>
          <div className='text-12px text-t-secondary'>{t('preview.historyVersions')}</div>
          <div className='text-11px text-t-tertiary truncate'>{historyTarget?.fileName || historyTarget?.title || t('preview.currentFile')}</div>
        </div>

        {/* 列表内容：固定高度可滚动 / List content: fixed height scrollable */}
        <div className='overflow-y-auto' style={{ maxHeight: '240px' }}>
          {historyLoading ? (
            <div className='py-16px text-center text-12px text-t-secondary'>{t('preview.loading')}</div>
          ) : historyError ? (
            <div className='py-16px text-center text-12px' style={{ color: 'var(--danger, #f53f3f)' }}>
              {historyError}
            </div>
          ) : historyVersions.length === 0 ? (
            <div className='py-16px text-center text-12px text-t-secondary'>{t('preview.noHistory')}</div>
          ) : (
            historyVersions.map((snapshot) => (
              <div key={snapshot.id} className='px-12px py-8px cursor-pointer hover:bg-bg-2 transition-colors' onClick={() => handleSnapshotSelect(snapshot)}>
                <div className='text-12px text-t-primary'>{new Date(snapshot.createdAt).toLocaleString()}</div>
                <div className='text-11px text-t-tertiary'>{(snapshot.size / 1024).toFixed(1)} KB</div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // 下载文件到本地 / Download file to local system
  const handleDownload = useCallback(async () => {
    try {
      let blob: Blob | null = null;
      let ext = 'txt';

      // 图片文件：从 Base64 数据或文件路径读取 / Image files: read from Base64 data or file path
      if (contentType === 'image') {
        let dataUrl = content;
        // 如果没有 Base64 数据，从文件路径读取 / If no Base64 data, read from file path
        if (!dataUrl && metadata?.filePath) {
          dataUrl = await ipcBridge.fs.getImageBase64.invoke({ path: metadata.filePath });
        }

        if (!dataUrl) {
          messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
          return;
        }

        // 将 Base64 数据转换为 Blob / Convert Base64 data to Blob
        blob = await fetch(dataUrl).then((res) => res.blob());

        // 优先使用文件名扩展名，其次使用 MIME 类型扩展名，最后默认为 png
        // Prefer filename extension, then MIME type extension, finally default to png
        const nameExt = metadata?.fileName?.split('.').pop();
        const mimeExt = blob.type && blob.type.includes('/') ? blob.type.split('/').pop() : undefined;
        ext = nameExt || mimeExt || 'png';
      } else {
        // 文本文件：创建文本 Blob / Text files: create text Blob
        blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

        // 根据内容类型设置文件扩展名 / Set file extension based on content type
        if (contentType === 'markdown') ext = 'md';
        else if (contentType === 'diff') ext = 'diff';
        else if (contentType === 'code') {
          // 代码文件：根据语言设置扩展名 / Code files: set extension based on language
          const lang = metadata?.language;
          if (lang === 'javascript' || lang === 'js') ext = 'js';
          else if (lang === 'typescript' || lang === 'ts') ext = 'ts';
          else if (lang === 'python' || lang === 'py') ext = 'py';
          else if (lang === 'java') ext = 'java';
          else if (lang === 'cpp' || lang === 'c++') ext = 'cpp';
          else if (lang === 'c') ext = 'c';
          else if (lang === 'html') ext = 'html';
          else if (lang === 'css') ext = 'css';
          else if (lang === 'json') ext = 'json';
        }
      }

      if (!blob) {
        messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
        return;
      }

      // 创建下载链接并触发下载 / Create download link and trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${metadata?.fileName || `${contentType}-${Date.now()}`}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url); // 释放 URL 对象 / Release URL object
    } catch (error) {
      console.error('[PreviewPanel] Failed to download file:', error);
      messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
    }
  }, [content, contentType, metadata?.fileName, metadata?.filePath, metadata?.language, messageApi, t]);

  // 在系统默认应用中打开文件 / Open file in system default application
  const handleOpenInSystem = useCallback(async () => {
    if (!metadata?.filePath) {
      messageApi.error(t('preview.openInSystemFailed'));
      return;
    }

    try {
      // 使用系统默认应用打开文件 / Open file with system default application
      await ipcBridge.shell.openFile.invoke(metadata.filePath);
      messageApi.success(t('preview.openInSystemSuccess'));
    } catch (err) {
      messageApi.error(t('preview.openInSystemFailed'));
    }
  }, [metadata?.filePath, messageApi, t]);

  // 渲染预览内容 / Render preview content
  const renderContent = () => {
    // Markdown 模式 / Markdown mode
    if (isMarkdown) {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled) {
        // 移动端：全屏显示预览，隐藏编辑器 / Mobile: Full-screen preview, hide editor
        if (layout?.isMobile) {
          return (
            <div className='flex-1 overflow-hidden'>
              <MarkdownPreview content={content} hideToolbar />
            </div>
          );
        }

        // 桌面端：左右分割布局 / Desktop: Split layout
        return (
          <div className='flex flex-1 relative overflow-hidden'>
            {/* 左侧：编辑器 / Left: Editor */}
            <div className='flex flex-col' style={{ width: `${splitRatio}%` }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <MarkdownEditor value={content} onChange={updateContent} containerRef={editorContainerRef} onScroll={handleEditorScroll} />
              </div>
            </div>

            {/* 拖动分割线 / Drag handle */}
            {dragHandle}

            {/* 右侧：预览 / Right: Preview */}
            <div className='flex flex-col flex-1'>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.preview')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <MarkdownPreview content={content} hideToolbar containerRef={previewContainerRef} onScroll={handlePreviewScroll} />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：单栏（原文或预览）/ Non-split mode: Single panel (source or preview)
      return <MarkdownPreview content={content} hideToolbar viewMode={viewMode} onViewModeChange={setViewMode} onContentChange={updateContent} />;
    }

    // HTML 模式 / HTML mode
    if (isHTML) {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled) {
        // 移动端：全屏显示预览，隐藏编辑器 / Mobile: Full-screen preview, hide editor
        if (layout?.isMobile) {
          return (
            <div className='flex-1 overflow-hidden'>
              <HTMLRenderer content={content} filePath={metadata?.filePath} />
            </div>
          );
        }

        // 桌面端：左右分割布局 / Desktop: Split layout
        return (
          <div className='flex flex-1 relative overflow-hidden'>
            {/* 左侧：编辑器 / Left: Editor */}
            <div className='flex flex-col' style={{ width: `${splitRatio}%` }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <HTMLEditor value={content} onChange={updateContent} containerRef={editorContainerRef} onScroll={handleEditorScroll} filePath={metadata?.filePath} />
              </div>
            </div>

            {/* 拖动分割线 / Drag handle */}
            {dragHandle}

            {/* 右侧：预览 / Right: Preview */}
            <div className='flex flex-col flex-1'>
              <div className='h-40px flex items-center justify-between px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.preview')}</span>
                {/* HTML 审核元素按钮 / HTML inspect element button */}
                <div className={`flex items-center justify-center w-24px h-24px rd-4px cursor-pointer transition-colors ${inspectMode ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => setInspectMode(!inspectMode)} title={inspectMode ? '关闭审核元素' : '开启审核元素 (Hover元素显示边框，右键显示菜单)'}>
                  <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                    <path d='M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z' />
                    <path d='M13 13l6 6' />
                  </svg>
                </div>
              </div>
              <div className='flex-1 overflow-hidden'>
                <HTMLRenderer content={content} filePath={metadata?.filePath} containerRef={previewContainerRef} onScroll={handlePreviewScroll} inspectMode={inspectMode} />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：单栏（原文或预览）/ Non-split mode: Single panel (source or preview)
      if (viewMode === 'source') {
        return (
          <div className='flex-1 overflow-hidden'>
            <HTMLEditor value={content} onChange={handleContentChange} filePath={metadata?.filePath} />
          </div>
        );
      } else {
        // 预览模式，显示检查模式按钮 / Preview mode, show inspect mode button
        return (
          <div className='flex flex-col flex-1'>
            <div className='h-40px flex items-center justify-end px-12px bg-bg-2'>
              {/* HTML 审核元素按钮 / HTML inspect element button */}
              <div className={`flex items-center justify-center w-24px h-24px rd-4px cursor-pointer transition-colors ${inspectMode ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => setInspectMode(!inspectMode)} title={inspectMode ? '关闭审核元素' : '开启审核元素 (Hover元素显示边框，右键显示菜单)'}>
                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                  <path d='M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z' />
                  <path d='M13 13l6 6' />
                </svg>
              </div>
            </div>
            <div className='flex-1 overflow-hidden'>
              <HTMLRenderer content={content} filePath={metadata?.filePath} inspectMode={inspectMode} />
            </div>
          </div>
        );
      }
    }

    // 其他类型：全屏预览 / Other types: Full-screen preview
    if (contentType === 'diff') {
      return <DiffPreview content={content} metadata={metadata} hideToolbar viewMode={viewMode} onViewModeChange={setViewMode} />;
    } else if (contentType === 'code') {
      // 如果处于编辑模式且可编辑，显示文本编辑器 / If in edit mode and editable, show text editor
      if (isEditMode && isEditable) {
        return (
          <div className='flex-1 overflow-hidden'>
            <TextEditor value={content} onChange={handleContentChange} />
          </div>
        );
      }
      // 否则显示代码预览 / Otherwise show code preview
      return <CodePreview content={content} language={metadata?.language} hideToolbar viewMode={viewMode} onViewModeChange={setViewMode} />;
    } else if (contentType === 'pdf') {
      return <PDFPreview filePath={metadata?.filePath} content={content} />;
    } else if (contentType === 'ppt') {
      return <PPTPreview filePath={metadata?.filePath} content={content} />;
    } else if (contentType === 'word') {
      return <WordPreview filePath={metadata?.filePath} content={content} />;
    } else if (contentType === 'excel') {
      return <ExcelPreview filePath={metadata?.filePath} content={content} />;
    } else if (contentType === 'image') {
      return <ImagePreview filePath={metadata?.filePath} content={content} fileName={metadata?.fileName || metadata?.title} />;
    }

    return null;
  };

  const { left: showLeftFade, right: showRightFade } = tabFadeState;

  return (
    <div className='h-full flex flex-col bg-1'>
      {messageContextHolder}

      {/* 退出编辑确认对话框 / Exit edit confirmation modal */}
      <Modal visible={showExitConfirm} title={t('preview.unsavedChangesTitle')} onCancel={handleCancelExit} onOk={handleConfirmExit} okText={t('preview.confirmExit')} cancelText={t('preview.continueEdit')} style={{ borderRadius: '12px' }}>
        <div className='text-14px text-t-secondary'>{t('preview.unsavedChangesMessage')}</div>
      </Modal>

      {/* 关闭tab确认对话框 / Close tab confirmation modal */}
      <Modal
        visible={closeTabConfirm.show}
        title={t('preview.closeTabTitle')}
        onCancel={handleCancelCloseTab}
        onOk={handleSaveAndCloseTab}
        okText={t('preview.saveAndClose')}
        cancelText={t('common.cancel')}
        style={{ borderRadius: '12px' }}
        footer={
          <div className='flex justify-end gap-8px'>
            <button className='px-16px py-6px rd-4px cursor-pointer border border-border-1 hover:bg-bg-3 transition-colors text-14px text-t-primary' onClick={handleCancelCloseTab}>
              {t('common.cancel')}
            </button>
            <button className='px-16px py-6px rd-4px cursor-pointer border border-border-1 hover:bg-bg-3 transition-colors text-14px text-t-primary' onClick={handleCloseWithoutSave}>
              {t('preview.closeWithoutSave')}
            </button>
            <button className='px-16px py-6px rd-4px cursor-pointer border-none bg-primary text-white hover:opacity-80 transition-opacity text-14px' onClick={handleSaveAndCloseTab}>
              {t('preview.saveAndClose')}
            </button>
          </div>
        }
      >
        <div className='text-14px text-t-secondary'>{t('preview.closeTabMessage')}</div>
      </Modal>

      {/* Tab 栏 / Tab bar */}
      <div className='relative flex-shrink-0 bg-bg-2' style={{ minHeight: '40px', borderBottom: '1px solid var(--border-base)' }}>
        <div ref={tabsContainerRef} className='flex items-center h-40px w-full overflow-x-auto flex-shrink-0'>
          {tabs.length > 0 ? (
            tabs.map((tab) => (
              <div key={tab.id} className={`flex items-center gap-8px px-12px h-full cursor-pointer transition-colors flex-shrink-0 ${tab.id === activeTabId ? 'bg-bg-1 text-t-primary' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => switchTab(tab.id)} onContextMenu={(e) => handleTabContextMenu(e, tab.id)}>
                <span className='text-12px whitespace-nowrap flex items-center gap-4px'>
                  {tab.title}
                  {/* 未保存指示器 / Unsaved indicator */}
                  {tab.isDirty && <span className='w-6px h-6px rd-full bg-primary' title='有未保存的修改 / Unsaved changes' />}
                </span>
                <Close
                  theme='outline'
                  size='14'
                  fill={iconColors.secondary}
                  className='hover:fill-primary'
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                />
              </div>
            ))
          ) : (
            <div className='text-12px text-t-tertiary px-12px'>No tabs</div>
          )}
        </div>

        {showLeftFade && (
          <div
            className='pointer-events-none absolute left-0 top-0 bottom-0 w-32px'
            style={{
              background: 'linear-gradient(90deg, var(--bg-2) 0%, transparent 100%)',
            }}
          />
        )}
        {showRightFade && (
          <div
            className='pointer-events-none absolute right-0 top-0 bottom-0 w-32px'
            style={{
              background: 'linear-gradient(270deg, var(--bg-2) 0%, transparent 100%)',
            }}
          />
        )}
      </div>

      {/* 工具栏：Tabs + 文件名 + 操作按钮 / Toolbar: Tabs + Filename + Action buttons */}
      <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0 border-b border-border-1'>
        {/* 左侧：Tabs（Markdown/HTML）+ 文件名 / Left: Tabs (Markdown/HTML) + Filename */}
        <div className='flex items-center h-full gap-12px'>
          {/* Markdown/HTML 文件显示原文/预览 Tabs / Show source/preview tabs for Markdown/HTML files */}
          {(isMarkdown || isHTML) && (
            <>
              <div className='flex items-center h-full gap-2px'>
                {/* 原文 Tab */}
                <div
                  className={`
                  flex items-center h-full px-16px cursor-pointer transition-all text-14px font-medium
                  ${viewMode === 'source' ? 'text-primary border-b-2 border-primary' : 'text-t-secondary hover:text-t-primary hover:bg-bg-3'}
                `}
                  onClick={() => {
                    try {
                      setViewMode('source');
                      setIsSplitScreenEnabled(false); // 切换到原文模式时关闭分屏 / Disable split when switching to source
                    } catch {
                      // Silently ignore errors
                    }
                  }}
                >
                  {isHTML ? t('preview.code') : t('preview.source')}
                </div>
                {/* 预览 Tab */}
                <div
                  className={`
                  flex items-center h-full px-16px cursor-pointer transition-all text-14px font-medium
                  ${viewMode === 'preview' ? 'text-primary border-b-2 border-primary' : 'text-t-secondary hover:text-t-primary hover:bg-bg-3'}
                `}
                  onClick={() => {
                    try {
                      setViewMode('preview');
                      setIsSplitScreenEnabled(false); // 切换到预览模式时关闭分屏 / Disable split when switching to preview
                    } catch {
                      // Silently ignore errors
                    }
                  }}
                >
                  {t('preview.preview')}
                </div>
              </div>

              {/* 分屏按钮 / Split-screen button */}
              <div
                className={`flex items-center px-8px py-4px rd-4px cursor-pointer transition-colors ${isSplitScreenEnabled ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`}
                onClick={() => {
                  try {
                    setIsSplitScreenEnabled(!isSplitScreenEnabled);
                  } catch {
                    // Silently ignore errors
                  }
                }}
                title={isSplitScreenEnabled ? t('preview.closeSplitScreen') : t('preview.openSplitScreen')}
              >
                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                  <rect x='3' y='3' width='18' height='18' rx='2' />
                  <line x1='12' y1='3' x2='12' y2='21' />
                </svg>
              </div>
            </>
          )}

          {/* 文件名 / Filename */}
          <span className='text-12px font-medium text-t-primary'>{metadata?.fileName || activeTab.title}</span>
        </div>

        {/* 右侧：操作按钮（编辑/快照/历史/下载/关闭）/ Right: Action buttons (Edit/Snapshot/History/Download/Close) */}
        <div className='flex items-center gap-8px'>
          {/* 编辑按钮（仅对 code 类型且可编辑的内容显示）/ Edit button (only for editable code content) */}
          {contentType === 'code' && isEditable && (
            <div className={`flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors ${isEditMode ? 'bg-primary text-white' : ''}`} onClick={() => (isEditMode ? handleExitEdit() : setIsEditMode(true))} title={isEditMode ? t('preview.exitEdit') : t('preview.edit')}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' className={isEditMode ? 'text-white' : 'text-t-secondary'}>
                <path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
                <path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
              </svg>
              <span className='text-12px'>{isEditMode ? t('preview.exitEdit') : t('preview.edit')}</span>
            </div>
          )}

          {/* 快照和历史按钮（仅对有编辑能力的内容类型显示：markdown/html/code）/ Snapshot and history buttons (only for editable types: markdown/html/code) */}
          {(contentType === 'markdown' || contentType === 'html' || (contentType === 'code' && isEditable)) && (
            <>
              {/* 保存快照按钮 / Snapshot button */}
              <div className={`flex items-center gap-4px px-8px py-4px rd-4px transition-colors ${historyTarget ? 'cursor-pointer hover:bg-bg-3' : 'cursor-not-allowed opacity-50'} ${snapshotSaving ? 'opacity-60' : ''}`} onClick={historyTarget && !snapshotSaving ? handleSaveSnapshot : undefined} title={historyTarget ? t('preview.saveSnapshot') : t('preview.snapshotNotSupported')}>
                <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' className='text-t-secondary'>
                  <path d='M5 7h3l1-2h6l1 2h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Z' />
                  <circle cx='12' cy='13' r='3' />
                </svg>
                <span className='text-12px text-t-secondary'>{t('preview.snapshot')}</span>
              </div>

              {/* 历史版本按钮 / History button */}
              {historyTarget ? (
                <Dropdown droplist={renderHistoryDropdown()} trigger={['hover']} position='br' onVisibleChange={(visible) => visible && refreshHistory()}>
                  <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' title={t('preview.historyVersions')}>
                    <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' className='text-t-secondary'>
                      <path d='M12 8v5l3 2' />
                      <path d='M12 3a9 9 0 1 0 9 9' />
                      <polyline points='21 3 21 9 15 9' />
                    </svg>
                    <span className='text-12px text-t-secondary'>{t('preview.history')}</span>
                  </div>
                </Dropdown>
              ) : (
                <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-not-allowed opacity-50 transition-colors' title={t('preview.historyNotSupported')}>
                  <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' className='text-t-secondary'>
                    <path d='M12 8v5l3 2' />
                    <path d='M12 3a9 9 0 1 0 9 9' />
                    <polyline points='21 3 21 9 15 9' />
                  </svg>
                  <span className='text-12px text-t-secondary'>{t('preview.history')}</span>
                </div>
              )}
            </>
          )}

          {showOpenInSystemButton && (
            <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={handleOpenInSystem} title={t('preview.openInSystemApp')}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
                <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
                <polyline points='15 3 21 3 21 9' />
                <line x1='10' y1='14' x2='21' y2='3' />
              </svg>
              <span className='text-12px text-t-secondary'>{t('preview.openInSystemApp')}</span>
            </div>
          )}

          {/* 下载按钮 / Download button */}
          <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={() => void handleDownload()} title={t('preview.downloadFile')}>
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
              <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
              <polyline points='7 10 12 15 17 10' />
              <line x1='12' y1='15' x2='12' y2='3' />
            </svg>
            <span className='text-12px text-t-secondary'>{t('common.download')}</span>
          </div>

          {/* 关闭预览面板按钮 / Close preview panel button */}
          <div className='cursor-pointer p-4px hover:bg-bg-3 rd-4px transition-colors' onClick={closePreview} title={t('preview.closePreview')}>
            <Close theme='outline' size='18' fill={iconColors.secondary} />
          </div>
        </div>
      </div>

      {/* 预览内容 / Preview content */}
      {renderContent()}

      {/* Tab 右键菜单 / Tab context menu */}
      {contextMenu.show &&
        contextMenu.tabId &&
        (() => {
          const currentIndex = tabs.findIndex((t) => t.id === contextMenu.tabId);
          const hasLeftTabs = currentIndex > 0;
          const hasRightTabs = currentIndex >= 0 && currentIndex < tabs.length - 1;
          const hasOtherTabs = tabs.length > 1;

          return (
            <div
              ref={contextMenuRef}
              className='fixed shadow-lg rd-8px py-4px z-9999'
              style={{
                left: `${contextMenu.x}px`,
                top: `${contextMenu.y}px`,
                backgroundColor: currentTheme === 'dark' ? '#1d1d1f' : '#ffffff',
                border: '1px solid var(--border-base, #e5e6eb)',
                minWidth: '140px',
              }}
            >
              {/* 关闭左侧 / Close tabs to the left */}
              <div className={`px-12px py-8px text-12px transition-colors ${hasLeftTabs ? 'cursor-pointer text-t-primary hover:bg-bg-3' : 'opacity-50 cursor-not-allowed text-t-tertiary'}`} onClick={() => hasLeftTabs && handleCloseLeft(contextMenu.tabId!)}>
                {t('preview.closeLeft')}
              </div>

              {/* 关闭右侧 / Close tabs to the right */}
              <div className={`px-12px py-8px text-12px transition-colors ${hasRightTabs ? 'cursor-pointer text-t-primary hover:bg-bg-3' : 'opacity-50 cursor-not-allowed text-t-tertiary'}`} onClick={() => hasRightTabs && handleCloseRight(contextMenu.tabId!)}>
                {t('preview.closeRight')}
              </div>

              {/* 关闭其他 / Close other tabs */}
              <div className={`px-12px py-8px text-12px transition-colors ${hasOtherTabs ? 'cursor-pointer text-t-primary hover:bg-bg-3' : 'opacity-50 cursor-not-allowed text-t-tertiary'}`} onClick={() => hasOtherTabs && handleCloseOthers(contextMenu.tabId!)}>
                {t('preview.closeOthers')}
              </div>

              {/* 分隔线 / Divider */}
              <div className='h-1px bg-border-1 my-4px mx-8px' />

              {/* 全部关闭 / Close all tabs */}
              <div className='px-12px py-8px text-12px text-t-primary cursor-pointer hover:bg-bg-3 transition-colors' onClick={handleCloseAll}>
                {t('preview.closeAll')}
              </div>
            </div>
          );
        })()}
    </div>
  );
};

export default PreviewPanel;
