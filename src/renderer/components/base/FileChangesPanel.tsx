/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useState } from 'react';
import { Down, PreviewOpen } from '@icon-park/react';
import { iconColors } from '@/renderer/theme/colors';
import { useTranslation } from 'react-i18next';

/**
 * 文件变更项数据 / File change item data
 */
export interface FileChangeItem {
  /** 文件名 / File name */
  fileName: string;
  /** 完整路径 / Full path */
  fullPath: string;
  /** 新增行数 / Number of insertions */
  insertions: number;
  /** 删除行数 / Number of deletions */
  deletions: number;
}

/**
 * 文件变更面板属性 / File changes panel props
 */
export interface FileChangesPanelProps {
  /** 面板标题 / Panel title */
  title: string;
  /** 文件变更列表 / File changes list */
  files: FileChangeItem[];
  /** 默认是否展开 / Default expanded state */
  defaultExpanded?: boolean;
  /** 点击预览按钮的回调 / Callback when preview button is clicked */
  onFileClick?: (file: FileChangeItem) => void;
  /** 点击变更统计的回调（+8/-3 数字触发，打开 diff 对比）/ Callback when change stats are clicked (opens diff view) */
  onDiffClick?: (file: FileChangeItem) => void;
  /** 额外的类名 / Additional class name */
  className?: string;
}

/**
 * 文件变更面板组件
 * File changes panel component
 *
 * 用于显示会话中生成/修改的文件列表，支持展开收起
 * Used to display generated/modified files in conversation, supports expand/collapse
 */
const FileChangesPanel: React.FC<FileChangesPanelProps> = ({ title, files, defaultExpanded = true, onFileClick, onDiffClick, className }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (files.length === 0) {
    return null;
  }

  return (
    <div className={classNames('w-full box-border rounded-8px overflow-hidden border border-solid border-[var(--aou-2)]', className)} style={{ width: '100%' }}>
      {/* 标题栏 / Header */}
      <div className='flex items-center justify-between px-16px py-12px cursor-pointer select-none' onClick={() => setExpanded(!expanded)}>
        <div className='flex items-center gap-8px'>
          {/* 绿色圆点 / Green dot */}
          <span className='w-8px h-8px rounded-full bg-[#52c41a] shrink-0'></span>
          {/* 标题 / Title */}
          <span className='text-14px text-t-primary font-medium'>{title}</span>
        </div>
        {/* 展开/收起箭头 / Expand/collapse arrow */}
        <Down theme='outline' size='16' fill={iconColors.secondary} className={classNames('transition-transform duration-200', expanded && 'rotate-180')} />
      </div>

      {/* 文件列表 / File list */}
      {expanded && (
        <div className='w-full bg-2'>
          {files.map((file, index) => (
            <div key={`${file.fullPath}-${index}`} className={classNames('group flex items-center justify-between px-16px py-12px hover:bg-3 transition-colors')}>
              {/* 文件名 / File name */}
              <div className='flex items-center min-w-0'>
                <span className='text-14px text-t-primary truncate'>{file.fileName}</span>
              </div>
              {/* 变更统计 + 预览按钮 / Change statistics + Preview button */}
              <div className='flex items-center gap-8px shrink-0'>
                {/* 变更统计 - 点击打开 diff 对比 / Change stats - click to open diff view */}
                {(file.insertions > 0 || file.deletions > 0) && (
                  <span
                    className={classNames('flex items-center gap-4px rd-4px px-4px py-2px', onDiffClick && 'cursor-pointer hover:bg-4 transition-colors')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiffClick?.(file);
                    }}
                  >
                    {file.insertions > 0 && <span className='text-14px text-[#52c41a] font-medium'>+{file.insertions}</span>}
                    {file.deletions > 0 && <span className='text-14px text-[#ff4d4f] font-medium'>-{file.deletions}</span>}
                  </span>
                )}
                {/* 预览按钮 - 点击打开文件预览 / Preview button - click to open file preview */}
                <span
                  className='group-hover:opacity-100 transition-opacity shrink-0 ml-4px flex items-center gap-4px text-12px text-t-secondary cursor-pointer rd-4px px-4px py-2px hover:bg-4'
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileClick?.(file);
                  }}
                >
                  <PreviewOpen className='line-height-8px' theme='outline' size='14' fill={iconColors.secondary} />
                  {t('preview.preview')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileChangesPanel;
