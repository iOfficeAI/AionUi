/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { downloadFileFromPath, downloadTextContent } from '@/renderer/utils/file/download';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { toLocalFileHref } from '@/renderer/components/Markdown/markdownUtils';
import { PreviewToolbarExtrasProvider, type PreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { usePreviewContext } from '../../context/PreviewContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import { Link } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiffPreview from '../viewers/DiffViewer';
import ExcelPreview from '../viewers/ExcelViewer';
import HTMLEditor from '../editors/HTMLEditor';
import HTMLRenderer from '../renderers/HTMLRenderer';
import ImagePreview from '../viewers/ImageViewer';
import MarkdownEditor from '../editors/MarkdownEditor';
import MarkdownPreview from '../viewers/MarkdownViewer';
import PDFPreview from '../viewers/PDFViewer';
import OfficeDocPreview from '../viewers/OfficeDocViewer';
import PptViewer from '../viewers/PptViewer';
import CodeEditor from '../editors/CodeEditor';
import URLViewer from '../viewers/URLViewer';
import {
  PreviewTabs,
  PreviewToolbar,
  PreviewContextMenu,
  PreviewConfirmModals,
  PreviewHistoryDropdown,
  type ContextMenuState,
  type CloseTabConfirmState,
  type PreviewTab,
} from '.';
import { DEFAULT_SPLIT_RATIO, FILE_TYPES_WITH_BUILTIN_OPEN, MAX_SPLIT_WIDTH, MIN_SPLIT_WIDTH } from '../../constants';
import {
  usePreviewHistory,
  usePreviewKeyboardShortcuts,
  useScrollSync,
  useTabOverflow,
  useThemeDetection,
} from '../../hooks';
import { useTranslation } from 'react-i18next';
import './preview.css';

/**
 * 预览面板主组件
 * Main preview panel component
 *
 * 支持多 Tab 切换，每个 Tab 可以显示不同类型的内容
 * Supports multiple tabs, each tab can display different types of content
 */
const PreviewPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    isOpen,
    tabs,
    activeTabId,
    activeTab,
    closeTab,
    switchTab,
    closePreview,
    updateContent,
    saveContent,
    addDomSnippet,
  } = usePreviewContext();
  const layout = useLayoutContext();

  // 视图状态 / View states
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('preview');
  const [isSplitScreenEnabled, setIsSplitScreenEnabled] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [toolbarExtras, setToolbarExtras] = useState<PreviewToolbarExtras | null>(null);

  // 切换文件时把视图模式复位为预览，避免上一个文件的 source 模式串到下一个文件（如代码文件丢失语法高亮）。
  // 注意：单预览浏览模式下打开新文件会复用当前 tab 的 id，所以这里要监听实际显示的文件标识（路径 + 类型），
  // 而不是 activeTabId（它不会变）。
  // Reset view mode to preview when the displayed file changes so a previous file's source mode does not
  // leak into the next one (e.g. a code file losing syntax highlighting). In single-preview browse mode a
  // new file reuses the active tab's id, so we key on the file identity (path + type), not activeTabId.
  useEffect(() => {
    setViewMode('preview');
  }, [activeTabId, activeTab?.metadata?.file_path, activeTab?.content_type]);

  // 确认对话框状态 / Confirmation dialog states
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
  const {
    historyVersions,
    historyLoading,
    snapshotSaving,
    historyError,
    historyTarget,
    refreshHistory,
    handleSaveSnapshot,
    handleSnapshotSelect,
    messageApi,
    messageContextHolder,
  } = usePreviewHistory({
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
    (new_content: string) => {
      // 严格的类型检查，防止 Event 对象被错误传递 / Strict type checking to prevent Event object from being passed incorrectly
      if (typeof new_content !== 'string') {
        return;
      }
      try {
        updateContent(new_content);
      } catch {
        // Silently ignore errors
      }
    },
    [updateContent]
  );

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

  const { content, content_type, metadata } = activeTab;
  const isMarkdown = content_type === 'markdown';
  const isHTML = content_type === 'html';
  const isEditable = metadata?.editable !== false; // 默认可编辑 / Default editable

  // 检查文件类型是否已有内置的打开按钮（Word、PPT、PDF、Excel 组件内部已提供）
  // Check if file type already has built-in open button
  // (Word, PPT, PDF, Excel components provide their own)
  const hasBuiltInOpenButton = (FILE_TYPES_WITH_BUILTIN_OPEN as readonly string[]).includes(content_type);

  // 对所有有 file_path 的文件显示"在系统中打开"按钮（统一在工具栏显示）
  // Show "Open in System" button for all files with file_path (unified in toolbar)
  const showOpenInSystemButton = Boolean(metadata?.file_path);

  // 下载文件到本地 / Download file to local system
  const handleDownload = useCallback(async () => {
    try {
      const rawFileName = metadata?.file_name || `${content_type}-${Date.now()}`;

      if (metadata?.file_path) {
        // All files with a disk path (binary, image, zip, etc.) — unified path
        await downloadFileFromPath(metadata.file_path, rawFileName, metadata.workspace);
        return;
      }

      if (content_type === 'image') {
        // Pure base64 image (no file path on disk)
        if (!content) {
          messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
          return;
        }
        const blob = await fetch(content).then((res) => res.blob());
        const nameExt = metadata?.file_name?.split('.').pop();
        const mimeExt = blob.type?.includes('/') ? blob.type.split('/').pop() : undefined;
        const ext = nameExt || mimeExt || 'png';
        const normalizedExt = ext.toLowerCase();
        const hasSameExt = rawFileName.toLowerCase().endsWith(`.${normalizedExt}`);
        const file_name = hasSameExt ? rawFileName : `${rawFileName}.${ext}`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      // Text / code content (no file path, no binary)
      const nameExt = metadata?.file_name?.split('.').pop();
      let mimeType = 'text/plain;charset=utf-8';
      let ext = 'txt';
      if (content_type === 'markdown') {
        mimeType = 'text/markdown;charset=utf-8';
        ext = 'md';
      } else if (content_type === 'html') {
        mimeType = 'text/html;charset=utf-8';
        ext = 'html';
      } else if (content_type === 'diff') {
        ext = 'diff';
      } else if (content_type === 'code') {
        // Code files: set extension based on language
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
      if (nameExt) ext = nameExt;
      const normalizedExt = ext.toLowerCase();
      const hasSameExt = rawFileName.toLowerCase().endsWith(`.${normalizedExt}`);
      const file_name = hasSameExt ? rawFileName : `${rawFileName}.${ext}`;
      downloadTextContent(content, file_name, mimeType);
    } catch (error) {
      console.error('[PreviewPanel] Failed to download file:', error);
      messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
    }
  }, [content, content_type, metadata?.file_name, metadata?.file_path, metadata?.language, messageApi, t]);

  // 在系统默认应用中打开文件 / Open file in system default application
  const handleOpenInSystem = useCallback(async () => {
    if (!metadata?.file_path) {
      try {
        messageApi.error(t('preview.openInSystemFailed'));
      } catch {
        // Context holder may be unmounted
      }
      return;
    }

    try {
      // 使用系统默认应用打开文件 / Open file with system default application
      await ipcBridge.shell.openFile.invoke(metadata.file_path);
      try {
        messageApi.success(t('preview.openInSystemSuccess'));
      } catch {
        // Context holder may be unmounted after async operation
      }
    } catch (err) {
      try {
        messageApi.error(t('preview.openInSystemFailed'));
      } catch {
        // Context holder may be unmounted after async operation
      }
    }
  }, [metadata?.file_path, messageApi, t]);

  // 渲染历史下拉菜单 / Render history dropdown
  const renderHistoryDropdown = () => {
    // eslint-disable-next-line max-len
    return (
      <PreviewHistoryDropdown
        historyVersions={historyVersions}
        historyLoading={historyLoading}
        historyError={historyError}
        historyTarget={historyTarget}
        currentTheme={currentTheme}
        onSnapshotSelect={handleSnapshotSelect}
      />
    );
  };

  const renderMissingFile = () => {
    const filePath = metadata?.file_path;
    const externalHref = filePath ? toLocalFileHref(filePath) : undefined;

    return (
      <div className='flex flex-1 flex-col items-center justify-center gap-10px px-24px text-center'>
        <div className='text-15px font-medium text-t-primary'>
          {t('preview.missingFile.title', { defaultValue: 'File not found' })}
        </div>
        <div className='max-w-560px break-all text-12px leading-18px text-t-secondary'>
          {filePath || t('preview.errors.missingFilePath')}
        </div>
        {externalHref && (
          <Link href={externalHref} target='_blank' rel='noreferrer' className='text-13px'>
            {t('preview.missingFile.openInNewTab', { defaultValue: 'Try opening in a new tab' })}
          </Link>
        )}
      </div>
    );
  };

  // 渲染预览内容 / Render preview content
  const renderContent = () => {
    if (metadata?.missingFile) return renderMissingFile();

    // Markdown 模式 / Markdown mode
    if (isMarkdown) {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled) {
        // 移动端：全屏显示预览，隐藏编辑器 / Mobile: Full-screen preview, hide editor
        if (layout?.isMobile) {
          return (
            <div className='flex-1 overflow-hidden'>
              <MarkdownPreview content={content} file_path={metadata?.file_path} workspace={metadata?.workspace} />
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
                <MarkdownEditor
                  key={activeTabId ?? undefined}
                  value={content}
                  onChange={updateContent}
                  containerRef={editorContainerRef}
                  onScroll={handleEditorScroll}
                />
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
                <MarkdownPreview
                  content={content}
                  containerRef={previewContainerRef}
                  onScroll={handlePreviewScroll}
                  file_path={metadata?.file_path}
                  workspace={metadata?.workspace}
                />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：单栏（原文或预览）/ Non-split mode: Single panel (source or preview)
      return (
        <MarkdownPreview
          content={content}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onContentChange={updateContent}
          file_path={metadata?.file_path}
          workspace={metadata?.workspace}
        />
      );
    }

    // HTML 模式 / HTML mode
    if (isHTML) {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled) {
        // 移动端：全屏显示预览，隐藏编辑器 / Mobile: Full-screen preview, hide editor
        if (layout?.isMobile) {
          return (
            <div className='flex-1 overflow-hidden'>
              <HTMLRenderer
                content={content}
                file_path={metadata?.file_path}
                workspace={metadata?.workspace}
                isDirty={activeTab?.isDirty}
                copySuccessMessage={t('preview.html.copySuccess')}
                inspectMode={inspectMode}
                onElementSelected={handleElementSelected}
              />
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
                <HTMLEditor
                  key={activeTabId ?? undefined}
                  value={content}
                  onChange={updateContent}
                  containerRef={editorContainerRef}
                  onScroll={handleEditorScroll}
                  file_path={metadata?.file_path}
                />
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
                <HTMLRenderer
                  content={content}
                  file_path={metadata?.file_path}
                  workspace={metadata?.workspace}
                  isDirty={activeTab?.isDirty}
                  containerRef={previewContainerRef}
                  onScroll={handlePreviewScroll}
                  inspectMode={inspectMode}
                  copySuccessMessage={t('preview.html.copySuccess')}
                  onElementSelected={handleElementSelected}
                />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：单栏（原文或预览）/ Non-split mode: Single panel (source or preview)
      if (viewMode === 'source') {
        return (
          <div className='flex-1 overflow-hidden'>
            <HTMLEditor
              key={activeTabId ?? undefined}
              value={content}
              onChange={handleContentChange}
              file_path={metadata?.file_path}
            />
          </div>
        );
      } else {
        // 预览模式 / Preview mode
        return (
          <div className='flex-1 overflow-hidden'>
            <HTMLRenderer
              content={content}
              file_path={metadata?.file_path}
              workspace={metadata?.workspace}
              isDirty={activeTab?.isDirty}
              inspectMode={inspectMode}
              copySuccessMessage={t('preview.html.copySuccess')}
              onElementSelected={handleElementSelected}
            />
          </div>
        );
      }
    }

    // 其他类型：全屏预览 / Other types: Full-screen preview
    if (content_type === 'diff') {
      return (
        <DiffPreview
          content={content}
          metadata={metadata}
          hideToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      );
    } else if (content_type === 'code') {
      // 统一：始终可编辑的 CodeEditor（看=改）/ Unified: always-editable CodeEditor (view = edit)
      return (
        <div className='flex-1 overflow-hidden'>
          <CodeEditor
            key={activeTabId ?? undefined}
            value={content}
            onChange={handleContentChange}
            language={metadata?.language}
            fileName={metadata?.file_name}
            readOnly={isEditable === false}
            targetLine={metadata?.targetLine}
            targetColumn={metadata?.targetColumn}
          />
        </div>
      );
    } else if (content_type === 'pdf') {
      return <PDFPreview file_path={metadata?.file_path} content={content} />;
    } else if (content_type === 'ppt') {
      return <PptViewer file_path={metadata?.file_path} content={content} workspace={metadata?.workspace} />;
    } else if (content_type === 'word') {
      return <OfficeDocPreview file_path={metadata?.file_path} content={content} workspace={metadata?.workspace} />;
    } else if (content_type === 'excel') {
      return <ExcelPreview file_path={metadata?.file_path} content={content} workspace={metadata?.workspace} />;
    } else if (content_type === 'image') {
      return (
        <ImagePreview
          file_path={metadata?.file_path}
          content={content}
          file_name={metadata?.file_name || metadata?.title}
          workspace={metadata?.workspace}
        />
      );
    } else if (content_type === 'url') {
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
        <PreviewConfirmModals
          closeTabConfirm={closeTabConfirm}
          onSaveAndCloseTab={handleSaveAndCloseTab}
          onCloseWithoutSave={handleCloseWithoutSave}
          onCancelCloseTab={handleCancelCloseTab}
        />

        {/* Tab 栏 / Tab bar */}
        {/* eslint-disable-next-line max-len */}
        <PreviewTabs
          tabs={previewTabs}
          activeTabId={activeTabId}
          tabFadeState={tabFadeState}
          tabsContainerRef={tabsContainerRef}
          onSwitchTab={switchTab}
          onCloseTab={handleCloseTab}
          onContextMenu={handleTabContextMenu}
          onClosePanel={closePreview}
        />

        {/* 工具栏（URL 类型不显示工具栏，因为不需要下载/编辑等功能）/ Toolbar (hidden for URL type as it doesn't need download/edit features) */}
        {content_type !== 'url' && !metadata?.missingFile && (
          <PreviewToolbar
            content_type={content_type}
            isMarkdown={isMarkdown}
            isHTML={isHTML}
            viewMode={viewMode}
            isSplitScreenEnabled={isSplitScreenEnabled}
            file_name={metadata?.file_name || activeTab.title}
            showOpenInSystemButton={showOpenInSystemButton}
            historyTarget={historyTarget}
            snapshotSaving={snapshotSaving}
            onViewModeChange={(mode) => {
              setViewMode(mode);
              setIsSplitScreenEnabled(false); // 切换视图模式时关闭分屏 / Disable split when switching view mode
            }}
            onSplitScreenToggle={() => setIsSplitScreenEnabled(!isSplitScreenEnabled)}
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

        {metadata?.truncated && (
          <div className='sticky top-0 z-1 px-16px py-10px text-12px bg-warning-1 text-warning-7 border-b border-warning-3'>
            {t('preview.truncatedBanner')}
          </div>
        )}

        {/* 预览内容 / Preview content */}
        {renderContent()}

        {/* Tab 右键菜单 / Tab context menu */}
        {/* eslint-disable-next-line max-len */}
        <PreviewContextMenu
          contextMenu={contextMenu}
          tabs={previewTabs}
          currentTheme={currentTheme}
          onClose={() => setContextMenu({ show: false, x: 0, y: 0, tabId: null })}
          onCloseLeft={handleCloseLeft}
          onCloseRight={handleCloseRight}
          onCloseOthers={handleCloseOthers}
          onCloseAll={handleCloseAll}
        />
      </div>
    </PreviewToolbarExtrasProvider>
  );
};

export default PreviewPanel;
