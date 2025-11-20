/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface PPTPreviewProps {
  /**
   * PPT file path (absolute path on disk)
   * PPT 文件路径（磁盘上的绝对路径）
   */
  filePath?: string;
  /**
   * PPT content (not used, kept for compatibility)
   * PPT 内容（暂不使用，保留用于兼容）
   */
  content?: string;
}

/**
 * PPT 演示文稿预览组件
 *
 * 由于 PPT 格式复杂，无法在纯 JavaScript 中完美渲染，
 * 此组件引导用户在系统应用（PowerPoint/Keynote/WPS）中打开文件
 */
const PPTPreview: React.FC<PPTPreviewProps> = ({ filePath }) => {
  const { t } = useTranslation();
  const handleOpenExternal = async () => {
    if (!filePath) return;
    try {
      await ipcBridge.shell.openFile.invoke(filePath);
    } catch (err) {
      // 静默处理错误 / Silently handle error
    }
  };

  const handleShowInFolder = async () => {
    if (!filePath) return;
    try {
      await ipcBridge.shell.showItemInFolder.invoke(filePath);
    } catch (err) {
      // 静默处理错误 / Silently handle error
    }
  };

  return (
    <div className='h-full w-full bg-bg-1 flex items-center justify-center'>
      <div className='text-center max-w-400px'>
        <div className='text-48px mb-16px'>📊</div>
        <div className='text-16px text-t-primary font-medium mb-8px'>{t('preview.pptTitle')}</div>
        <div className='text-13px text-t-secondary mb-24px'>{t('preview.pptOpenHint')}</div>

        {filePath && (
          <div className='flex items-center justify-center gap-12px'>
            <button onClick={handleOpenExternal} className='inline-flex items-center gap-6px px-16px py-8px bg-primary text-white rd-6px hover:bg-primary-hover transition-colors text-13px font-medium shadow-sm'>
              <span>🚀</span>
              <span>{t('preview.pptOpenFile')}</span>
            </button>
            <button onClick={handleShowInFolder} className='inline-flex items-center gap-6px px-16px py-8px bg-bg-3 text-t-primary rd-6px hover:bg-bg-4 transition-colors text-13px'>
              <span>📁</span>
              <span>{t('preview.pptShowLocation')}</span>
            </button>
          </div>
        )}

        <div className='text-11px text-t-tertiary mt-16px'>{t('preview.pptSystemAppHint')}</div>
      </div>
    </div>
  );
};

export default PPTPreview;
