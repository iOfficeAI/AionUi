/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/theme/colors';
import { Popover } from '@arco-design/web-react';
import { AlarmClock, Attention } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAllCronJobs } from '../hooks/useCronJobs';
import CronJobListPopover from './CronJobListPopover';

/**
 * Global cron job manager component
 * Shows all cron jobs across all conversations
 */
const CronJobGlobalManager: React.FC = () => {
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

  return (
    <Popover content={<CronJobListPopover jobs={jobs} loading={loading} onPauseJob={pauseJob} onResumeJob={resumeJob} onDeleteJob={deleteJob} onRunJobNow={runJobNow} onNavigateToConversation={navigateToConversation} />} trigger='click' position='br'>
      <div className='flex items-center justify-center w-40px h-40px shrink-0 cursor-pointer transition-colors duration-200 hover:bg-[var(--fill-2)]' style={{ borderLeft: '1px solid var(--border-base)' }} title={t('cron.allScheduledTasks')}>
        {hasError ? <Attention theme='outline' size='16' fill={iconColors.warning} /> : <AlarmClock theme='outline' size='16' fill={iconColors.primary} />}
        {jobs.length > 0 && <span className='text-10px ml-2px'>{activeCount}</span>}
      </div>
    </Popover>
  );
};

export default CronJobGlobalManager;
