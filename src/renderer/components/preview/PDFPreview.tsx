/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ipcBridge } from '@/common';

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

const PDFPreview: React.FC<PDFPreviewProps> = ({ filePath, content }) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);

        if (filePath) {
          // 读取 PDF 文件为 ArrayBuffer
          // Read PDF file as ArrayBuffer
          console.log('[PDFPreview] Loading PDF from file path:', filePath);
          const buffer = await ipcBridge.fs.readFileBuffer.invoke({ path: filePath });

          // 创建 Blob 和 Object URL
          // Create Blob and Object URL
          const blob = new Blob([buffer], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);

          console.log('[PDFPreview] Created blob URL:', url);

          // 清理旧的 URL
          // Cleanup old URL
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }

          blobUrlRef.current = url;
          setPdfUrl(url);
        } else if (content) {
          // 如果提供了 content（base64 或 blob URL）
          // If content is provided (base64 or blob URL)
          setPdfUrl(content);
        } else {
          setError('PDF 文件路径为空');
        }
      } catch (err) {
        console.error('[PDFPreview] Failed to load PDF:', err);
        setError(`加载 PDF 失败: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    void loadPDF();

    // 清理函数：组件卸载时释放 blob URL
    // Cleanup function: revoke blob URL when component unmounts
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
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

  if (loading || !pdfUrl) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>加载中...</div>
      </div>
    );
  }

  // 使用浏览器原生 PDF 查看器
  // Use browser's native PDF viewer
  return (
    <div className='h-full w-full bg-bg-1 flex flex-col'>
      {/* 工具栏 / Toolbar */}
      <div className='flex items-center justify-between h-48px px-16px bg-bg-2 border-b border-border-1 flex-shrink-0'>
        <div className='flex items-center gap-8px'>
          <span className='text-24px'>📄</span>
          <div>
            <div className='text-14px text-t-primary font-medium'>PDF 文档</div>
            <div className='text-11px text-t-tertiary'>使用浏览器原生查看器</div>
          </div>
        </div>

        {/* 右侧：文件信息 / Right: File info */}
        <div className='text-12px text-t-tertiary'>{filePath ? filePath.split('/').pop() : 'PDF 文件'}</div>
      </div>

      {/* PDF 内容区域 / PDF content area */}
      <div className='flex-1 overflow-hidden'>
        <embed src={pdfUrl} type='application/pdf' width='100%' height='100%' className='w-full h-full' style={{ border: 'none' }} />
      </div>
    </div>
  );
};

export default PDFPreview;
