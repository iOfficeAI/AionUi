/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FileChangeInfo, SnapshotInfo } from '@/common/types/fileSnapshot';
import Diff2Html from '@/renderer/components/media/Diff2Html';
import { isTextFile } from '@/renderer/services/FileService';
import { Button, Empty, Spin, Tooltip } from '@arco-design/web-react';
import { Down, Minus, Plus, PreviewOpen, Redo, Refresh, Right } from '@icon-park/react';
import { createTwoFilesPatch } from 'diff';
import type { TFunction } from 'i18next';
import React, { useCallback, useMemo, useState } from 'react';

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

type DiffState = {
  diff: string;
  additions: number;
  deletions: number;
};

const createDiffStats = (diffContent: string): { additions: number; deletions: number } => {
  let additions = 0;
  let deletions = 0;

  for (const line of diffContent.split('\n')) {
    if (!line) continue;
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }

  return { additions, deletions };
};

const FileChangeItem: React.FC<{
  change: FileChangeInfo;
  diffState?: DiffState;
  expanded: boolean;
  loading: boolean;
  expandable: boolean;
  onToggle: () => void;
  actions: React.ReactNode;
  children?: React.ReactNode;
}> = ({ change, diffState, expanded, loading, expandable, onToggle, actions, children }) => {
  const statusColor = STATUS_COLORS[change.operation];
  const statusLabel = STATUS_LABELS[change.operation];

  return (
    <div className='border-b border-b-base last:border-b-0'>
      <div
        className={`group flex items-center justify-between px-8px py-6px transition-colors ${
          expandable ? 'cursor-pointer hover:bg-fill-2' : ''
        }`}
        onClick={expandable ? onToggle : undefined}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        onKeyDown={
          expandable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
      >
        <div className='flex items-center gap-6px min-w-0 flex-1'>
          <span className='w-14px flex items-center justify-center flex-shrink-0 text-t-quaternary'>
            {expandable ? expanded ? <Down size={12} /> : <Right size={12} /> : null}
          </span>
          <span className={`text-11px font-semibold w-14px text-center flex-shrink-0 ${statusColor}`}>
            {statusLabel}
          </span>
          <span
            className={`overflow-hidden text-ellipsis whitespace-nowrap text-12px ${
              change.operation === 'delete' ? 'line-through text-t-tertiary' : 'text-t-primary'
            }`}
          >
            {change.relativePath}
          </span>
        </div>
        <div className='flex items-center gap-8px flex-shrink-0 ml-8px'>
          {diffState ? (
            <div className='flex items-center gap-6px text-12px font-medium'>
              <span className='text-success-6'>+{diffState.additions}</span>
              <span className='text-danger-6'>-{diffState.deletions}</span>
            </div>
          ) : loading ? (
            <span className='text-12px text-t-quaternary'>...</span>
          ) : null}
          <div
            className='hidden group-hover:flex items-center gap-2px flex-shrink-0'
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        </div>
      </div>
      {expanded ? <div className='px-8px pb-8px'>{children}</div> : null}
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
  const [expandedFilePath, setExpandedFilePath] = useState<string | null>(null);
  const [diffCache, setDiffCache] = useState<Record<string, DiffState>>({});
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);

  const loadDiffState = useCallback(
    async (change: FileChangeInfo) => {
      const fileName = change.relativePath;
      if (!isTextFile(fileName)) return null;

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
        const stats = createDiffStats(diffContent);
        return {
          diff: diffContent,
          additions: stats.additions,
          deletions: stats.deletions,
        } satisfies DiffState;
      } catch (err) {
        console.error('[FileChangeList] Failed to compute diff:', err);
        return null;
      }
    },
    [workspace]
  );

  const handleToggleDiff = useCallback(
    async (change: FileChangeInfo) => {
      const fileName = change.relativePath;
      if (!isTextFile(fileName)) return;

      if (expandedFilePath === change.filePath) {
        setExpandedFilePath(null);
        return;
      }

      if (diffCache[change.filePath]) {
        setExpandedFilePath(change.filePath);
        return;
      }

      setLoadingFilePath(change.filePath);
      const nextDiff = await loadDiffState(change);
      setLoadingFilePath((current) => (current === change.filePath ? null : current));
      if (!nextDiff) {
        return;
      }

      setDiffCache((current) => ({
        ...current,
        [change.filePath]: nextDiff,
      }));
      setExpandedFilePath(change.filePath);
    },
    [diffCache, expandedFilePath, loadDiffState]
  );

  const handleOpenPreview = useCallback(
    async (change: FileChangeInfo) => {
      const cached = diffCache[change.filePath] ?? (await loadDiffState(change));
      if (!cached) {
        return;
      }
      onOpenDiff(cached.diff, change.relativePath, change.filePath);
    },
    [diffCache, loadDiffState, onOpenDiff]
  );

  const groupedChanges = useMemo(
    () =>
      isGitRepo
        ? [
            {
              key: 'unstaged',
              title: t('conversation.workspace.changes.unstaged'),
              count: unstaged.length,
              emptyText: t('conversation.workspace.changes.noUnstaged'),
              items: unstaged,
              headerAction:
                unstaged.length > 0 ? (
                  <ActionBtn
                    tooltip={t('conversation.workspace.changes.stageAll')}
                    icon={<Plus size={14} />}
                    onClick={onStageAll}
                  />
                ) : undefined,
              renderActions: (change: FileChangeInfo) => (
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
              ),
            },
            {
              key: 'staged',
              title: t('conversation.workspace.changes.staged'),
              count: staged.length,
              emptyText: t('conversation.workspace.changes.noStaged'),
              items: staged,
              headerAction:
                staged.length > 0 ? (
                  <ActionBtn
                    tooltip={t('conversation.workspace.changes.unstageAll')}
                    icon={<Minus size={14} />}
                    onClick={onUnstageAll}
                  />
                ) : undefined,
              renderActions: (change: FileChangeInfo) => (
                <ActionBtn
                  tooltip={t('conversation.workspace.changes.unstage')}
                  icon={<Minus size={14} />}
                  onClick={() => onUnstageFile(change.relativePath)}
                />
              ),
            },
          ]
        : [
            {
              key: 'changed',
              title: t('conversation.workspace.changes.changedFiles'),
              count: unstaged.length,
              emptyText: t('conversation.workspace.changes.empty'),
              items: unstaged,
              headerAction: undefined,
              renderActions: (change: FileChangeInfo) => (
                <ActionBtn
                  tooltip={t('conversation.workspace.changes.reset')}
                  icon={<Redo size={14} />}
                  onClick={() => onResetFile(change.relativePath, change.operation)}
                />
              ),
            },
          ],
    [isGitRepo, onDiscardFile, onResetFile, onStageAll, onStageFile, onUnstageAll, onUnstageFile, staged, t, unstaged]
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
      <div className='flex-1 overflow-y-auto p-8px flex flex-col gap-10px'>
        {groupedChanges.map((group) => (
          <div key={group.key} className='border border-base rounded-10px overflow-hidden bg-bg-1'>
            <PanelHeader title={group.title} count={group.count} actions={group.headerAction} />
            {group.items.length === 0 ? (
              <div className='flex items-center justify-center py-16px text-12px text-t-quaternary'>
                {group.emptyText}
              </div>
            ) : (
              group.items.map((change) => {
                const diffState = diffCache[change.filePath];
                const isExpanded = expandedFilePath === change.filePath;
                const isLoadingDiff = loadingFilePath === change.filePath;
                const canExpand = isTextFile(change.relativePath);

                return (
                  <FileChangeItem
                    key={`${group.key}-${change.filePath}`}
                    change={change}
                    diffState={diffState}
                    expanded={isExpanded}
                    loading={isLoadingDiff}
                    expandable={canExpand}
                    onToggle={() => {
                      void handleToggleDiff(change);
                    }}
                    actions={
                      <>
                        <ActionBtn
                          tooltip={t('preview.preview')}
                          icon={<PreviewOpen size={14} />}
                          onClick={() => {
                            void handleOpenPreview(change);
                          }}
                        />
                        {group.renderActions(change)}
                      </>
                    }
                  >
                    {diffState ? (
                      <Diff2Html diff={diffState.diff} title={change.relativePath} filePath={change.filePath} />
                    ) : isLoadingDiff ? (
                      <div className='flex items-center justify-center py-12px text-12px text-t-quaternary'>
                        <Spin size={14} />
                      </div>
                    ) : null}
                  </FileChangeItem>
                );
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileChangeList;
