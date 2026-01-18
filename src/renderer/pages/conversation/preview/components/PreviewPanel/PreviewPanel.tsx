/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { PreviewToolbarExtrasProvider, type PreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { usePreviewContext } from '../../context/PreviewContext';
import { useResizableSplit } from '@/renderer/hooks/useResizableSplit';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import CodePreview from '../viewers/CodeViewer';
import DiffPreview from '../viewers/DiffViewer';
import ExcelPreview from '../viewers/ExcelViewer';
import HTMLEditor from '../editors/HTMLEditor';
import HTMLRenderer from '../renderers/HTMLRenderer';
import ImagePreview from '../viewers/ImageViewer';
import MarkdownEditor from '../editors/MarkdownEditor';
import MarkdownPreview from '../viewers/MarkdownViewer';
import PDFPreview from '../viewers/PDFViewer';
import PPTPreview from '../viewers/PPTViewer';
import TextEditor from '../editors/TextEditor';
import WordPreview from '../viewers/WordViewer';
import URLViewer from '../viewers/URLViewer';
import { PreviewTabs, PreviewToolbar, PreviewContextMenu, PreviewConfirmModals, PreviewHistoryDropdown, type ContextMenuState, type CloseTabConfirmState, type PreviewTab } from '.';
import { DEFAULT_SPLIT_RATIO, FILE_TYPES_WITH_BUILTIN_OPEN, MAX_SPLIT_WIDTH, MIN_SPLIT_WIDTH } from '../../constants';
import { usePreviewHistory, usePreviewKeyboardShortcuts, useScrollSync, useTabOverflow, useThemeDetection } from '../../hooks';
import { useTranslation } from 'react-i18next';

/**
 * 预览面板主组件
 * Main preview panel component
 *
 * 支持多 Tab 切换，每个 Tab 可以显示不同类型的内容
 * Supports multiple tabs, each tab can display different types of content
 */
const PreviewPanel: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, tabs, activeTabId, activeTab, closeTab, switchTab, closePreview, updateContent, saveContent, addDomSnippet } = usePreviewContext();
  const layout = useLayoutContext();

  // 视图状态 / View states
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('preview');
  const [isSplitScreenEnabled, setIsSplitScreenEnabled] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [toolbarExtras, setToolbarExtras] = useState<PreviewToolbarExtras | null>(null);

  // 确认对话框状态 / Confirmation dialog states
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [closeTabConfirm, setCloseTabConfirm] = useState<CloseTabConfirmState>({ show: false, tabId: null });

  // 右键菜单状态 / Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0, tabId: null });

  // 容器引用 / Container refs
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // 使用自定义 Hooks / Use custom hooks
  const currentTheme = useThemeDetection();
  const { tabsContainerRef, tabFadeState } = useTabOverflow([tabs, activeTabId]);
  const { handleEditorScroll, handlePreviewScroll } = useScrollSync({
    enabled: isSplitScreenEnabled,
    editorContainerRef,
    previewContainerRef,
  });

  // eslint-disable-next-line max-len
  const { historyVersions, historyLoading, snapshotSaving, historyError, historyTarget, refreshHistory, handleSaveSnapshot, handleSnapshotSelect, messageApi, messageContextHolder } = usePreviewHistory({
    activeTab,
    updateContent,
  });

  usePreviewKeyboardShortcuts({
    isDirty: activeTab?.isDirty,
    onSave: () => void saveContent(),
  });

  const setToolbarExtrasCallback = useCallback((extras: PreviewToolbarExtras | null) => {
    setToolbarExtras(extras);
  }, []);

  // 处理 HTML 审核模式元素选中 / Handle HTML inspect mode element selection
  const handleElementSelected = useCallback(
    (element: { html: string; tag: string }) => {
      addDomSnippet(element.tag, element.html);
    },
    [addDomSnippet]
  );

  const toolbarExtrasContextValue = useMemo(
    () => ({
      setExtras: setToolbarExtrasCallback,
    }),
    [setToolbarExtrasCallback]
  );

  // 内层分割：编辑器和预览的分割比例（默认 50/50）
  // Inner split: Split ratio between editor and preview (default 50/50)
  const { splitRatio, createDragHandle } = useResizableSplit({
    defaultWidth: DEFAULT_SPLIT_RATIO,
    minWidth: MIN_SPLIT_WIDTH,
    maxWidth: MAX_SPLIT_WIDTH,
    storageKey: 'preview-panel-split-ratio',
  });

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
  const handleSaveAndCloseTab = useCallback(async () => {
    if (!closeTabConfirm.tabId) return;

    try {
      const success = await saveContent(closeTabConfirm.tabId);
      if (!success) {
        throw new Error(t('common.saveFailed'));
      }
      closeTab(closeTabConfirm.tabId);
      setCloseTabConfirm({ show: false, tabId: null });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('common.unknownError');
      messageApi.error(`${t('common.saveFailed')}: ${errorMsg}`);
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
      if (currentIndex <= 0) return;

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
      if (currentIndex < 0 || currentIndex >= tabs.length - 1) return;

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
  // Check if file type already has built-in open button
  // (Word, PPT, PDF, Excel components provide their own)
  const hasBuiltInOpenButton = (FILE_TYPES_WITH_BUILTIN_OPEN as readonly string[]).includes(contentType);

  // 对所有有 filePath 的文件显示"在系统中打开"按钮（统一在工具栏显示）
  // Show "Open in System" button for all files with filePath (unified in toolbar)
  const showOpenInSystemButton = Boolean(metadata?.filePath);

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
      const rawFileName = metadata?.fileName || `${contentType}-${Date.now()}`;
      const normalizedExt = ext.toLowerCase();
      const hasSameExt = rawFileName.toLowerCase().endsWith(`.${normalizedExt}`);
      link.download = hasSameExt ? rawFileName : `${rawFileName}.${ext}`;
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

  // 渲染历史下拉菜单 / Render history dropdown
  const renderHistoryDropdown = () => {
    // eslint-disable-next-line max-len
    return <PreviewHistoryDropdown historyVersions={historyVersions} historyLoading={historyLoading} historyError={historyError} historyTarget={historyTarget} currentTheme={currentTheme} onSnapshotSelect={handleSnapshotSelect} />;
  };

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
              <MarkdownPreview content={content} hideToolbar filePath={metadata?.filePath} />
            </div>
          );
        }

        // 桌面端：左右分割布局 / Desktop: Split layout
        return (
          <div className='flex flex-1 relative overflow-hidden'>
            {/* 左侧：编辑器 / Left: Editor */}
            <div className='flex flex-col relative' style={{ width: `${splitRatio}%` }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <MarkdownEditor value={content} onChange={updateContent} containerRef={editorContainerRef} onScroll={handleEditorScroll} />
              </div>
              {/* 拖动分割线 / Drag handle */}
              {createDragHandle({ className: 'absolute right-0 top-0 bottom-0' })}
            </div>

            {/* 右侧：预览 / Right: Preview */}
            <div className='flex flex-col' style={{ width: `${100 - splitRatio}%`, minWidth: 0 }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.preview')}</span>
              </div>
              <div className='flex flex-col flex-1 overflow-hidden'>
                <MarkdownPreview content={content} hideToolbar containerRef={previewContainerRef} onScroll={handlePreviewScroll} filePath={metadata?.filePath} />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：单栏（原文或预览）/ Non-split mode: Single panel (source or preview)
      return <MarkdownPreview content={content} hideToolbar viewMode={viewMode} onViewModeChange={setViewMode} onContentChange={updateContent} filePath={metadata?.filePath} />;
    }

    // HTML 模式 / HTML mode
    if (isHTML) {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled) {
        // 移动端：全屏显示预览，隐藏编辑器 / Mobile: Full-screen preview, hide editor
        if (layout?.isMobile) {
          return (
            <div className='flex-1 overflow-hidden'>
              <HTMLRenderer content={content} filePath={metadata?.filePath} copySuccessMessage={t('preview.html.copySuccess')} inspectMode={inspectMode} onElementSelected={handleElementSelected} />
            </div>
          );
        }

        // 桌面端：左右分割布局 / Desktop: Split layout
        return (
          <div className='flex flex-1 relative overflow-hidden'>
            {/* 左侧：编辑器 / Left: Editor */}
            <div className='flex flex-col relative' style={{ width: `${splitRatio}%` }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <HTMLEditor value={content} onChange={updateContent} containerRef={editorContainerRef} onScroll={handleEditorScroll} filePath={metadata?.filePath} />
              </div>
              {/* 拖动分割线 / Drag handle */}
              {createDragHandle({ className: 'absolute right-0 top-0 bottom-0' })}
            </div>

            {/* 右侧：预览 / Right: Preview */}
            <div className='flex flex-col' style={{ width: `${100 - splitRatio}%`, minWidth: 0 }}>
              <div className='h-40px flex items-center justify-between px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.preview')}</span>
              </div>
              <div className='flex flex-col flex-1 overflow-hidden'>
                {/* prettier-ignore */}
                {/* eslint-disable-next-line max-len */}
                <HTMLRenderer content={content} filePath={metadata?.filePath} containerRef={previewContainerRef} onScroll={handlePreviewScroll} inspectMode={inspectMode} copySuccessMessage={t('preview.html.copySuccess')} onElementSelected={handleElementSelected} />
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
        // 预览模式 / Preview mode
        return (
          <div className='flex-1 overflow-hidden'>
            <HTMLRenderer content={content} filePath={metadata?.filePath} inspectMode={inspectMode} copySuccessMessage={t('preview.html.copySuccess')} onElementSelected={handleElementSelected} />
          </div>
        );
      }
    }

    // 其他类型：全屏预览 / Other types: Full-screen preview
    if (contentType === 'diff') {
      return <DiffPreview content={content} metadata={metadata} hideToolbar viewMode={viewMode} onViewModeChange={setViewMode} />;
    } else if (contentType === 'code') {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled && isEditMode && isEditable) {
        return (
          <div className='flex flex-1 relative overflow-hidden'>
            {/* 左侧：编辑器 / Left: Editor */}
            <div className='flex flex-col relative' style={{ width: `${splitRatio}%` }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <TextEditor value={content} onChange={updateContent} />
              </div>
              {/* 拖动分割线 / Drag handle */}
              {createDragHandle({ className: 'absolute right-0 top-0 bottom-0' })}
            </div>

            {/* 右侧：预览 / Right: Preview */}
            <div className='flex flex-col' style={{ width: `${100 - splitRatio}%`, minWidth: 0 }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.preview')}</span>
              </div>
              <div className='flex flex-col flex-1 overflow-hidden'>
                <CodePreview content={content} language={metadata?.language} hideToolbar />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：如果处于编辑模式且可编辑，显示文本编辑器 / Non-split mode: If in edit mode and editable, show text editor
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
    } else if (contentType === 'url') {
      // URL 预览模式 / URL preview mode
      return <URLViewer url={content} title={metadata?.title} />;
    }

    return null;
  };

  // 将 tabs 转换为 PreviewTab 类型 / Convert tabs to PreviewTab type
  const previewTabs: PreviewTab[] = tabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    isDirty: tab.isDirty,
  }));

  return (
    <PreviewToolbarExtrasProvider value={toolbarExtrasContextValue}>
      <div className='h-full flex flex-col bg-1 rounded-[16px]'>
        {messageContextHolder}

        {/* 确认对话框 / Confirmation modals */}
        {/* eslint-disable-next-line max-len */}
        <PreviewConfirmModals showExitConfirm={showExitConfirm} closeTabConfirm={closeTabConfirm} onConfirmExit={handleConfirmExit} onCancelExit={handleCancelExit} onSaveAndCloseTab={handleSaveAndCloseTab} onCloseWithoutSave={handleCloseWithoutSave} onCancelCloseTab={handleCancelCloseTab} />

        {/* Tab 栏 / Tab bar */}
        {/* eslint-disable-next-line max-len */}
        <PreviewTabs tabs={previewTabs} activeTabId={activeTabId} tabFadeState={tabFadeState} tabsContainerRef={tabsContainerRef} onSwitchTab={switchTab} onCloseTab={handleCloseTab} onContextMenu={handleTabContextMenu} onClosePanel={closePreview} />

        {/* 工具栏（URL 类型不显示工具栏，因为不需要下载/编辑等功能）/ Toolbar (hidden for URL type as it doesn't need download/edit features) */}
        {contentType !== 'url' && (
          <PreviewToolbar
            contentType={contentType}
            isMarkdown={isMarkdown}
            isHTML={isHTML}
            isEditable={isEditable}
            isEditMode={isEditMode}
            viewMode={viewMode}
            isSplitScreenEnabled={isSplitScreenEnabled}
            fileName={metadata?.fileName || activeTab.title}
            showOpenInSystemButton={showOpenInSystemButton}
            historyTarget={historyTarget}
            snapshotSaving={snapshotSaving}
            onViewModeChange={(mode) => {
              setViewMode(mode);
              setIsSplitScreenEnabled(false); // 切换视图模式时关闭分屏 / Disable split when switching view mode
            }}
            onSplitScreenToggle={() => setIsSplitScreenEnabled(!isSplitScreenEnabled)}
            onEditClick={() => {
              setIsEditMode(true);
              // Code/TXT 类型进入编辑模式时自动开启分屏 / Auto enable split screen for Code/TXT when entering edit mode
              if (contentType === 'code') {
                setIsSplitScreenEnabled(true);
              }
            }}
            onExitEdit={handleExitEdit}
            onSaveSnapshot={handleSaveSnapshot}
            onRefreshHistory={refreshHistory}
            renderHistoryDropdown={renderHistoryDropdown}
            onOpenInSystem={handleOpenInSystem}
            onDownload={handleDownload}
            onClose={closePreview}
            inspectMode={inspectMode}
            onInspectModeToggle={() => setInspectMode(!inspectMode)}
            leftExtra={toolbarExtras?.left}
            rightExtra={toolbarExtras?.right}
          />
        )}

        {/* 预览内容 / Preview content */}
        {renderContent()}

        {/* Tab 右键菜单 / Tab context menu */}
        {/* eslint-disable-next-line max-len */}
        <PreviewContextMenu contextMenu={contextMenu} tabs={previewTabs} currentTheme={currentTheme} onClose={() => setContextMenu({ show: false, x: 0, y: 0, tabId: null })} onCloseLeft={handleCloseLeft} onCloseRight={handleCloseRight} onCloseOthers={handleCloseOthers} onCloseAll={handleCloseAll} />
      </div>
    </PreviewToolbarExtrasProvider>
  );
};

export default PreviewPanel;
