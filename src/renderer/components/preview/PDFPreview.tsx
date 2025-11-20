/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';

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
}

// Electron webview 元素的类型定义 / Type definition for Electron webview element
interface ElectronWebView extends HTMLElement {
  src: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ filePath, content }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef<ElectronWebView>(null);

  useEffect(() => {
    try {
      setLoading(true);
      setError(null);

      if (!filePath && !content) {
        setError('PDF 文件路径为空');
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
          setError('加载 PDF 失败');
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
      setError(`加载 PDF 失败: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  }, [filePath, content]);

  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>无法加载 PDF 文件</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>加载中...</div>
      </div>
    );
  }

  // 使用 Electron webview 加载本地 PDF 文件
  // Use Electron webview to load local PDF files
  const pdfSrc = filePath ? `file://${filePath}` : content || '';

  return (
    <div className='h-full w-full bg-bg-1 flex flex-col'>
      {/* PDF 内容区域 / PDF content area */}
      <div className='flex-1 overflow-hidden bg-bg-1'>
        {/* key 确保文件路径改变时 webview 重新挂载 / key ensures webview remounts when file path changes */}
        <webview key={pdfSrc} ref={webviewRef} src={pdfSrc} className='w-full h-full' style={{ display: 'inline-flex' }} />
      </div>
    </div>
  );
};

export default PDFPreview;
