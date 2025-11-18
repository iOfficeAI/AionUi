/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ipcBridge } from '@/common';

interface PPTPreviewProps {
  /**
   * PPT file path (absolute path on disk)
   * PPT 文件路径（磁盘上的绝对路径）
   */
  filePath?: string;
  /**
   * PPT content as base64 or blob URL
   * PPT 内容（base64 或 blob URL）
   */
  content?: string;
}

const PPTPreview: React.FC<PPTPreviewProps> = ({ filePath, content }) => {
  const [pptUrl, setPptUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocalFile, setIsLocalFile] = useState(false);

  useEffect(() => {
    const loadPPT = () => {
      try {
        if (filePath) {
          // 本地文件路径 / Local file path
          setPptUrl(filePath);
          setIsLocalFile(true);
        } else if (content) {
          // 如果内容是 URL / If content is URL
          if (content.startsWith('http://') || content.startsWith('https://')) {
            setPptUrl(content);
            setIsLocalFile(false);
          } else if (content.startsWith('data:')) {
            setPptUrl(content);
            setIsLocalFile(false);
          } else if (content.startsWith('blob:')) {
            setPptUrl(content);
            setIsLocalFile(false);
          } else {
            // 假设是 base64 字符串 / Assume it's a base64 string
            setPptUrl(`data:application/vnd.ms-powerpoint;base64,${content}`);
            setIsLocalFile(false);
          }
        } else {
          setError('No PPT source provided');
        }
      } catch (err) {
        console.error('[PPTPreview] Failed to load PPT:', err);
        setError('Failed to load PPT');
      }
    };

    loadPPT();
  }, [filePath, content]);

  const handleOpenExternal = async () => {
    if (pptUrl) {
      try {
        if (isLocalFile) {
          // 使用系统默认程序打开本地文件 / Open local file with system default app
          await ipcBridge.shell.openFile.invoke(pptUrl);
        } else {
          // 打开外部链接 / Open external URL
          await ipcBridge.shell.openExternal.invoke(pptUrl);
        }
      } catch (err) {
        console.error('[PPTPreview] Failed to open file:', err);
        setError('Failed to open file');
      }
    }
  };

  const handleShowInFolder = async () => {
    if (pptUrl && isLocalFile) {
      try {
        await ipcBridge.shell.showItemInFolder.invoke(pptUrl);
      } catch (err) {
        console.error('[PPTPreview] Failed to show in folder:', err);
      }
    }
  };

  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>无法加载 PPT 文件</div>
        </div>
      </div>
    );
  }

  if (!pptUrl) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>加载中...</div>
      </div>
    );
  }

  // PPT 预览界面 / PPT preview interface
  return (
    <div className='h-full w-full bg-bg-1 flex flex-col'>
      {/* 预览提示区域 / Preview hint area */}
      <div className='flex-1 flex items-center justify-center p-24px'>
        <div className='text-center max-w-500px'>
          <div className='text-48px mb-16px'>📊</div>
          <div className='text-18px text-t-primary mb-12px font-medium'>PowerPoint 演示文稿</div>
          <div className='text-14px text-t-secondary mb-24px'>{isLocalFile ? <>浏览器无法直接预览本地 PPT 文件</> : <>请使用外部程序打开查看</>}</div>

          {/* 文件信息 / File info */}
          <div className='bg-bg-2 rd-8px p-16px mb-24px text-left'>
            <div className='text-12px text-t-secondary mb-4px'>文件路径</div>
            <div className='text-14px text-t-primary break-all font-mono'>{pptUrl}</div>
          </div>

          {/* 操作按钮 / Action buttons */}
          <div className='flex gap-12px justify-center'>
            <button onClick={handleOpenExternal} className='inline-flex items-center gap-8px px-20px py-10px bg-primary text-white rd-6px hover:opacity-90 transition-opacity font-medium'>
              <span>🚀</span>
              <span>{isLocalFile ? '使用系统程序打开' : '打开文件'}</span>
            </button>

            {isLocalFile && (
              <button onClick={handleShowInFolder} className='inline-flex items-center gap-8px px-20px py-10px bg-bg-3 text-t-primary rd-6px hover:bg-bg-4 transition-colors font-medium'>
                <span>📁</span>
                <span>在文件夹中显示</span>
              </button>
            )}
          </div>

          {/* 提示信息 / Hint message */}
          <div className='mt-24px text-12px text-t-tertiary'>支持的格式：.ppt, .pptx, .odp</div>
        </div>
      </div>
    </div>
  );
};

export default PPTPreview;
