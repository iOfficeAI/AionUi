/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FileChangeRecord } from '@/common/types/fileSnapshot';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { Empty } from '@arco-design/web-react';
import { createTwoFilesPatch } from 'diff';
import type { TFunction } from 'i18next';
import React, { useCallback, useMemo } from 'react';

type FileChangeListProps = {
  t: TFunction;
  changes: FileChangeRecord[];
  onOpenDiff: (record: FileChangeRecord) => void;
};

const STATUS_COLORS: Record<FileChangeRecord['operation'], string> = {
  create: 'text-success-6',
  modify: 'text-warning-6',
  delete: 'text-danger-6',
};

const STATUS_LABELS: Record<FileChangeRecord['operation'], string> = {
  create: 'A',
  modify: 'M',
  delete: 'D',
};

type ChangeStats = {
  insertions: number;
  deletions: number;
};

function computeStats(record: FileChangeRecord): ChangeStats {
  const before = record.before ?? '';
  const after = record.after ?? '';
  const patch = createTwoFilesPatch(record.relativePath, record.relativePath, before, after);
  const info = parseDiff(patch, record.relativePath);
  return { insertions: info.insertions, deletions: info.deletions };
}

const FileChangeItem: React.FC<{
  record: FileChangeRecord;
  onClick: () => void;
}> = ({ record, onClick }) => {
  const stats = useMemo(() => computeStats(record), [record]);
  const statusColor = STATUS_COLORS[record.operation];
  const statusLabel = STATUS_LABELS[record.operation];

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
            record.operation === 'delete' ? 'line-through text-t-tertiary' : 'text-t-primary'
          }`}
        >
          {record.relativePath}
        </span>
      </div>
      <div className='flex gap-6px text-11px flex-shrink-0'>
        {stats.insertions > 0 && <span className='text-success-6'>+{stats.insertions}</span>}
        {stats.deletions > 0 && <span className='text-danger-6'>-{stats.deletions}</span>}
      </div>
    </div>
  );
};

const FileChangeList: React.FC<FileChangeListProps> = ({ t, changes, onOpenDiff }) => {
  const totalStats = useMemo(() => {
    let insertions = 0;
    let deletions = 0;
    for (const record of changes) {
      const stats = computeStats(record);
      insertions += stats.insertions;
      deletions += stats.deletions;
    }
    return { insertions, deletions };
  }, [changes]);

  const handleOpenDiff = useCallback(
    (record: FileChangeRecord) => {
      onOpenDiff(record);
    },
    [onOpenDiff]
  );

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
      <div className='px-12px py-8px border-b border-b-base'>
        <span className='text-12px text-t-secondary'>
          {t('conversation.workspace.changes.summary', { count: changes.length })}
        </span>
      </div>

      {/* File list */}
      <div className='flex-1 overflow-y-auto'>
        {changes.map((record) => (
          <FileChangeItem key={record.filePath} record={record} onClick={() => handleOpenDiff(record)} />
        ))}
      </div>

      {/* Summary bar */}
      <div className='px-12px py-8px border-t border-t-base flex gap-12px text-11px text-t-tertiary'>
        {totalStats.insertions > 0 && (
          <span className='text-success-6'>
            {t('conversation.workspace.changes.insertions', { count: totalStats.insertions })}
          </span>
        )}
        {totalStats.deletions > 0 && (
          <span className='text-danger-6'>
            {t('conversation.workspace.changes.deletions', { count: totalStats.deletions })}
          </span>
        )}
      </div>
    </div>
  );
};

export default FileChangeList;
