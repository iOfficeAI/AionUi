/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tag, Tooltip } from '@arco-design/web-react';
import { CheckOne, Dot, LinkOut, Notes, PlayOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '@/renderer/utils/chat/relativeTime';
import { openExternalUrl } from '@/renderer/utils/platform';
import type { GitHubIssue } from './types';

export type IssueCardProps = {
  issue: GitHubIssue;
  onFix: (issue: GitHubIssue) => void;
  onInsert: (issue: GitHubIssue) => void;
};

export const IssueCard: React.FC<IssueCardProps> = ({ issue, onFix, onInsert }) => {
  const { t, i18n } = useTranslation();
  const isOpen = issue.state === 'open';

  const timeAgo = React.useMemo(() => {
    try {
      const ms = new Date(issue.createdAt).getTime();
      if (Number.isNaN(ms)) return issue.createdAt;
      return formatRelativeTime(ms, i18n.language);
    } catch {
      return issue.createdAt;
    }
  }, [issue.createdAt, i18n.language]);

  const handleOpenGithub = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (issue.htmlUrl) {
      void openExternalUrl(issue.htmlUrl);
    }
  };

  return (
    <div
      className='group flex flex-col gap-6px p-10px rounded-6px border border-[var(--bg-3)] bg-1 hover:bg-2 transition-colors'
      data-testid={`github-issue-card-${issue.number}`}
    >
      <div className='flex items-start justify-between gap-6px'>
        <div className='flex items-center gap-6px min-w-0 flex-1'>
          {isOpen ? (
            <span
              className='flex items-center justify-center text-[#2da44e] flex-shrink-0'
              title={t('conversation.github.stateOpen', { defaultValue: 'Open' })}
            >
              <Dot theme='filled' size='14' />
            </span>
          ) : (
            <span
              className='flex items-center justify-center text-[#8250df] flex-shrink-0'
              title={t('conversation.github.stateClosed', { defaultValue: 'Closed' })}
            >
              <CheckOne theme='outline' size='14' />
            </span>
          )}
          <span className='text-12px font-mono font-medium text-t-secondary flex-shrink-0'>#{issue.number}</span>
          <span className='text-13px font-medium text-t-primary truncate' title={issue.title}>
            {issue.title}
          </span>
        </div>

        {/* Action icons */}
        <div className='flex items-center gap-2px flex-shrink-0 opacity-80 group-hover:opacity-100'>
          <Tooltip
            content={t('conversation.github.fixWithAgent', { defaultValue: 'Fix with Agent' })}
            mini
            position='br'
          >
            <Button
              type='text'
              size='mini'
              className='flex items-center justify-center text-primary hover:bg-3'
              icon={<PlayOne theme='outline' size='14' />}
              aria-label={t('conversation.github.fixWithAgent', { defaultValue: 'Fix with Agent' })}
              onClick={() => onFix(issue)}
              data-testid={`issue-fix-button-${issue.number}`}
            />
          </Tooltip>

          <Tooltip
            content={t('conversation.github.insertInChat', { defaultValue: 'Insert in Chat' })}
            mini
            position='br'
          >
            <Button
              type='text'
              size='mini'
              className='flex items-center justify-center text-t-secondary hover:text-t-primary hover:bg-3'
              icon={<Notes theme='outline' size='14' />}
              aria-label={t('conversation.github.insertInChat', { defaultValue: 'Insert in Chat' })}
              onClick={() => onInsert(issue)}
              data-testid={`issue-insert-button-${issue.number}`}
            />
          </Tooltip>

          {issue.htmlUrl && (
            <Tooltip
              content={t('conversation.github.openOnGithub', { defaultValue: 'Open on GitHub' })}
              mini
              position='br'
            >
              <Button
                type='text'
                size='mini'
                className='flex items-center justify-center text-t-secondary hover:text-t-primary hover:bg-3'
                icon={<LinkOut theme='outline' size='14' />}
                aria-label={t('conversation.github.openOnGithub', { defaultValue: 'Open on GitHub' })}
                onClick={handleOpenGithub}
                data-testid={`issue-github-link-${issue.number}`}
              />
            </Tooltip>
          )}
        </div>
      </div>

      {/* Meta subtitle */}
      <div className='flex items-center gap-6px text-11px text-t-secondary'>
        <span className='truncate'>{issue.author.login}</span>
        <span>·</span>
        <span className='flex-shrink-0'>{timeAgo}</span>
        {issue.commentsCount > 0 && (
          <>
            <span>·</span>
            <span>
              {t('conversation.github.commentsCount', {
                count: issue.commentsCount,
                defaultValue: `${issue.commentsCount} comments`,
              })}
            </span>
          </>
        )}
      </div>

      {/* Labels */}
      {issue.labels && issue.labels.length > 0 && (
        <div className='flex flex-wrap gap-4px mt-2px'>
          {issue.labels.map((label) => (
            <Tag
              key={label.name}
              size='small'
              style={{
                backgroundColor: label.color ? `${label.color}22` : undefined,
                color: label.color || undefined,
                borderColor: label.color ? `${label.color}66` : undefined,
                fontSize: '10px',
                lineHeight: '16px',
                height: '18px',
                padding: '0 6px',
              }}
            >
              {label.name}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
};
