/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitDiffResult, GitFileChange, GitRepoInfo } from '@/common/types/git/gitTypes';
import Diff2Html from '@/renderer/components/media/Diff2Html';
import { Button, Empty, Input, Message, Spin, Tooltip, Modal } from '@arco-design/web-react';
import { Down, FullScreen, Minus, Plus, PreviewOpen, Redo, Refresh, Right } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { WorkspaceToolbarActionBtn } from './WorkspaceToolbarActionBtn';

type GitChangeListProps = {
  t: TFunction;
  workspace: string;
  repoInfo: GitRepoInfo | null;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  conflicted: GitFileChange[];
  loading: boolean;
  error: string | null;
  statusVersion?: number;
  onRefresh: () => void;
  onInitRepo: () => Promise<any>;
  onOpenDiff: (diffContent: string, file_name: string, file_path: string) => void;
  onStageFile: (file_path: string) => void;
  onStageAll: () => void;
  onUnstageFile: (file_path: string) => void;
  onUnstageAll: () => void;
  onDiscardFile: (file_path: string) => void;
  onCommit: (message: string) => Promise<any>;
  onGetDiff: (file_path: string, isStaged?: boolean) => Promise<GitDiffResult | undefined>;
  /** When set, shows expand control beside refresh (Sider diff fly-out). */
  onExpandFlyout?: () => void;
  /** Left Sider diff pane: parent renders ConversationPane-style header. */
  hideToolbar?: boolean;
};

const STATUS_COLORS: Record<string, string> = {
  added: 'text-success-6',
  modified: 'text-warning-6',
  deleted: 'text-danger-6',
  renamed: 'text-success-6',
  untracked: 'text-success-6',
  conflicted: 'text-danger-6',
};

const STATUS_LABELS: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflicted: 'C',
};

type DiffState = {
  diff: string;
  additions: number;
  deletions: number;
  binary: boolean;
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
  change: GitFileChange;
  diffState?: DiffState;
  expanded: boolean;
  loading: boolean;
  expandable: boolean;
  onToggle: () => void;
  actions: React.ReactNode;
  children?: React.ReactNode;
}> = ({ change, diffState, expanded, loading, expandable, onToggle, actions, children }) => {
  const statusColor = STATUS_COLORS[change.status] || 'text-t-primary';
  const statusLabel = STATUS_LABELS[change.status] || change.status.charAt(0).toUpperCase();

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
          <span className='w-14px flex items-center justify-center flex-shrink-0 text-t-tertiary'>
            {expandable ? expanded ? <Down size={12} /> : <Right size={12} /> : null}
          </span>
          <span className={`text-11px font-semibold w-14px text-center flex-shrink-0 ${statusColor}`}>
            {statusLabel}
          </span>
          <span
            className={`overflow-hidden text-ellipsis whitespace-nowrap text-12px ${
              change.status === 'deleted' ? 'line-through text-t-tertiary' : 'text-t-primary'
            }`}
            title={change.relativePath}
          >
            {change.relativePath}
          </span>
        </div>
        <div className='flex items-center gap-8px flex-shrink-0 ml-8px'>
          {change.additions !== undefined && change.deletions !== undefined ? (
            <div className='flex items-center gap-6px text-12px font-medium'>
              <span className='text-success-6'>+{change.additions}</span>
              <span className='text-danger-6'>-{change.deletions}</span>
            </div>
          ) : diffState && !diffState.binary ? (
            <div className='flex items-center gap-6px text-12px font-medium'>
              <span className='text-success-6'>+{diffState.additions}</span>
              <span className='text-danger-6'>-{diffState.deletions}</span>
            </div>
          ) : loading ? (
            <span className='text-12px text-t-tertiary'>...</span>
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
  <div className='flex items-center justify-between px-8px py-4px bg-transparent border-b border-b-base select-none flex-shrink-0'>
    <span className='text-11px font-semibold text-t-secondary uppercase tracking-wide'>
      {title} <span className='text-t-tertiary ml-2px font-normal'>({count})</span>
    </span>
    {actions && (
      <div className='flex items-center gap-2px' onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    )}
  </div>
);

const GitChangeList: React.FC<GitChangeListProps> = ({
  t,
  workspace,
  repoInfo,
  staged,
  unstaged,
  conflicted,
  loading,
  error,
  statusVersion,
  onRefresh,
  onInitRepo,
  onOpenDiff,
  onStageFile,
  onStageAll,
  onUnstageFile,
  onUnstageAll,
  onDiscardFile,
  onCommit,
  onGetDiff,
  onExpandFlyout,
  hideToolbar,
}) => {
  const [expandedFilePath, setExpandedFilePath] = useState<string | null>(null);
  const [diffCache, setDiffCache] = useState<Record<string, DiffState>>({});
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [committing, setCommitting] = useState<boolean>(false);

  // Clear diff cache when status changes or workspace changes
  React.useEffect(() => {
    setDiffCache({});
  }, [workspace, statusVersion]);

  const loadDiffState = useCallback(
    async (change: GitFileChange, isStaged: boolean) => {
      if (change.binary) return { diff: '', additions: 0, deletions: 0, binary: true };

      try {
        const diffRes = await onGetDiff(change.relativePath, isStaged);
        if (!diffRes) return null;

        if (diffRes.binary) {
          return { diff: '', additions: 0, deletions: 0, binary: true };
        }

        const stats = createDiffStats(diffRes.patch);
        return {
          diff: diffRes.patch,
          additions: stats.additions,
          deletions: stats.deletions,
          binary: false,
        } satisfies DiffState;
      } catch (err) {
        console.error('[GitChangeList] Failed to compute diff:', err);
        return null;
      }
    },
    [onGetDiff]
  );

  const handleToggleDiff = useCallback(
    async (change: GitFileChange, isStaged: boolean) => {
      if (change.binary) return;

      const cacheKey = `${change.relativePath}:${isStaged}`;

      if (expandedFilePath === cacheKey) {
        setExpandedFilePath(null);
        return;
      }

      if (diffCache[cacheKey]) {
        setExpandedFilePath(cacheKey);
        return;
      }

      setLoadingFilePath(cacheKey);
      const nextDiff = await loadDiffState(change, isStaged);
      setLoadingFilePath((current) => (current === cacheKey ? null : current));
      if (!nextDiff) {
        return;
      }

      setDiffCache((current) => ({
        ...current,
        [cacheKey]: nextDiff,
      }));
      setExpandedFilePath(cacheKey);
    },
    [diffCache, expandedFilePath, loadDiffState]
  );

  const handleOpenPreview = useCallback(
    async (change: GitFileChange, isStaged: boolean) => {
      const cacheKey = `${change.relativePath}:${isStaged}`;
      const cached = diffCache[cacheKey] ?? (await loadDiffState(change, isStaged));
      if (!cached || cached.binary) {
        return;
      }
      onOpenDiff(cached.diff, change.relativePath, change.path);
    },
    [diffCache, loadDiffState, onOpenDiff]
  );

  const handleDiscard = useCallback(
    (change: GitFileChange) => {
      Modal.confirm({
        title: t('conversation.workspace.changes.discardConfirmTitle'),
        content: t('conversation.workspace.changes.discardConfirmContent', { file: change.relativePath }),
        okButtonProps: { status: 'danger' },
        onOk: () => {
          onDiscardFile(change.relativePath);
        },
      });
    },
    [t, onDiscardFile]
  );

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || staged.length === 0) return;
    setCommitting(true);
    try {
      const res = await onCommit(commitMessage);
      if (res) {
        Message.success(t('conversation.workspace.changes.commitSuccess'));
        setCommitMessage('');
      }
    } finally {
      setCommitting(false);
    }
  }, [commitMessage, staged.length, onCommit, t]);

  const handleInitRepo = useCallback(async () => {
    const res = await onInitRepo();
    if (res) {
      Message.success(t('conversation.workspace.changes.initSuccess'));
    }
  }, [onInitRepo, t]);

  if (loading && !repoInfo) {
    return (
      <div className='flex-1 size-full flex items-center justify-center'>
        <Spin />
      </div>
    );
  }

  if (repoInfo && !repoInfo.gitAvailable) {
    return (
      <div className='flex-1 size-full flex items-center justify-center px-12px'>
        <Empty
          description={
            <div>
              <span className='text-t-secondary font-bold text-14px'>
                {t('conversation.workspace.changes.gitNotInstalled')}
              </span>
              <div className='text-t-secondary mt-8px'>{t('conversation.workspace.changes.gitNotInstalledDesc')}</div>
            </div>
          }
        />
      </div>
    );
  }

  if (repoInfo && !repoInfo.isRepo) {
    return (
      <div className='flex-1 size-full flex flex-col items-center justify-center px-12px gap-16px'>
        <Empty
          description={
            <div>
              <span className='text-t-secondary font-bold text-14px'>{t('conversation.workspace.changes.noRepo')}</span>
              <div className='text-t-secondary mt-8px'>{t('conversation.workspace.changes.noRepoDesc')}</div>
              <div className='text-t-tertiary mt-4px text-12px'>{t('conversation.workspace.changes.initHint')}</div>
            </div>
          }
        />
        <Button type='primary' onClick={handleInitRepo}>
          {t('conversation.workspace.changes.initRepo')}
        </Button>
      </div>
    );
  }

  const totalCount = staged.length + unstaged.length + conflicted.length;

  return (
    <div className='flex flex-col size-full'>
      {!hideToolbar && (
        <div className='px-8px py-4px border-b border-b-base flex items-center justify-between flex-shrink-0 min-h-32px'>
          <div className='flex items-center gap-6px min-w-0 flex-1'>
            <span className='text-12px text-t-secondary'>
              {t('conversation.workspace.changes.summary', { count: totalCount })}
            </span>
            {repoInfo?.branch && (
              <span className='px-6px py-2px bg-fill-2 text-t-secondary rounded-4px text-11px'>{repoInfo.branch}</span>
            )}
          </div>
          <div className='flex items-center gap-2px flex-shrink-0'>
            {onExpandFlyout ? (
              <WorkspaceToolbarActionBtn
                tooltip={t('conversation.workspace.changes.expandFlyout')}
                icon={<FullScreen size={14} />}
                onClick={onExpandFlyout}
              />
            ) : null}
            <WorkspaceToolbarActionBtn
              tooltip={t('conversation.workspace.changes.refresh')}
              icon={<Refresh size={14} />}
              onClick={onRefresh}
            />
          </div>
        </div>
      )}

      {error && <div className='px-8px py-4px bg-danger-1 text-danger-6 text-12px'>{error}</div>}

      {totalCount === 0 ? (
        <div className='flex-1 size-full flex items-center justify-center px-12px'>
          <Empty
            description={
              <div>
                <span className='text-t-secondary font-bold text-14px'>
                  {t('conversation.workspace.changes.empty')}
                </span>
                <div className='text-t-secondary'>{t('conversation.workspace.changes.emptyDescription')}</div>
              </div>
            }
          />
        </div>
      ) : (
        <div className='flex-1 overflow-y-auto flex flex-col gap-16px py-8px'>
          {conflicted.length > 0 && (
            <div className='border-y border-base bg-bg-1'>
              <PanelHeader title={t('conversation.workspace.changes.conflicted')} count={conflicted.length} />
              {conflicted.map((change) => (
                <FileChangeItem
                  key={`conflicted-${change.path}`}
                  change={change}
                  expanded={false}
                  loading={false}
                  expandable={false}
                  onToggle={() => {}}
                  actions={
                    <>
                      <WorkspaceToolbarActionBtn
                        tooltip={t('conversation.workspace.changes.stage')}
                        icon={<Plus size={14} />}
                        onClick={() => onStageFile(change.relativePath)}
                      />
                    </>
                  }
                />
              ))}
            </div>
          )}

          <div className='border-y border-base bg-bg-1'>
            <PanelHeader
              title={t('conversation.workspace.changes.staged')}
              count={staged.length}
              actions={
                staged.length > 0 ? (
                  <WorkspaceToolbarActionBtn
                    tooltip={t('conversation.workspace.changes.unstageAll')}
                    icon={<Minus size={14} />}
                    onClick={onUnstageAll}
                  />
                ) : undefined
              }
            />
            {staged.length === 0 ? (
              <div className='flex items-center justify-center py-16px text-12px text-t-tertiary'>
                {t('conversation.workspace.changes.noStaged')}
              </div>
            ) : (
              staged.map((change) => {
                const cacheKey = `${change.relativePath}:true`;
                const diffState = diffCache[cacheKey];
                const isExpanded = expandedFilePath === cacheKey;
                const isLoadingDiff = loadingFilePath === cacheKey;
                const canExpand = !change.binary;

                return (
                  <FileChangeItem
                    key={`staged-${change.path}`}
                    change={change}
                    diffState={diffState}
                    expanded={isExpanded}
                    loading={isLoadingDiff}
                    expandable={canExpand}
                    onToggle={() => handleToggleDiff(change, true)}
                    actions={
                      <>
                        {canExpand && (
                          <WorkspaceToolbarActionBtn
                            tooltip={t('preview.preview')}
                            icon={<PreviewOpen size={14} />}
                            onClick={() => handleOpenPreview(change, true)}
                          />
                        )}
                        <WorkspaceToolbarActionBtn
                          tooltip={t('conversation.workspace.changes.unstage')}
                          icon={<Minus size={14} />}
                          onClick={() => onUnstageFile(change.relativePath)}
                        />
                      </>
                    }
                  >
                    {diffState && !diffState.binary ? (
                      <div className={diffState.diff.length > 10000 ? 'max-h-[300px] overflow-y-auto' : ''}>
                        {diffState.diff.length > 100000 ? (
                          <div className='text-12px text-t-tertiary p-8px'>
                            {t('conversation.workspace.changes.diffTooLarge')}
                          </div>
                        ) : (
                          <Diff2Html diff={diffState.diff} title={change.relativePath} file_path={change.path} />
                        )}
                      </div>
                    ) : isLoadingDiff ? (
                      <div className='flex items-center justify-center py-12px text-12px text-t-tertiary'>
                        <Spin size={14} />
                      </div>
                    ) : null}
                  </FileChangeItem>
                );
              })
            )}
          </div>

          <div className='border-y border-base bg-bg-1'>
            <PanelHeader
              title={t('conversation.workspace.changes.unstaged')}
              count={unstaged.length}
              actions={
                unstaged.length > 0 ? (
                  <WorkspaceToolbarActionBtn
                    tooltip={t('conversation.workspace.changes.stageAll')}
                    icon={<Plus size={14} />}
                    onClick={onStageAll}
                  />
                ) : undefined
              }
            />
            {unstaged.length === 0 ? (
              <div className='flex items-center justify-center py-16px text-12px text-t-tertiary'>
                {t('conversation.workspace.changes.noUnstaged')}
              </div>
            ) : (
              unstaged.map((change) => {
                const cacheKey = `${change.relativePath}:false`;
                const diffState = diffCache[cacheKey];
                const isExpanded = expandedFilePath === cacheKey;
                const isLoadingDiff = loadingFilePath === cacheKey;
                const canExpand = !change.binary;

                return (
                  <FileChangeItem
                    key={`unstaged-${change.path}`}
                    change={change}
                    diffState={diffState}
                    expanded={isExpanded}
                    loading={isLoadingDiff}
                    expandable={canExpand}
                    onToggle={() => handleToggleDiff(change, false)}
                    actions={
                      <>
                        {canExpand && (
                          <WorkspaceToolbarActionBtn
                            tooltip={t('preview.preview')}
                            icon={<PreviewOpen size={14} />}
                            onClick={() => handleOpenPreview(change, false)}
                          />
                        )}
                        <WorkspaceToolbarActionBtn
                          tooltip={t('conversation.workspace.changes.discard')}
                          icon={<Redo size={14} />}
                          onClick={() => handleDiscard(change)}
                        />
                        <WorkspaceToolbarActionBtn
                          tooltip={t('conversation.workspace.changes.stage')}
                          icon={<Plus size={14} />}
                          onClick={() => onStageFile(change.relativePath)}
                        />
                      </>
                    }
                  >
                    {diffState && !diffState.binary ? (
                      <div className={diffState.diff.length > 10000 ? 'max-h-[300px] overflow-y-auto' : ''}>
                        {diffState.diff.length > 100000 ? (
                          <div className='text-12px text-t-tertiary p-8px'>
                            {t('conversation.workspace.changes.diffTooLarge')}
                          </div>
                        ) : (
                          <Diff2Html diff={diffState.diff} title={change.relativePath} file_path={change.path} />
                        )}
                      </div>
                    ) : isLoadingDiff ? (
                      <div className='flex items-center justify-center py-12px text-12px text-t-tertiary'>
                        <Spin size={14} />
                      </div>
                    ) : null}
                  </FileChangeItem>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Commit Box */}
      <div className='p-8px border-t border-t-base bg-bg-2 flex flex-col gap-6px flex-shrink-0'>
        <textarea
          placeholder={t('conversation.workspace.changes.commitPlaceholder')}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          className='w-full text-12px p-6px bg-bg-1 text-t-primary border border-base rounded-4px resize-y focus:outline-none focus:border-brand placeholder:text-t-tertiary transition-colors'
          style={{ fontFamily: 'inherit', minHeight: '48px', maxHeight: '120px' }}
        />
        <button
          disabled={staged.length === 0 || !commitMessage.trim() || committing}
          onClick={handleCommit}
          className='w-full py-4px px-8px text-12px font-medium rounded-4px flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          style={{
            backgroundColor: (staged.length === 0 || !commitMessage.trim()) ? 'var(--bg-3)' : 'var(--brand)',
            color: (staged.length === 0 || !commitMessage.trim()) ? 'var(--text-tertiary)' : 'var(--bg-base)',
            border: 'none',
          }}
        >
          {committing ? (
            <Spin size={12} className='mr-6px' />
          ) : null}
          {t('conversation.workspace.changes.commitButton', { count: staged.length })}
        </button>
      </div>
    </div>
  );
};

export default GitChangeList;
