/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FileChangeInfo, SnapshotInfo } from '@/common/types/fileSnapshot';
import { isTextFile } from '@/renderer/services/FileService';
import { Button, Empty, Spin, Tooltip } from '@arco-design/web-react';
import { Minus, Plus, Redo, Refresh } from '@icon-park/react';
import { createTwoFilesPatch } from 'diff';
import type { TFunction } from 'i18next';
import React, { useCallback } from 'react';

type FileChangeListProps = {
  t: TFunction;
  workspace: string;
  staged: FileChangeInfo[];
  unstaged: FileChangeInfo[];
  loading: boolean;
  snapshotInfo: SnapshotInfo | null;
  onRefresh: () => void;
  onOpenDiff: (diffContent: string, fileName: string, filePath: string) => void;
  onStageFile: (filePath: string) => void;
  onStageAll: () => void;
  onUnstageFile: (filePath: string) => void;
  onUnstageAll: () => void;
  onDiscardFile: (filePath: string, operation: FileChangeInfo['operation']) => void;
  onResetFile: (filePath: string, operation: FileChangeInfo['operation']) => void;
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
  actions: React.ReactNode;
}> = ({ change, onClick, actions }) => {
  const statusColor = STATUS_COLORS[change.operation];
  const statusLabel = STATUS_LABELS[change.operation];

  return (
    <div
      className='group flex items-center justify-between px-8px py-3px cursor-pointer hover:bg-fill-2 transition-colors'
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
      <div className='flex items-center gap-6px min-w-0 flex-1'>
        <span className={`text-11px font-semibold w-14px text-center flex-shrink-0 ${statusColor}`}>{statusLabel}</span>
        <span
          className={`overflow-hidden text-ellipsis whitespace-nowrap text-12px ${
            change.operation === 'delete' ? 'line-through text-t-tertiary' : 'text-t-primary'
          }`}
        >
          {change.relativePath}
        </span>
      </div>
      <div className='hidden group-hover:flex items-center gap-2px flex-shrink-0' onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    </div>
  );
};

const PanelHeader: React.FC<{
  title: string;
  count: number;
  actions?: React.ReactNode;
}> = ({ title, count, actions }) => (
  <div className='flex items-center justify-between px-8px py-4px bg-fill-2 border-b border-b-base select-none flex-shrink-0'>
    <span className='text-12px font-medium text-t-secondary'>
      {title} ({count})
    </span>
    {actions && (
      <div className='flex items-center gap-2px' onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    )}
  </div>
);

const ActionBtn: React.FC<{
  tooltip: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ tooltip, icon, onClick }) => (
  <Tooltip mini content={tooltip}>
    <Button size='mini' type='text' className='!p-2px !h-20px !w-20px' icon={icon} onClick={onClick} />
  </Tooltip>
);

const FileChangeList: React.FC<FileChangeListProps> = ({
  t,
  workspace,
  staged,
  unstaged,
  loading,
  snapshotInfo,
  onRefresh,
  onOpenDiff,
  onStageFile,
  onStageAll,
  onUnstageFile,
  onUnstageAll,
  onDiscardFile,
  onResetFile,
}) => {
  const isGitRepo = snapshotInfo?.mode === 'git-repo';

  const handleClick = useCallback(
    async (change: FileChangeInfo) => {
      const fileName = change.relativePath;
      if (!isTextFile(fileName)) return;

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

  const totalCount = staged.length + unstaged.length;

  if (totalCount === 0) {
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

  // Snapshot mode: single flat list
  if (!isGitRepo) {
    return (
      <div className='flex flex-col size-full'>
        <PanelHeader
          title={t('conversation.workspace.changes.changedFiles')}
          count={unstaged.length}
          actions={
            <ActionBtn
              tooltip={t('conversation.workspace.changes.refresh')}
              icon={<Refresh size={14} />}
              onClick={onRefresh}
            />
          }
        />
        <div className='flex-1 overflow-y-auto'>
          {unstaged.map((change) => (
            <FileChangeItem
              key={change.filePath}
              change={change}
              onClick={() => handleClick(change)}
              actions={
                <ActionBtn
                  tooltip={t('conversation.workspace.changes.reset')}
                  icon={<Redo size={14} />}
                  onClick={() => onResetFile(change.relativePath, change.operation)}
                />
              }
            />
          ))}
        </div>
      </div>
    );
  }

  // Git-repo mode: Sourcetree-style two-panel layout
  return (
    <div className='flex flex-col size-full'>
      {/* Top toolbar */}
      <div className='px-8px py-4px border-b border-b-base flex items-center justify-between flex-shrink-0'>
        <span className='text-12px text-t-secondary'>
          {t('conversation.workspace.changes.summary', { count: totalCount })}
        </span>
        <ActionBtn
          tooltip={t('conversation.workspace.changes.refresh')}
          icon={<Refresh size={14} />}
          onClick={onRefresh}
        />
      </div>

      {/* Unstaged panel (top half) */}
      <div className='flex flex-col flex-1 min-h-0'>
        <PanelHeader
          title={t('conversation.workspace.changes.unstaged')}
          count={unstaged.length}
          actions={
            unstaged.length > 0 ? (
              <ActionBtn
                tooltip={t('conversation.workspace.changes.stageAll')}
                icon={<Plus size={14} />}
                onClick={onStageAll}
              />
            ) : undefined
          }
        />
        <div className='flex-1 overflow-y-auto'>
          {unstaged.length === 0 ? (
            <div className='flex items-center justify-center py-16px text-12px text-t-quaternary'>
              {t('conversation.workspace.changes.noUnstaged')}
            </div>
          ) : (
            unstaged.map((change) => (
              <FileChangeItem
                key={`u-${change.filePath}`}
                change={change}
                onClick={() => handleClick(change)}
                actions={
                  <>
                    <ActionBtn
                      tooltip={t('conversation.workspace.changes.discard')}
                      icon={<Redo size={14} />}
                      onClick={() => onDiscardFile(change.relativePath, change.operation)}
                    />
                    <ActionBtn
                      tooltip={t('conversation.workspace.changes.stage')}
                      icon={<Plus size={14} />}
                      onClick={() => onStageFile(change.relativePath)}
                    />
                  </>
                }
              />
            ))
          )}
        </div>
      </div>

      {/* Staged panel (bottom half) */}
      <div className='flex flex-col flex-1 min-h-0 border-t border-t-base'>
        <PanelHeader
          title={t('conversation.workspace.changes.staged')}
          count={staged.length}
          actions={
            staged.length > 0 ? (
              <ActionBtn
                tooltip={t('conversation.workspace.changes.unstageAll')}
                icon={<Minus size={14} />}
                onClick={onUnstageAll}
              />
            ) : undefined
          }
        />
        <div className='flex-1 overflow-y-auto'>
          {staged.length === 0 ? (
            <div className='flex items-center justify-center py-16px text-12px text-t-quaternary'>
              {t('conversation.workspace.changes.noStaged')}
            </div>
          ) : (
            staged.map((change) => (
              <FileChangeItem
                key={`s-${change.filePath}`}
                change={change}
                onClick={() => handleClick(change)}
                actions={
                  <ActionBtn
                    tooltip={t('conversation.workspace.changes.unstage')}
                    icon={<Minus size={14} />}
                    onClick={() => onUnstageFile(change.relativePath)}
                  />
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default FileChangeList;
