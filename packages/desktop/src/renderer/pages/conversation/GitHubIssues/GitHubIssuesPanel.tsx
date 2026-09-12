/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Empty, Input, Message, Radio, Spin, Tooltip } from '@arco-design/web-react';
import { Github, Plus, Refresh, Search, SettingTwo } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import { GitHubRepoConfigModal } from './GitHubRepoConfigModal';
import { IssueCard } from './IssueCard';
import { NewIssueModal } from './NewIssueModal';
import { buildIssueFixPrompt } from './githubIssuePrompt';
import type { GitHubCreateIssueInput, GitHubIssue, GitHubRepoInfo } from './types';

export type GitHubIssuesPanelProps = {
  projectId: string;
  cwd?: string;
  visible?: boolean;
};

export const GitHubIssuesPanel: React.FC<GitHubIssuesPanelProps> = ({ projectId, cwd, visible = true }) => {
  const { t } = useTranslation();
  const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewIssueModalOpen, setIsNewIssueModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Load repo identity
  const loadRepoInfo = useCallback(async () => {
    try {
      if (ipcBridge.github?.getRepo) {
        const info = await ipcBridge.github.getRepo.invoke({ cwd, project_id: projectId });
        setRepoInfo(info);
        return info;
      }
    } catch (err) {
      console.error('[GitHubIssuesPanel] Failed to load repo info:', err);
    }
    return null;
  }, [cwd, projectId]);

  // Load issues
  const loadIssues = useCallback(
    async (targetInfo?: GitHubRepoInfo | null, overrideState?: 'open' | 'closed' | 'all') => {
      const current = targetInfo !== undefined ? targetInfo : repoInfo;
      if (!current?.owner || !current?.repo) {
        setIssues([]);
        return;
      }

      setLoading(true);
      try {
        if (ipcBridge.github?.listIssues) {
          const list = await ipcBridge.github.listIssues.invoke({
            owner: current.owner,
            repo: current.repo,
            state: overrideState || stateFilter,
            search: searchQuery,
            cwd,
            project_id: projectId,
          });
          setIssues(list);
        }
      } catch (err) {
        console.error('[GitHubIssuesPanel] Failed to list issues:', err);
        Message.error(t('conversation.github.fetchFailed', { defaultValue: 'Failed to load issues' }));
      } finally {
        setLoading(false);
      }
    },
    [repoInfo, stateFilter, searchQuery, cwd, projectId, t]
  );

  // Initial load
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const info = await loadRepoInfo();
      if (!cancelled && info) {
        await loadIssues(info);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRepoInfo]);

  // Re-fetch when filter changes
  const handleStateFilterChange = (val: 'open' | 'closed' | 'all') => {
    setStateFilter(val);
    void loadIssues(repoInfo, val);
  };

  const handleRefresh = async () => {
    const info = await loadRepoInfo();
    await loadIssues(info);
  };

  const repoLabel = repoInfo?.owner && repoInfo?.repo ? `${repoInfo.owner}/${repoInfo.repo}` : '';

  // Trigger agent fix
  const handleFixIssue = (issue: GitHubIssue) => {
    const prompt = buildIssueFixPrompt(issue, repoLabel);
    emitter.emit('sendbox.fill', prompt);
    Message.success(
      t('conversation.github.fixPromptDispatched', {
        number: issue.number,
        defaultValue: `Issue #${issue.number} task sent to chat input`,
      })
    );
  };

  // Insert in chat
  const handleInsertInChat = (issue: GitHubIssue) => {
    const prompt = buildIssueFixPrompt(issue, repoLabel);
    emitter.emit('sendbox.fill', prompt);
    Message.info(
      t('conversation.github.promptInserted', {
        defaultValue: 'Issue details inserted into chat',
      })
    );
  };

  // Create issue
  const handleCreateIssue = async (input: GitHubCreateIssueInput) => {
    if (!ipcBridge.github?.createIssue) return;
    try {
      const newIssue = await ipcBridge.github.createIssue.invoke({
        ...input,
        owner: repoInfo?.owner,
        repo: repoInfo?.repo,
        cwd,
        project_id: projectId,
      });
      Message.success(
        t('conversation.github.issueCreated', {
          number: newIssue.number,
          defaultValue: `Created Issue #${newIssue.number}`,
        })
      );
      await loadIssues();
    } catch (err) {
      console.error('[GitHubIssuesPanel] Failed to create issue:', err);
      Message.error(t('conversation.github.createFailed', { defaultValue: 'Failed to create issue' }));
      throw err;
    }
  };

  // Save repo override or token
  const handleSaveConfig = async (owner: string, repo: string, token?: string) => {
    if (!ipcBridge.github) return;
    try {
      await ipcBridge.github.setRepo.invoke({
        project_id: projectId,
        owner,
        repo,
      });
      if (token !== undefined) {
        await ipcBridge.github.setToken.invoke({ token });
      }
      Message.success(t('common.saveSuccess', { defaultValue: 'Saved successfully' }));
      const info = await loadRepoInfo();
      await loadIssues(info);
    } catch (err) {
      console.error('[GitHubIssuesPanel] Failed to save config:', err);
      Message.error(t('common.saveFailed', { defaultValue: 'Failed to save' }));
    }
  };

  return (
    <div
      className='flex flex-col h-full w-full min-h-0 bg-1 overflow-hidden select-none'
      data-testid='sidebar-github-issues-panel'
      style={visible ? undefined : { display: 'none' }}
    >
      {/* Top Toolbar */}
      <div className='flex items-center justify-between px-12px py-6px border-b border-[var(--bg-3)] flex-shrink-0 bg-2 gap-8px'>
        <div
          className='flex items-center gap-6px min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity'
          onClick={() => setIsConfigModalOpen(true)}
          title={t('conversation.github.clickToConfigure', { defaultValue: 'Click to configure repository' })}
          data-testid='github-repo-label-container'
        >
          <Github theme='outline' size='14' className='text-t-secondary flex-shrink-0' />
          <span className='text-12px font-medium text-t-primary truncate font-mono'>
            {repoLabel || t('conversation.github.selectRepo', { defaultValue: 'Select Repository...' })}
          </span>
        </div>

        <div className='flex items-center gap-2px flex-shrink-0'>
          <Tooltip content={t('conversation.github.newIssue', { defaultValue: 'New Issue' })} mini position='br'>
            <Button
              type='text'
              size='mini'
              className='flex items-center justify-center text-t-secondary hover:text-t-primary'
              icon={<Plus theme='outline' size='14' />}
              aria-label={t('conversation.github.newIssue', { defaultValue: 'New Issue' })}
              onClick={() => setIsNewIssueModalOpen(true)}
              data-testid='github-new-issue-button'
            />
          </Tooltip>

          <Tooltip content={t('conversation.github.settings', { defaultValue: 'Settings' })} mini position='br'>
            <Button
              type='text'
              size='mini'
              className='flex items-center justify-center text-t-secondary hover:text-t-primary'
              icon={<SettingTwo theme='outline' size='14' />}
              aria-label={t('conversation.github.settings', { defaultValue: 'Settings' })}
              onClick={() => setIsConfigModalOpen(true)}
              data-testid='github-settings-button'
            />
          </Tooltip>

          <Tooltip content={t('common.refresh', { defaultValue: 'Refresh' })} mini position='br'>
            <Button
              type='text'
              size='mini'
              className='flex items-center justify-center text-t-secondary hover:text-t-primary'
              icon={<Refresh theme='outline' size='14' />}
              aria-label={t('common.refresh', { defaultValue: 'Refresh' })}
              onClick={() => void handleRefresh()}
              data-testid='github-refresh-button'
            />
          </Tooltip>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className='flex flex-col gap-8px p-10px border-b border-[var(--bg-3)] bg-2 flex-shrink-0'>
        <div className='flex items-center justify-between gap-6px'>
          <Radio.Group
            type='button'
            size='mini'
            value={stateFilter}
            onChange={handleStateFilterChange}
            data-testid='github-state-filter'
          >
            <Radio value='open'>{t('conversation.github.filterOpen', { defaultValue: 'Open' })}</Radio>
            <Radio value='closed'>{t('conversation.github.filterClosed', { defaultValue: 'Closed' })}</Radio>
            <Radio value='all'>{t('conversation.github.filterAll', { defaultValue: 'All' })}</Radio>
          </Radio.Group>
        </div>

        <Input
          size='mini'
          prefix={<Search theme='outline' size='12' className='text-t-secondary' />}
          placeholder={t('conversation.github.searchPlaceholder', { defaultValue: 'Search issues...' })}
          value={searchQuery}
          onChange={setSearchQuery}
          onPressEnter={() => void loadIssues()}
          allowClear
          data-testid='github-issue-search-input'
        />
      </div>

      {/* Issues List Body */}
      <div className='flex-1 w-full min-h-0 overflow-y-auto p-10px flex flex-col gap-8px'>
        {loading ? (
          <div className='flex items-center justify-center h-160px'>
            <Spin dot />
          </div>
        ) : !repoLabel ? (
          <div className='flex flex-col items-center justify-center py-40px px-16px text-center gap-12px'>
            <Empty
              description={t('conversation.github.noRepoConfigured', { defaultValue: 'No GitHub repository detected' })}
            />
            <Button size='small' type='primary' onClick={() => setIsConfigModalOpen(true)}>
              {t('conversation.github.configureRepo', { defaultValue: 'Configure Repository' })}
            </Button>
          </div>
        ) : issues.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-40px px-16px text-center gap-12px'>
            <Empty description={t('conversation.github.noIssuesFound', { defaultValue: 'No issues found' })} />
            <Button size='small' type='outline' onClick={() => setIsNewIssueModalOpen(true)}>
              {t('conversation.github.newIssue', { defaultValue: 'New Issue' })}
            </Button>
          </div>
        ) : (
          issues.map((issue) => (
            <IssueCard key={issue.number} issue={issue} onFix={handleFixIssue} onInsert={handleInsertInChat} />
          ))
        )}
      </div>

      {/* Modals */}
      <NewIssueModal
        visible={isNewIssueModalOpen}
        repoLabel={repoLabel}
        onCancel={() => setIsNewIssueModalOpen(false)}
        onSubmit={handleCreateIssue}
      />

      <GitHubRepoConfigModal
        visible={isConfigModalOpen}
        repoInfo={repoInfo}
        onCancel={() => setIsConfigModalOpen(false)}
        onSave={handleSaveConfig}
      />
    </div>
  );
};
