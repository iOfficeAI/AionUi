/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';

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

  useEffect(() => {
    const loadPDF = () => {
      try {
        if (filePath) {
          // 使用文件路径加载 PDF / Load PDF using file path
          setPdfUrl(`file://${filePath}`);
        } else if (content) {
          // 如果内容是 base64 或 data URL / If content is base64 or data URL
          if (content.startsWith('data:')) {
            setPdfUrl(content);
          } else if (content.startsWith('blob:')) {
            setPdfUrl(content);
          } else {
            // 假设是 base64 字符串 / Assume it's a base64 string
            setPdfUrl(`data:application/pdf;base64,${content}`);
          }
        } else {
          setError('No PDF source provided');
        }
      } catch (err) {
        console.error('[PDFPreview] Failed to load PDF:', err);
        setError('Failed to load PDF');
      }
    };

    loadPDF();
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

  if (!pdfUrl) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>加载中...</div>
      </div>
    );
  }

  return (
    <div className='h-full w-full bg-bg-1'>
      <object data={pdfUrl} type='application/pdf' className='w-full h-full' style={{ minHeight: '500px' }}>
        <div className='flex items-center justify-center h-full p-24px'>
          <div className='text-center'>
            <div className='text-16px text-t-primary mb-12px'>您的浏览器不支持内嵌 PDF 预览</div>
            <a href={pdfUrl} download className='inline-block px-16px py-8px bg-primary text-white rd-4px hover:opacity-80 transition-opacity'>
              下载 PDF 文件
            </a>
          </div>
        </div>
      </object>
    </div>
  );
};

export default PDFPreview;
