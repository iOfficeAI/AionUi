/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/ipcBridge';
import { Empty, Spin } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CronJobActions } from './CronJobItem';
import CronJobItem from './CronJobItem';

interface CronJobListPopoverProps extends Omit<CronJobActions, 'onPause' | 'onResume' | 'onDelete' | 'onRunNow'> {
  jobs: ICronJob[];
  loading: boolean;
  className?: string;
  showGoToButton?: boolean;
  onPauseJob: (jobId: string) => Promise<void>;
  onResumeJob: (jobId: string) => Promise<void>;
  onDeleteJob: (jobId: string) => Promise<void>;
  onRunJobNow: (jobId: string) => Promise<void>;
  onNavigateToConversation: (conversationId: string) => void;
}

/**
 * Shared popover content for displaying cron job lists
 * Used by CronJobGlobalManager and CronJobSiderEntry
 */
const CronJobListPopover: React.FC<CronJobListPopoverProps> = ({ jobs, loading, className = '', showGoToButton = false, onPauseJob, onResumeJob, onDeleteJob, onRunJobNow, onNavigateToConversation }) => {
  const { t } = useTranslation();

  return (
    <div className={`w-[320px] max-h-[450px] overflow-y-auto ${className}`}>
      <div className='font-medium text-14px mb-8px px-4px flex items-center justify-between'>
        <span>
          {t('cron.allScheduledTasks')} ({jobs.length})
        </span>
      </div>

      {loading ? (
        <div className='flex-center py-16px'>
          <Spin size={20} />
        </div>
      ) : jobs.length === 0 ? (
        <Empty description={t('cron.noTasks')} />
      ) : (
        jobs.map((job) => <CronJobItem key={job.id} job={job} onPause={() => onPauseJob(job.id)} onResume={() => onResumeJob(job.id)} onDelete={() => onDeleteJob(job.id)} onRunNow={() => onRunJobNow(job.id)} onNavigate={() => onNavigateToConversation(job.metadata.conversationId)} showConversationTitle showGoToButton={showGoToButton} variant='compact' />)
      )}
    </div>
  );
};

export default CronJobListPopover;
