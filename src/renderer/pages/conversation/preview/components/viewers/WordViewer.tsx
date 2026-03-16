/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { usePreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownPreview from './MarkdownViewer';

interface WordPreviewProps {
  filePath?: string;
  content?: string; // Base64 或 ArrayBuffer
  hideToolbar?: boolean;
}

/**
 * Word 文档预览组件
 *
 * 核心流程：
 * 1. Word → Markdown (mammoth + turndown)
 * 2. 使用 MarkdownPreview 渲染预览
 * 3. 点击"在 Word 中打开"可以用系统默认应用编辑
 */
const WordPreview: React.FC<WordPreviewProps> = ({ filePath, hideToolbar = false }) => {
  const { t } = useTranslation();
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const toolbarExtrasContext = usePreviewToolbarExtras();
  const usePortalToolbar = Boolean(toolbarExtrasContext) && !hideToolbar;

  const messageApiRef = useRef(messageApi);
  useEffect(() => {
    messageApiRef.current = messageApi;
  }, [messageApi]);

  /**
   * 加载 Word 文档并转换为 Markdown
   */
  useEffect(() => {
    const loadDocument = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!filePath) {
          throw new Error(t('preview.errors.missingFilePath'));
        }

        // 使用后端转换服务 / Use backend conversion service
        // 通过统一的 document.convert IPC 请求转换 / Request conversion via unified document.convert IPC
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
        messageApiRef.current?.error?.(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    void loadDocument();
  }, [filePath, t]);

  /**
   * 在系统默认应用中打开 Word 文档
   * Open Word document in system default application
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

  // 设置工具栏扩展（必须在所有条件返回之前调用）
  // Set toolbar extras (must be called before any conditional returns)
  useEffect(() => {
    if (!usePortalToolbar || !toolbarExtrasContext || loading || error) return;
    toolbarExtrasContext.setExtras({
      left: (
        <div className='flex items-center gap-8px'>
          <span className='text-13px text-t-secondary'>📄 {t('preview.word.title')}</span>
        </div>
      ),
      right: null,
    });
    return () => toolbarExtrasContext.setExtras(null);
  }, [usePortalToolbar, toolbarExtrasContext, t, loading, error]);

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>{t('preview.word.loading')}</div>
      </div>
    );
  }

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

  return (
    <div className='h-full w-full flex flex-col bg-bg-1'>
      {messageContextHolder}

      {/* 工具栏 / Toolbar */}
      {!usePortalToolbar && !hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-13px text-t-secondary'>📄 {t('preview.word.title')}</span>
          </div>

          {/* 右侧按钮组 / Right button group */}
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

      {/* 内容区域 */}
      <div className='flex-1 overflow-hidden'>
        <MarkdownPreview content={markdown} hideToolbar />
      </div>
    </div>
  );
};

export default WordPreview;
