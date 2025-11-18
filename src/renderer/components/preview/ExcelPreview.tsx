/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '@arco-design/web-react';
import MarkdownEditor from './MarkdownEditor';
import MarkdownPreview from './MarkdownPreview';
import { documentConverter } from '@/common/document/DocumentConverter';
import { ipcBridge } from '@/common';

interface ExcelPreviewProps {
  filePath?: string;
  content?: string; // Base64 或 ArrayBuffer
  hideToolbar?: boolean;
}

/**
 * Excel 表格预览与编辑组件
 *
 * 核心流程：
 * 1. Excel → Markdown 表格 (SheetJS)
 * 2. 使用 MarkdownEditor 编辑表格
 * 3. Markdown → Excel (SheetJS)
 */
const ExcelPreview: React.FC<ExcelPreviewProps> = ({ filePath, content, hideToolbar = false }) => {
  const { t } = useTranslation();
  const [markdown, setMarkdown] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [messageApi, messageContextHolder] = Message.useMessage();

  /**
   * 加载 Excel 文档并转换为 Markdown
   */
  useEffect(() => {
    const loadDocument = async () => {
      setLoading(true);
      setError(null);

      try {
        let arrayBuffer: ArrayBuffer;

        if (filePath) {
          // 从文件路径读取
          const fileContent = await ipcBridge.fs.readFile.invoke({ path: filePath });
          arrayBuffer = new TextEncoder().encode(fileContent).buffer;
        } else if (content) {
          // 从 content 读取
          if (typeof content === 'string') {
            // Base64
            const base64 = content.startsWith('data:') ? content.split(',')[1] : content;
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            arrayBuffer = bytes.buffer;
          } else {
            arrayBuffer = content as unknown as ArrayBuffer;
          }
        } else {
          throw new Error('No Excel document source provided');
        }

        // 转换为 Markdown
        const md = await documentConverter.excelToMarkdown(arrayBuffer);
        setMarkdown(md);
      } catch (err) {
        console.error('[ExcelPreview] Failed to load Excel document:', err);
        setError('加载 Excel 文档失败');
      } finally {
        setLoading(false);
      }
    };

    void loadDocument();
  }, [filePath, content]);

  /**
   * 切换编辑模式
   */
  const handleToggleEdit = () => {
    setEditMode(!editMode);
  };

  /**
   * 保存文档
   */
  const handleSave = useCallback(async () => {
    if (!filePath) {
      messageApi.error('无法保存：未指定文件路径');
      return;
    }

    try {
      // Markdown → Excel
      const excelBuffer = await documentConverter.markdownToExcel(markdown);

      // 写入文件（将 ArrayBuffer 转换为 Uint8Array）
      await ipcBridge.fs.writeFile.invoke({
        path: filePath,
        data: new Uint8Array(excelBuffer),
      });

      setIsDirty(false);
      setEditMode(false);
      messageApi.success('Excel 文档已保存');
    } catch (err) {
      console.error('[ExcelPreview] Failed to save Excel document:', err);
      messageApi.error('保存 Excel 文档失败');
    }
  }, [filePath, markdown, messageApi]);

  /**
   * 下载为 Excel
   */
  const handleDownloadExcel = useCallback(async () => {
    try {
      const excelBuffer = await documentConverter.markdownToExcel(markdown);
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filePath?.split('/').pop() || 'spreadsheet'}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      messageApi.success('Excel 文档已下载');
    } catch (err) {
      console.error('[ExcelPreview] Failed to download Excel:', err);
      messageApi.error('下载失败');
    }
  }, [markdown, filePath, messageApi]);

  /**
   * Markdown 内容变化
   */
  const handleMarkdownChange = (newMarkdown: string) => {
    setMarkdown(newMarkdown);
    setIsDirty(true);
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>加载 Excel 文档中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>请检查文件是否为有效的 Excel 文档</div>
        </div>
      </div>
    );
  }

  return (
    <div className='h-full w-full flex flex-col bg-bg-1'>
      {messageContextHolder}

      {/* 工具栏 */}
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 border-b border-border-base flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-13px text-t-secondary'>📊 Excel 表格</span>
            {isDirty && <span className='text-12px text-warning'>● 未保存</span>}
            <span className='text-11px text-t-tertiary'>提示：表格以 Markdown 格式编辑</span>
          </div>

          <div className='flex items-center gap-8px'>
            {/* 编辑/保存按钮 */}
            {editMode ? (
              <>
                <button onClick={handleSave} className='px-12px py-4px bg-primary text-white rd-4px text-12px hover:opacity-90 transition-opacity'>
                  💾 保存
                </button>
                <button onClick={() => setEditMode(false)} className='px-12px py-4px bg-bg-3 text-t-primary rd-4px text-12px hover:bg-bg-4 transition-colors'>
                  取消
                </button>
              </>
            ) : (
              <button onClick={handleToggleEdit} className='px-12px py-4px bg-primary text-white rd-4px text-12px hover:opacity-90 transition-opacity'>
                ✏️ 编辑
              </button>
            )}

            {/* 下载按钮 */}
            <button onClick={handleDownloadExcel} className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' title='下载 Excel 文档'>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
                <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                <polyline points='7 10 12 15 17 10' />
                <line x1='12' y1='15' x2='12' y2='3' />
              </svg>
              <span className='text-12px text-t-secondary'>{t('common.download')}</span>
            </button>
          </div>
        </div>
      )}

      {/* 内容区域 */}
      <div className='flex-1 overflow-hidden'>
        {editMode ? (
          // 编辑模式：左右分割（编辑器 + 预览）
          <div className='h-full flex'>
            <div className='flex-1 overflow-hidden border-r border-border-base'>
              <MarkdownEditor value={markdown} onChange={handleMarkdownChange} />
            </div>
            <div className='flex-1 overflow-hidden'>
              <MarkdownPreview content={markdown} hideToolbar />
            </div>
          </div>
        ) : (
          // 预览模式：只显示 Markdown 表格渲染
          <MarkdownPreview content={markdown} hideToolbar />
        )}
      </div>
    </div>
  );
};

export default ExcelPreview;
