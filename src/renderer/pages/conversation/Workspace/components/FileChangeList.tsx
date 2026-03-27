/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FileChangeInfo } from '@/common/types/fileSnapshot';
import { isTextFile } from '@/renderer/services/FileService';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { Button, Empty, Spin } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import { createTwoFilesPatch } from 'diff';
import type { TFunction } from 'i18next';
import React, { useCallback } from 'react';

type FileChangeListProps = {
  t: TFunction;
  workspace: string;
  changes: FileChangeInfo[];
  loading: boolean;
  onRefresh: () => void;
  onOpenDiff: (diffContent: string, fileName: string, filePath: string) => void;
};

const STATUS_COLORS: Record<FileChangeInfo['operation'], string> = {
  create: 'text-success-6',
  modify: 'text-warning-6',
  delete: 'text-danger-6',
};

const STATUS_LABELS: Record<FileChangeInfo['operation'], string> = {
  create: 'A',
  modify: 'M',
  delete: 'D',
};

const FileChangeItem: React.FC<{
  change: FileChangeInfo;
  onClick: () => void;
}> = ({ change, onClick }) => {
  const statusColor = STATUS_COLORS[change.operation];
  const statusLabel = STATUS_LABELS[change.operation];

  return (
    <div
      className='flex items-center justify-between px-12px py-6px cursor-pointer hover:bg-fill-2 transition-colors'
      onClick={onClick}
      role='button'
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className='flex items-center gap-8px min-w-0'>
        <span className={`text-11px font-semibold w-14px text-center flex-shrink-0 ${statusColor}`}>{statusLabel}</span>
        <span
          className={`overflow-hidden text-ellipsis whitespace-nowrap text-13px ${
            change.operation === 'delete' ? 'line-through text-t-tertiary' : 'text-t-primary'
          }`}
        >
          {change.relativePath}
        </span>
      </div>
    </div>
  );
};

const FileChangeList: React.FC<FileChangeListProps> = ({ t, workspace, changes, loading, onRefresh, onOpenDiff }) => {
  const handleClick = useCallback(
    async (change: FileChangeInfo) => {
      const fileName = change.relativePath;

      // Binary files: no diff available
      if (!isTextFile(fileName)) {
        return;
      }

      try {
        let before = '';
        let after = '';

        if (change.operation === 'modify' || change.operation === 'delete') {
          const baseline = await ipcBridge.fileSnapshot.getBaselineContent.invoke({
            workspace,
            filePath: change.relativePath,
          });
          before = baseline ?? '';
        }

        if (change.operation === 'modify' || change.operation === 'create') {
          const current = await ipcBridge.fs.readFile.invoke({ path: change.filePath });
          after = typeof current === 'string' ? current : '';
        }

        const diffContent = createTwoFilesPatch(fileName, fileName, before, after);
        onOpenDiff(diffContent, fileName, change.filePath);
      } catch (err) {
        console.error('[FileChangeList] Failed to compute diff:', err);
      }
    },
    [workspace, onOpenDiff]
  );

  if (loading) {
    return (
      <div className='flex-1 size-full flex items-center justify-center'>
        <Spin />
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className='flex-1 size-full flex items-center justify-center px-12px'>
        <Empty
          description={
            <div>
              <span className='text-t-secondary font-bold text-14px'>{t('conversation.workspace.changes.empty')}</span>
              <div className='text-t-secondary'>{t('conversation.workspace.changes.emptyDescription')}</div>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className='flex flex-col size-full'>
      {/* Header */}
      <div className='px-12px py-8px border-b border-b-base flex items-center justify-between'>
        <span className='text-12px text-t-secondary'>
          {t('conversation.workspace.changes.summary', { count: changes.length })}
        </span>
        <Button
          size='mini'
          type='text'
          icon={<Refresh size={14} />}
          onClick={onRefresh}
          title={t('conversation.workspace.changes.refresh')}
        />
      </div>

      {/* File list */}
      <div className='flex-1 overflow-y-auto'>
        {changes.map((change) => (
          <FileChangeItem key={change.filePath} change={change} onClick={() => handleClick(change)} />
        ))}
      </div>
    </div>
  );
};

export default FileChangeList;
