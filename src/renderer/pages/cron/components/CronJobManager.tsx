/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/theme/colors';
import { Button, Tooltip } from '@arco-design/web-react';
import { AlarmClock } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCronJobs } from '../hooks/useCronJobs';
import { getJobStatusFlags } from '../utils/cronUtils';
import CronJobDrawer from './CronJobDrawer';

interface CronJobManagerProps {
  conversationId: string;
}

/**
 * Cron job manager component for ChatLayout headerExtra
 * Shows a single job per conversation with drawer for editing
 */
const CronJobManager: React.FC<CronJobManagerProps> = ({ conversationId }) => {
  const { t } = useTranslation();
  const { jobs, loading, hasJobs, deleteJob, updateJob } = useCronJobs(conversationId);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Don't render anything if no jobs or loading
  if (!hasJobs || loading) {
    return null;
  }

  // Get the single job (assuming one job per conversation)
  const job = jobs[0];
  if (!job) return null;

  const { hasError, isPaused } = getJobStatusFlags(job);

  const tooltipContent = isPaused ? t('cron.status.paused') : hasError ? t('cron.status.error') : job.name;

  const handleSave = async (updates: { message: string; enabled: boolean }) => {
    await updateJob(job.id, {
      enabled: updates.enabled,
      target: { payload: { kind: 'message', text: updates.message } },
    });
  };

  const handleDelete = async () => {
    await deleteJob(job.id);
  };

  return (
    <>
      <Tooltip content={tooltipContent}>
        <Button
          type='text'
          size='small'
          className='cron-job-manager-button '
          style={{ marginRight: 16 }}
          onClick={() => setDrawerVisible(true)}
          icon={
            <span className='inline-flex items-center gap-2px rounded-full px-8px py-2px  bg-2'>
              <AlarmClock theme='outline' size={16} fill={hasError ? iconColors.warning : isPaused ? iconColors.secondary : iconColors.primary} />
              <span className={`ml-4px w-8px h-8px rounded-full ${isPaused ? 'bg-[#f53f3f]' : 'bg-[#00b42a]'}`} />
            </span>
          }
        />
      </Tooltip>
      <CronJobDrawer visible={drawerVisible} job={job} onClose={() => setDrawerVisible(false)} onSave={handleSave} onDelete={handleDelete} />
    </>
  );
};

export default CronJobManager;
