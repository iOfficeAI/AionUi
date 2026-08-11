/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Popover, Tooltip } from '@arco-design/web-react';
import { AlarmClock } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getJobStatusFlags } from '../cronUtils';
import { useCronJobs } from '../useCronJobs';

interface CronJobManagerProps {
  conversationId: string;
  cronJobId?: string;
}

const CronJobManager: React.FC<CronJobManagerProps> = ({ conversationId, cronJobId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openControlPanel = useCallback(() => {
    void navigate('/scheduled');
  }, [navigate]);

  const [directJob, setDirectJob] = useState<ICronJob | null>(null);
  const [directLoading, setDirectLoading] = useState(!!cronJobId);

  useEffect(() => {
    if (!cronJobId) return;

    setDirectLoading(true);
    ipcBridge.cron.getJob
      .invoke({ jobId: cronJobId })
      .then((job) => setDirectJob(job ?? null))
      .catch(() => setDirectJob(null))
      .finally(() => setDirectLoading(false));
  }, [cronJobId]);

  const { jobs, loading: listLoading, hasJobs } = useCronJobs(cronJobId ? undefined : conversationId);
  const job = cronJobId ? directJob : (jobs[0] ?? null);
  const loading = cronJobId ? directLoading : listLoading;
  const found = cronJobId ? !!directJob : hasJobs;

  if (!found && !loading) {
    return (
      <Popover
        trigger='hover'
        position='bottom'
        content={
          <div className='flex max-w-240px flex-col gap-8px p-4px'>
            <div className='text-13px text-t-secondary'>{t('cron.panel.entryHint')}</div>
            <Button type='primary' size='mini' onClick={openControlPanel}>
              {t('cron.panel.openPanelButton')}
            </Button>
          </div>
        }
      >
        <Button
          type='text'
          size='small'
          className='cron-job-manager-button chat-header-cron-pill !h-auto !w-auto !min-w-0 !px-0 !py-0'
          onClick={openControlPanel}
        >
          <span className='inline-flex items-center gap-2px rounded-full bg-2 px-8px py-2px'>
            <AlarmClock theme='outline' size={16} fill={iconColors.disabled} />
            <span className='ml-4px h-8px w-8px rounded-full bg-[var(--color-text-4)]' />
          </span>
        </Button>
      </Popover>
    );
  }

  if (loading || !job) {
    return null;
  }

  const { hasError, isPaused } = getJobStatusFlags(job);
  const tooltipContent = isPaused ? t('cron.status.paused') : hasError ? t('cron.status.error') : job.name;

  return (
    <Tooltip content={tooltipContent}>
      <Button
        type='text'
        size='small'
        className='cron-job-manager-button chat-header-cron-pill !h-auto !w-auto !min-w-0 !px-0 !py-0'
        onClick={() => void navigate(`/scheduled/${job.id}`)}
      >
        <span className='inline-flex items-center gap-2px rounded-full bg-2 px-8px py-2px'>
          <AlarmClock theme='outline' size={16} fill={iconColors.primary} />
          <span
            className={`ml-4px h-8px w-8px rounded-full ${
              hasError
                ? 'bg-[var(--color-danger-6)]'
                : isPaused
                  ? 'bg-[var(--color-warning-6)]'
                  : 'bg-[var(--color-success-6)]'
            }`}
          />
        </span>
      </Button>
    </Tooltip>
  );
};

export default CronJobManager;
