/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { usePreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { Button, Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownPreview from './MarkdownViewer';

interface OfficeDocPreviewProps {
  /**
   * Office document file path (absolute path on disk)
   * Office 文档文件路径（磁盘上的绝对路径）
   */
  filePath?: string;
  /**
   * Office document content (not used, kept for compatibility)
   * Office 文档内容（暂不使用，保留用于兼容）
   */
  content?: string;
  /**
   * Document type: 'word' for Word documents, 'ppt' for PowerPoint presentations
   * 文档类型：'word' 表示 Word 文档，'ppt' 表示 PowerPoint 演示文稿
   */
  docType: 'word' | 'ppt';
  hideToolbar?: boolean;
}

/**
 * Office Document Preview Component
 * Office 文档预览组件
 *
 * Supports Word (.docx) and PowerPoint (.pptx) files:
 * - Word: Converts to Markdown using mammoth + turndown, then renders with MarkdownPreview
 * - PPT: Shows prompt to open in system application (PowerPoint/Keynote/WPS)
 *
 * 支持 Word (.docx) 和 PowerPoint (.pptx) 文件：
 * - Word：使用 mammoth + turndown 转换为 Markdown，然后用 MarkdownPreview 渲染
 * - PPT：显示提示，引导用户在系统应用（PowerPoint/Keynote/WPS）中打开
 */
const OfficeDocPreview: React.FC<OfficeDocPreviewProps> = ({ filePath, docType, hideToolbar = false }) => {
  const { t } = useTranslation();
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const toolbarExtrasContext = usePreviewToolbarExtras();
  const usePortalToolbar = Boolean(toolbarExtrasContext) && !hideToolbar;

  /**
   * Load Word document and convert to Markdown
   * 加载 Word 文档并转换为 Markdown
   */
  useEffect(() => {
    // PPT files don't need loading/conversion
    if (docType === 'ppt') {
      setLoading(false);
      return;
    }

    const loadDocument = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!filePath) {
          throw new Error(t('preview.errors.missingFilePath'));
        }

        // Use backend conversion service
        // Request conversion via unified document.convert IPC
        const response = await ipcBridge.document.convert.invoke({ filePath, to: 'markdown' });

        if (response.to !== 'markdown') {
          throw new Error(t('preview.errors.conversionFailed'));
        }

        if (response.result.success && response.result.data) {
          setMarkdown(response.result.data);
        } else {
          throw new Error(response.result.error || t('preview.errors.conversionFailed'));
        }
      } catch (err) {
        const defaultMessage = t('preview.word.loadFailed');
        const errorMessage = err instanceof Error ? err.message : defaultMessage;
        setError(`${errorMessage}\n${t('preview.pathLabel')}: ${filePath}`);
        Message.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    void loadDocument();
  }, [filePath, t, docType]);

  /**
   * Open document in system default application
   * 在系统默认应用中打开文档
   */
  const handleOpenInSystem = useCallback(async () => {
    if (!filePath) {
      messageApi.error(t('preview.errors.openWithoutPath'));
      return;
    }

    try {
      await ipcBridge.shell.openFile.invoke(filePath);
      messageApi.info(t('preview.openInSystemSuccess'));
    } catch (err) {
      messageApi.error(t('preview.openInSystemFailed'));
    }
  }, [filePath, messageApi, t]);

  /**
   * Show file location in folder
   * 在文件夹中显示文件位置
   */
  const handleShowInFolder = useCallback(async () => {
    if (!filePath) return;
    try {
      await ipcBridge.shell.showItemInFolder.invoke(filePath);
    } catch (err) {
      // Silently handle error
    }
  }, [filePath]);

  // Set toolbar extras (must be called before any conditional returns)
  useEffect(() => {
    if (!usePortalToolbar || !toolbarExtrasContext || loading || error || docType === 'ppt') return;
    toolbarExtrasContext.setExtras({
      left: (
        <div className='flex items-center gap-8px'>
          <span className='text-13px text-t-secondary'>📄 {t('preview.word.title')}</span>
        </div>
      ),
      right: null,
    });
    return () => toolbarExtrasContext.setExtras(null);
  }, [usePortalToolbar, toolbarExtrasContext, t, loading, error, docType]);

  // PPT: Show prompt to open in external application
  if (docType === 'ppt') {
    return (
      <div className='h-full w-full bg-bg-1 flex items-center justify-center'>
        {messageContextHolder}
        <div className='text-center max-w-400px'>
          <div className='text-48px mb-16px'>📊</div>
          <div className='text-16px text-t-primary font-medium mb-8px'>{t('preview.pptTitle')}</div>
          <div className='text-13px text-t-secondary mb-24px'>{t('preview.pptOpenHint')}</div>

          {filePath && (
            <div className='flex items-center justify-center gap-12px'>
              <Button size='small' onClick={handleOpenInSystem}>
                <span>{t('preview.pptOpenFile')}</span>
              </Button>
              <Button size='small' onClick={handleShowInFolder}>
                {t('preview.pptShowLocation')}
              </Button>
            </div>
          )}

          <div className='text-11px text-t-tertiary mt-16px'>{t('preview.pptSystemAppHint')}</div>
        </div>
      </div>
    );
  }

  // Word: Loading state
  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>{t('preview.word.loading')}</div>
      </div>
    );
  }

  // Word: Error state
  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>{t('preview.word.invalid')}</div>
        </div>
      </div>
    );
  }

  // Word: Render markdown preview
  return (
    <div className='h-full w-full flex flex-col bg-bg-1'>
      {messageContextHolder}

      {/* Toolbar */}
      {!usePortalToolbar && !hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-13px text-t-secondary'>📄 {t('preview.word.title')}</span>
          </div>

          {/* Right button group */}
          <div className='flex items-center gap-8px'>
            <div
              className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors text-12px text-t-secondary'
              onClick={handleOpenInSystem}
              title={t('preview.openWithApp', { app: 'Word' })}
            >
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
                <polyline points='15 3 21 3 21 9' />
                <line x1='10' y1='14' x2='21' y2='3' />
              </svg>
              <span>{t('preview.openWithApp', { app: 'Word' })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Content area */}
      <div className='flex-1 overflow-hidden'>
        <MarkdownPreview content={markdown} hideToolbar />
      </div>
    </div>
  );
};

export default OfficeDocPreview;
