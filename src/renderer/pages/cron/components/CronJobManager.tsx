/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Popover, Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCronJobs } from '../hooks/useCronJobs';
import { getJobStatusFlags } from '../utils/cronUtils';
import CronJobItem, { CronJobStatusIcon } from './CronJobItem';

interface CronJobManagerProps {
  conversationId: string;
}

/**
 * Cron job manager component for ChatLayout headerExtra
 * Shows a single job per conversation
 */
const CronJobManager: React.FC<CronJobManagerProps> = ({ conversationId }) => {
  const { t } = useTranslation();
  const { jobs, loading, hasJobs, pauseJob, resumeJob, deleteJob, runJobNow } = useCronJobs(conversationId);

  // Don't render anything if no jobs or loading
  if (!hasJobs || loading) {
    return null;
  }

  // Get the single job (assuming one job per conversation)
  const job = jobs[0];
  if (!job) return null;

  const { hasError, isPaused } = getJobStatusFlags(job);

  const popoverContent = (
    <div className='cron-job-manager-popover w-[280px]'>
      <CronJobItem job={job} onPause={() => pauseJob(job.id)} onResume={() => resumeJob(job.id)} onDelete={() => deleteJob(job.id)} onRunNow={() => runJobNow(job.id)} showMessage variant='full' />
    </div>
  );

  const tooltipContent = isPaused ? t('cron.status.paused') : hasError ? t('cron.status.error') : job.name;

  return (
    <Popover content={popoverContent} trigger='click' position='bottom'>
      <Tooltip content={tooltipContent}>
        <Button type='text' size='small' className='cron-job-manager-button' icon={<CronJobStatusIcon job={job} size={16} />} />
      </Tooltip>
    </Popover>
  );
};

export default CronJobManager;
