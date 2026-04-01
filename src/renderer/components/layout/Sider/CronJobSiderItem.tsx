/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { Down } from '@icon-park/react';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { formatSchedule } from '@renderer/pages/cron/cronUtils';
import { useCronJobConversations } from '@renderer/pages/cron/useCronJobs';

interface CronJobSiderItemProps {
  job: ICronJob;
  pathname: string;
  onNavigate: (path: string) => void;
}

const MAX_VISIBLE_CONVERSATIONS = 5;

const CronJobSiderItem: React.FC<CronJobSiderItemProps> = ({ job, pathname, onNavigate }) => {
  const isNewConversationMode = job.target.executionMode === 'new_conversation';
  const { conversations } = useCronJobConversations(isNewConversationMode ? job.id : undefined);

  // Auto-expand when the current route matches this job's detail page or any child conversation
  const childConversationIds = useMemo(() => new Set(conversations.map((c) => c.id)), [conversations]);
  const isActiveChild = pathname.startsWith('/conversation/') && childConversationIds.has(pathname.split('/')[2]);
  const isActiveDetail = pathname === `/scheduled/${job.id}`;

  const [expanded, setExpanded] = useState(false);

  // Auto-expand when navigating to a child conversation or task detail
  useEffect(() => {
    if (isActiveChild || isActiveDetail) {
      setExpanded(true);
    }
  }, [isActiveChild, isActiveDetail]);

  const hasChildren =
    (!isNewConversationMode && !!job.metadata.conversationId) || (isNewConversationMode && conversations.length > 0);

  return (
    <div className='min-w-0 px-8px'>
      {/* Header - arrow toggles expand, text navigates to detail */}
      <div
        className={classNames(
          'flex items-center ml-2px gap-8px h-32px p-4px rd-4px transition-colors min-w-0',
          pathname === `/scheduled/${job.id}`
            ? 'bg-[rgba(var(--primary-6),0.08)]'
            : 'hover:bg-[rgba(var(--primary-6),0.14)]'
        )}
      >
        {/* Expand/collapse arrow - click to toggle */}
        {hasChildren && (
          <Down
            size={16}
            className={classNames(
              'line-height-0 transition-transform duration-200 flex-shrink-0 cursor-pointer',
              expanded ? 'rotate-0' : '-rotate-90'
            )}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          />
        )}

        {/* Title - click to navigate to task detail */}
        <div
          className='flex-1 ml-6px min-w-0 overflow-hidden cursor-pointer'
          onClick={() => onNavigate(`/scheduled/${job.id}`)}
        >
          <div className='flex items-center gap-8px text-14px min-w-0'>
            <span className='font-medium truncate flex-1 text-t-primary min-w-0'>{job.name}</span>
          </div>
        </div>
      </div>

      {/* Collapsed content - matches WorkspaceCollapse content style */}
      {expanded && hasChildren && (
        <div className='ml-8px'>
          <div className='flex flex-col gap-2px min-w-0 mt-4px'>
            {/* existing mode: single conversation */}
            {!isNewConversationMode && job.metadata.conversationId && (
              <div
                className={classNames(
                  'flex items-center gap-8px h-36px px-8px rd-4px cursor-pointer transition-colors min-w-0',
                  pathname === `/conversation/${job.metadata.conversationId}`
                    ? 'bg-[rgba(var(--primary-6),0.08)] text-primary'
                    : 'hover:bg-[rgba(var(--primary-6),0.14)]'
                )}
                onClick={() => onNavigate(`/conversation/${job.metadata.conversationId}`)}
              >
                <span className='text-13px truncate text-t-primary min-w-0'>
                  {job.metadata.conversationTitle || job.metadata.conversationId}
                </span>
              </div>
            )}

            {/* new_conversation mode: child conversations */}
            {isNewConversationMode &&
              conversations.slice(0, MAX_VISIBLE_CONVERSATIONS).map((conv) => (
                <div
                  key={conv.id}
                  className={classNames(
                    'flex items-center gap-8px h-36px px-8px rd-4px cursor-pointer transition-colors min-w-0',
                    pathname === `/conversation/${conv.id}`
                      ? 'bg-[rgba(var(--primary-6),0.08)] text-primary'
                      : 'hover:bg-[rgba(var(--primary-6),0.14)]'
                  )}
                  onClick={() => onNavigate(`/conversation/${conv.id}`)}
                >
                  <span className='text-13px truncate text-t-primary min-w-0'>{conv.name || conv.id}</span>
                </div>
              ))}

            {isNewConversationMode && conversations.length > MAX_VISIBLE_CONVERSATIONS && (
              <div
                className='flex items-center h-36px px-8px rd-4px cursor-pointer hover:bg-[rgba(var(--primary-6),0.14)] transition-colors'
                onClick={() => onNavigate(`/scheduled/${job.id}`)}
              >
                <span className='text-12px text-primary'>
                  +{conversations.length - MAX_VISIBLE_CONVERSATIONS} more...
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CronJobSiderItem;
