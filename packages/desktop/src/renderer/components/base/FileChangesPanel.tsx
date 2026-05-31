/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';
import { PreviewOpen } from '@icon-park/react';
import { diffColors, iconColors } from '@/renderer/styles/colors';
import { useTranslation } from 'react-i18next';
import ToolShell from '@/renderer/pages/conversation/Messages/components/ToolShell';

/**
 * 文件变更项数据 / File change item data
 */
export interface FileChangeItem {
  /** 文件名 / File name */
  file_name: string;
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
const FileChangesPanel: React.FC<FileChangesPanelProps> = ({
  title,
  files,
  defaultExpanded = true,
  onFileClick,
  onDiffClick,
  className,
}) => {
  const { t } = useTranslation();

  if (files.length === 0) {
    return null;
  }

  const totalInsertions = files.reduce((sum, f) => sum + f.insertions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  const metaLabel =
    totalInsertions > 0 || totalDeletions > 0 ? (
      <span className='flex items-center gap-4px'>
        {totalInsertions > 0 && (
          <span className='font-medium' style={{ color: diffColors.addition }}>
            +{totalInsertions}
          </span>
        )}
        {totalDeletions > 0 && (
          <span className='font-medium' style={{ color: diffColors.deletion }}>
            -{totalDeletions}
          </span>
        )}
      </span>
    ) : undefined;

  return (
    <ToolShell
      state='success'
      stateLabel={t('messages.toolShell.stateDone', { defaultValue: 'Done' })}
      title={<span className='text-14px font-medium'>{title}</span>}
      meta={metaLabel}
      defaultExpanded={defaultExpanded}
      className={className}
    >
      <div className='w-full -mx-12px -mb-8px'>
        {files.map((file, index) => (
          <div
            key={`${file.fullPath}-${index}`}
            className={classNames(
              'group flex items-center justify-between px-12px py-8px hover:bg-2 transition-colors'
            )}
          >
            {/* File name */}
            <div className='flex items-center min-w-0'>
              <span className='text-14px text-t-primary truncate'>{file.file_name}</span>
            </div>
            {/* Change stats + Preview button */}
            <div className='flex items-center gap-8px shrink-0'>
              {(file.insertions > 0 || file.deletions > 0) && (
                <span
                  className={classNames(
                    'flex items-center gap-4px rounded-control px-4px py-2px',
                    onDiffClick && 'cursor-pointer hover:bg-3 transition-colors'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiffClick?.(file);
                  }}
                >
                  {file.insertions > 0 && (
                    <span className='text-14px font-medium' style={{ color: diffColors.addition }}>
                      +{file.insertions}
                    </span>
                  )}
                  {file.deletions > 0 && (
                    <span className='text-14px font-medium' style={{ color: diffColors.deletion }}>
                      -{file.deletions}
                    </span>
                  )}
                </span>
              )}
              <span
                className='group-hover:opacity-100 transition-opacity shrink-0 ml-4px flex items-center gap-4px text-12px text-t-secondary cursor-pointer rounded-control px-4px py-2px hover:bg-3'
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
    </ToolShell>
  );
};

export default FileChangesPanel;
