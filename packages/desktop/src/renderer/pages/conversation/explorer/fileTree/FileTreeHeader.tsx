/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import { Branch, FoldUpOne, FolderPlus, Refresh } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useScm } from '../../SourceControl/scmStore';
import WorkspaceOpenButton from '@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton';
import { useFileTreeMetadata, toggleMetadataMode } from './fileTreeMetadataStore';
import { useFileTreeActivity, setFollowAgent } from './fileTreeActivityStore';

export type FileTreeHeaderProps = {
  activeTab: 'files' | 'changes';
  onTabChange: (tab: 'files' | 'changes') => void;
  workspacePath?: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onAddFolder: () => void;
  onCollapseAll: () => void;
};

export const FileTreeHeader: React.FC<FileTreeHeaderProps> = ({
  activeTab,
  onTabChange,
  workspacePath,
  refreshing,
  onRefresh,
  onAddFolder,
  onCollapseAll,
}) => {
  const { t } = useTranslation();
  const scm = useScm();
  const { mode: metaMode } = useFileTreeMetadata();
  const { followAgent } = useFileTreeActivity();

  // Primary repo for active project
  const repo = scm?.repositories?.[0];
  const repoStatus = repo?.repo_id && scm?.statuses ? scm.statuses[repo.repo_id] : undefined;
  const branchName = repo?.head?.name || (repo?.head?.detached ? 'detached HEAD' : null);

  // Aggregate resource counts for the repo
  let modifiedCount = 0;
  let addedCount = 0;
  let deletedCount = 0;
  if (repoStatus?.resources) {
    for (const res of repoStatus.resources) {
      if (!res) continue;
      if (res.state === 'created') addedCount++;
      else if (res.state === 'deleted') deletedCount++;
      else modifiedCount++;
    }
  }
  const totalChanges = modifiedCount + addedCount + deletedCount;

  return (
    <div className='flex flex-col flex-shrink-0 border-b border-[var(--bg-3)] select-none'>
      {/* 1. Branch Bar (claude-code-filetree header style) */}
      {branchName && (
        <div className='flex items-center justify-between px-12px py-3px text-11px bg-[var(--bg-2)]/40 border-b border-[var(--bg-3)]/60 font-mono'>
          <div className='flex items-center gap-4px min-w-0 overflow-hidden'>
            <Branch theme='outline' size='13' className='text-primary flex-shrink-0' />
            <span className='font-semibold text-t-primary truncate' title={branchName}>
              {branchName}
            </span>
          </div>

          <div className='flex items-center gap-6px flex-shrink-0 text-10px'>
            {totalChanges === 0 ? (
              <span className='text-t-tertiary font-sans'>clean</span>
            ) : (
              <>
                {addedCount > 0 && <span className='text-success font-semibold'>+{addedCount}</span>}
                {deletedCount > 0 && <span className='text-danger font-semibold'>-{deletedCount}</span>}
                {modifiedCount > 0 && <span className='text-warning font-semibold'>M:{modifiedCount}</span>}
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. Main Tab & Actions Toolbar */}
      <div className='flex items-center gap-4px ps-12px pe-8px py-4px'>
        {/* Tab Switcher */}
        <div className='flex items-center gap-2px overflow-x-auto flex-1 min-w-0'>
          <Button
            type='text'
            size='small'
            className={`flex-shrink-0 !px-8px ${activeTab === 'files' ? '!text-t-primary !font-medium !bg-2' : '!text-t-secondary'}`}
            onClick={() => onTabChange('files')}
          >
            {t('conversation.explorer.tabs.files')}
          </Button>
          <Button
            type='text'
            size='small'
            className={`flex-shrink-0 !px-8px ${activeTab === 'changes' ? '!text-t-primary !font-medium !bg-2' : '!text-t-secondary'}`}
            onClick={() => onTabChange('changes')}
          >
            {t('conversation.explorer.tabs.changes')}
            {totalChanges > 0 && (
              <span className='ms-4px px-4px py-0px text-10px rounded-full bg-primary/15 text-primary font-mono'>
                {totalChanges}
              </span>
            )}
          </Button>
        </div>

        {/* Action Buttons */}
        <div className='flex items-center gap-2px flex-shrink-0'>
          {/* Sigma (Σ) button: toggles between File Size and Date/Age mode */}
          {activeTab === 'files' && (
            <Tooltip
              content={
                metaMode === 'size'
                  ? t('conversation.explorer.showDates', 'Show modification dates')
                  : t('conversation.explorer.showSizes', 'Show file sizes')
              }
              mini
              position='br'
            >
              <Button
                type='text'
                size='small'
                className={`flex items-center justify-center font-serif text-13px ${metaMode === 'size' ? '!text-primary font-bold' : '!text-t-secondary'}`}
                aria-label='Toggle file sizes and dates'
                onClick={toggleMetadataMode}
              >
                Σ
              </Button>
            </Tooltip>
          )}

          {/* Follow Agent Toggle */}
          {activeTab === 'files' && (
            <Tooltip
              content={
                followAgent
                  ? t('conversation.explorer.followAgentOn', 'Follow agent: ON')
                  : t('conversation.explorer.followAgentOff', 'Follow agent: OFF')
              }
              mini
              position='br'
            >
              <Button
                type='text'
                size='small'
                className={`flex items-center justify-center text-11px font-mono ${followAgent ? '!text-primary font-semibold' : '!text-t-tertiary'}`}
                aria-label='Toggle follow agent'
                onClick={() => setFollowAgent(!followAgent)}
              >
                AUTO
              </Button>
            </Tooltip>
          )}

          {/* Add folder */}
          <Tooltip content={t('conversation.explorer.addFolder')} mini position='br'>
            <Button
              type='text'
              size='small'
              className='flex items-center justify-center'
              icon={<FolderPlus theme='outline' size='16' />}
              aria-label={t('conversation.explorer.addFolder')}
              onClick={onAddFolder}
            />
          </Tooltip>

          {/* Open externally */}
          {workspacePath && <WorkspaceOpenButton workspacePath={workspacePath} isTemporary={false} />}

          {/* Refresh */}
          <Tooltip
            content={
              activeTab === 'changes'
                ? t('conversation.explorer.refreshChanges')
                : t('conversation.explorer.refreshFiles')
            }
            mini
            position='br'
          >
            <Button
              type='text'
              size='small'
              className='flex items-center justify-center'
              loading={refreshing}
              icon={<Refresh theme='outline' size='16' />}
              aria-label={
                activeTab === 'changes'
                  ? t('conversation.explorer.refreshChanges')
                  : t('conversation.explorer.refreshFiles')
              }
              onClick={() => void onRefresh()}
            />
          </Tooltip>

          {/* Collapse All */}
          {activeTab === 'files' && (
            <Tooltip content={t('conversation.explorer.collapseAll')} mini position='br'>
              <Button
                type='text'
                size='small'
                className='flex items-center justify-center'
                icon={<FoldUpOne theme='outline' size='16' />}
                aria-label={t('conversation.explorer.collapseAll')}
                onClick={onCollapseAll}
              />
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};
