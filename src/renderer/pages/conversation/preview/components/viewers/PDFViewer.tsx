/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { usePreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { Button, Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PDFPreviewProps {
  /**
   * PDF file path (absolute path on disk)
   * PDF 文件路径（磁盘上的绝对路径）
   */
  filePath?: string;
  /**
   * PDF content as base64 or blob URL
   * PDF 内容（base64 或 blob URL）
   */
  content?: string;
  hideToolbar?: boolean;
}

// Electron webview 元素的类型定义 / Type definition for Electron webview element
interface ElectronWebView extends HTMLElement {
  src: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ filePath, content, hideToolbar = false }) => {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef<ElectronWebView>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const toolbarExtrasContext = usePreviewToolbarExtras();
  const usePortalToolbar = Boolean(toolbarExtrasContext) && !hideToolbar;

  const handleOpenInSystem = useCallback(async () => {
    if (!filePath) {
      messageApi.error(t('preview.errors.openWithoutPath'));
      return;
    }

    try {
      await ipcBridge.shell.openFile.invoke(filePath);
      messageApi.success(t('preview.openInSystemSuccess'));
    } catch (err) {
      messageApi.error(t('preview.openInSystemFailed'));
    }
  }, [filePath, messageApi, t]);

  useEffect(() => {
    try {
      setLoading(true);
      setError(null);

      if (!filePath && !content) {
        setError(t('preview.pdf.pathMissing'));
        setLoading(false);
        return;
      }

      // webview 加载成功后隐藏 loading
      // Hide loading after webview finishes loading
      const webview = webviewRef.current;
      if (webview) {
        const handleLoad = () => {
          setLoading(false);
        };
        const handleError = () => {
          setError(t('preview.pdf.loadFailed'));
          setLoading(false);
        };

        webview.addEventListener('did-finish-load', handleLoad);
        webview.addEventListener('did-fail-load', handleError);

        return () => {
          webview.removeEventListener('did-finish-load', handleLoad);
          webview.removeEventListener('did-fail-load', handleError);
        };
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(`${t('preview.pdf.loadFailed')}: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  }, [filePath, content, t]);

  // 设置工具栏扩展（必须在所有条件返回之前调用）
  // Set toolbar extras (must be called before any conditional returns)
  useEffect(() => {
    if (!usePortalToolbar || !toolbarExtrasContext || loading || error) return;
    toolbarExtrasContext.setExtras({
      left: (
        <div className='flex items-center gap-8px'>
          <span className='text-13px text-t-secondary'>📄 {t('preview.pdf.title')}</span>
          <span className='text-11px text-t-tertiary'>{t('preview.readOnlyLabel')}</span>
        </div>
      ),
      right: null,
    });
    return () => toolbarExtrasContext.setExtras(null);
  }, [usePortalToolbar, toolbarExtrasContext, t, loading, error]);

  // 使用 Electron webview 加载本地 PDF 文件
  // Use Electron webview to load local PDF files
  const pdfSrc = filePath ? `file://${filePath}` : content || '';

  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        {messageContextHolder}
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>{t('preview.pdf.unableDisplay')}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        {messageContextHolder}
        <div className='text-14px text-t-secondary'>{t('preview.loading')}</div>
      </div>
    );
  }

  return (
    <div className='h-full w-full bg-bg-1 flex flex-col'>
      {messageContextHolder}
      {!usePortalToolbar && !hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-13px text-t-secondary'>📄 {t('preview.pdf.title')}</span>
            <span className='text-11px text-t-tertiary'>{t('preview.readOnlyLabel')}</span>
          </div>
          {filePath && (
            <Button size='mini' type='text' onClick={handleOpenInSystem} title={t('preview.openInSystemApp')}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
                <polyline points='15 3 21 3 21 9' />
                <line x1='10' y1='14' x2='21' y2='3' />
              </svg>
              <span>{t('preview.openInSystemApp')}</span>
            </Button>
          )}
        </div>
      )}
      {/* PDF 内容区域 / PDF content area */}
      <div className='flex-1 overflow-hidden bg-bg-1'>
        {/* key 确保文件路径改变时 webview 重新挂载 / key ensures webview remounts when file path changes */}
        <webview key={pdfSrc} ref={webviewRef} src={pdfSrc} className='w-full h-full' style={{ display: 'inline-flex' }} />
      </div>
    </div>
  );
};

export default PDFPreview;
