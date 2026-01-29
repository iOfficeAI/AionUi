/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/theme/colors';
import { Popover, Tooltip } from '@arco-design/web-react';
import { AlarmClock, Attention } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAllCronJobs } from '../hooks/useCronJobs';
import CronJobListPopover from './CronJobListPopover';

interface CronJobSiderEntryProps {
  collapsed?: boolean;
}

/**
 * Cron job entry in the sider
 * Shows all cron jobs across all conversations
 */
const CronJobSiderEntry: React.FC<CronJobSiderEntryProps> = ({ collapsed = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobs, loading, activeCount, hasError, pauseJob, resumeJob, deleteJob, runJobNow } = useAllCronJobs();

  const navigateToConversation = useCallback(
    (conversationId: string) => {
      void navigate(`/conversation/${conversationId}`);
    },
    [navigate]
  );

  // Don't render if no jobs
  if (!loading && jobs.length === 0) {
    return null;
  }

  const entryContent = (
    <div className='flex items-center justify-start gap-10px px-12px py-8px hover:bg-hover rd-0.5rem mb-8px cursor-pointer group shrink-0'>
      {hasError ? <Attention theme='outline' size='24' fill={iconColors.warning} className='flex' /> : <AlarmClock theme='outline' size='24' fill={iconColors.primary} className='flex' />}
      <span className='collapsed-hidden text-t-primary'>
        {t('cron.allScheduledTasks')} ({activeCount}/{jobs.length})
      </span>
    </div>
  );

  return (
    <Tooltip disabled={!collapsed} content={`${t('cron.allScheduledTasks')} (${activeCount}/${jobs.length})`} position='right'>
      <Popover content={<CronJobListPopover jobs={jobs} loading={loading} showGoToButton onPauseJob={pauseJob} onResumeJob={resumeJob} onDeleteJob={deleteJob} onRunJobNow={runJobNow} onNavigateToConversation={navigateToConversation} />} trigger='click' position='right'>
        {entryContent}
      </Popover>
    </Tooltip>
  );
};

export default CronJobSiderEntry;
