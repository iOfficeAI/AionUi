/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePreviewContext } from '@/renderer/context/PreviewContext';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { Close } from '@icon-park/react';
import { Dropdown, Message } from '@arco-design/web-react';
import { iconColors } from '@/renderer/theme/colors';
import { useResizableSplit } from '@/renderer/hooks/useResizableSplit';
import MarkdownEditor from './MarkdownEditor';
import MarkdownPreview from './MarkdownPreview';
import DiffPreview from './DiffPreview';
import CodePreview from './CodePreview';
import PDFPreview from './PDFPreview';
import PPTPreview from './PPTPreview';
import HTMLPreview from './HTMLPreview';
import WordPreview from './WordPreview';
import ExcelPreview from './ExcelPreview';
import { ipcBridge } from '@/common';
import type { PreviewHistoryTarget, PreviewSnapshotInfo } from '@/common/types/preview';
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
  const { isOpen, tabs, activeTabId, activeTab, closeTab, switchTab, closePreview, updateContent, saveContent } = usePreviewContext();
  const layout = useLayoutContext();
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('preview');
  const [historyVersions, setHistoryVersions] = useState<PreviewSnapshotInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const lastSnapshotTimeRef = useRef<number>(0); // 记录上次快照保存时间 / Track last snapshot save time
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

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

  // 内层分割：编辑器和预览的分割比例（默认 50/50）
  // Inner split: Split ratio between editor and preview (default 50/50)
  const { splitRatio, dragHandle } = useResizableSplit({
    defaultWidth: 50,
    minWidth: 20,
    maxWidth: 80,
    storageKey: 'preview-panel-split-ratio',
  });

  // 如果预览面板未打开，不渲染 / Don't render if preview panel is not open
  if (!isOpen || !activeTab) return null;

  const { content, contentType, metadata } = activeTab;
  const isMarkdown = contentType === 'markdown';
  const isEditable = metadata?.editable !== false; // 默认可编辑 / Default editable

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
    } catch (error) {
      console.error('[PreviewPanel] Failed to load preview history:', error);
      setHistoryError(t('preview.loadHistoryFailed'));
    } finally {
      setHistoryLoading(false);
    }
  }, [historyTarget, t]);

  useEffect(() => {
    void refreshHistory().catch((): void => undefined);
  }, [refreshHistory]);

  const handleSaveSnapshot = useCallback(async () => {
    if (!historyTarget || !activeTab) return;
    if (snapshotSaving) return;

    // 防抖检查：如果距离上次保存快照时间小于1秒，则忽略 / Debounce check: Ignore if less than 1 second since last save
    const now = Date.now();
    const DEBOUNCE_TIME = 1000; // 1秒防抖时间 / 1 second debounce time
    if (now - lastSnapshotTimeRef.current < DEBOUNCE_TIME) {
      console.log('[PreviewPanel] Snapshot save debounced, ignoring duplicate click');
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
      console.error('[PreviewPanel] Failed to save snapshot:', error);
      messageApi.error(t('preview.snapshotSaveFailed'));
    } finally {
      setSnapshotSaving(false);
    }
  }, [historyTarget, activeTab, snapshotSaving, messageApi, refreshHistory, t]);

  const handleSnapshotSelect = useCallback(
    async (snapshot: PreviewSnapshotInfo) => {
      if (!historyTarget) return;
      try {
        const result = await ipcBridge.previewHistory.getContent.invoke({ target: historyTarget, snapshotId: snapshot.id });
        if (result?.content) {
          updateContent(result.content);
          messageApi.success(t('preview.historyLoaded'));
        }
      } catch (error) {
        console.error('[PreviewPanel] Failed to load snapshot content:', error);
        messageApi.error(t('preview.historyLoadFailed'));
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

  // 下载文件 / Download file
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // 根据内容类型设置文件扩展名 / Set file extension based on content type
    let ext = 'txt';
    if (contentType === 'markdown') ext = 'md';
    else if (contentType === 'diff') ext = 'diff';
    else if (contentType === 'code') {
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

    link.download = `${metadata?.fileName || `${contentType}-${Date.now()}`}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 渲染预览内容 / Render preview content
  const renderContent = () => {
    // Markdown 模式：左右分割（编辑器 + 预览）
    // Markdown mode: Split layout (editor + preview)
    if (isMarkdown && isEditable) {
      // 移动端：全屏显示预览，隐藏编辑器
      // Mobile: Full-screen preview, hide editor
      if (layout?.isMobile) {
        return (
          <div className='flex-1 overflow-hidden'>
            <MarkdownPreview content={content} hideToolbar />
          </div>
        );
      }

      // 桌面端：左右分割布局
      // Desktop: Split layout
      return (
        <div className='flex flex-1 relative overflow-hidden'>
          {/* 左侧：编辑器 / Left: Editor */}
          <div className='flex flex-col' style={{ width: `${splitRatio}%` }}>
            <div className='h-40px flex items-center px-12px bg-bg-2'>
              <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
            </div>
            <div className='flex-1 overflow-hidden'>
              <MarkdownEditor value={content} onChange={updateContent} />
            </div>
          </div>

          {/* 拖动分割线 / Drag handle */}
          {dragHandle}

          {/* 右侧：预览 / Right: Preview */}
          <div className='flex flex-col' style={{ width: `${100 - splitRatio}%` }}>
            <div className='h-40px flex items-center px-12px bg-bg-2'>
              <span className='text-12px text-t-secondary'>{t('preview.previewEffect')}</span>
            </div>
            <div className='flex-1 overflow-hidden'>
              <MarkdownPreview content={content} hideToolbar />
            </div>
          </div>
        </div>
      );
    }

    // 其他类型：全屏预览 / Other types: Full-screen preview
    if (contentType === 'diff') {
      return <DiffPreview content={content} metadata={metadata} hideToolbar viewMode={viewMode} onViewModeChange={setViewMode} />;
    } else if (contentType === 'code') {
      return <CodePreview content={content} language={metadata?.language} hideToolbar viewMode={viewMode} onViewModeChange={setViewMode} />;
    } else if (contentType === 'markdown' && !isEditable) {
      return <MarkdownPreview content={content} hideToolbar viewMode={viewMode} onViewModeChange={setViewMode} />;
    } else if (contentType === 'html') {
      return <HTMLPreview content={content} filePath={metadata?.filePath} hideToolbar />;
    } else if (contentType === 'pdf') {
      return <PDFPreview filePath={metadata?.filePath} content={content} />;
    } else if (contentType === 'ppt') {
      return <PPTPreview filePath={metadata?.filePath} content={content} />;
    } else if (contentType === 'word') {
      return <WordPreview filePath={metadata?.filePath} content={content} hideToolbar />;
    } else if (contentType === 'excel') {
      return <ExcelPreview filePath={metadata?.filePath} content={content} hideToolbar />;
    }

    return null;
  };

  return (
    <div className='h-full flex flex-col bg-1'>
      {messageContextHolder}
      {/* Tab 栏 / Tab bar */}
      <div className='flex items-center h-40px bg-bg-2 overflow-x-auto'>
        {tabs.map((tab) => (
          <div key={tab.id} className={`flex items-center gap-8px px-12px h-full cursor-pointer transition-colors flex-shrink-0 ${tab.id === activeTabId ? 'bg-bg-1 text-t-primary' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => switchTab(tab.id)}>
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
                closeTab(tab.id);
              }}
            />
          </div>
        ))}
      </div>

      {/* 工具栏：文件名 + 原文/预览/下载 / Toolbar: Filename + Source/Preview/Download */}
      <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
        {/* 左侧：文件名 / Left: Filename */}
        <div className='flex items-center gap-8px'>
          <span className='text-12px font-medium text-t-primary'>{metadata?.fileName || activeTab.title}</span>
        </div>

        {/* 右侧：原文/预览/下载/关闭 / Right: Source/Preview/Download/Close */}
        <div className='flex items-center gap-8px'>
          {/* 只有 Markdown 且非编辑模式才显示原文/预览切换 / Show source/preview toggle only for Markdown in non-editable mode */}
          {isMarkdown && !isEditable && (
            <>
              <div className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'source' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => setViewMode('source')}>
                {t('preview.source')}
              </div>
              <div className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'preview' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => setViewMode('preview')}>
                {t('preview.preview')}
              </div>
            </>
          )}

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

          {/* 下载按钮 / Download button */}
          <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={handleDownload} title={t('preview.downloadFile')}>
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
    </div>
  );
};

export default PreviewPanel;
