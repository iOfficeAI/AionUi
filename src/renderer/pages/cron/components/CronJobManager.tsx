/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { emitter } from '@/renderer/utils/emitter';
import { ipcBridge } from '@/common';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { Button, Popover, Tooltip } from '@arco-design/web-react';
import { AlarmClock } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCronJobs } from '../useCronJobs';
import { getJobStatusFlags } from '../cronUtils';

interface CronJobManagerProps {
  conversation_id: string;
  /** When provided (e.g. from conversation.extra.cron_job_id), fetch the job directly */
  cron_job_id?: string;
  /** Whether the cron skill is loaded for this conversation. When false and no jobs exist, the component is hidden. */
  hasCronSkill?: boolean;
}

/**
 * Cron job manager component for ChatLayout headerExtra
 * Shows a single job per conversation with navigation to task detail
 */
const CronJobManager: React.FC<CronJobManagerProps> = ({ conversation_id, cron_job_id, hasCronSkill = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // For child conversations spawned by a cron job, fetch the job directly by ID
  const [directJob, setDirectJob] = useState<ICronJob | null>(null);
  const [directLoading, setDirectLoading] = useState(!!cron_job_id);

  useEffect(() => {
    if (!cron_job_id) {
      setDirectJob(null);
      setDirectLoading(false);
      return;
    }

    setDirectLoading(true);
    ipcBridge.cron.getJob
      .invoke({ job_id: cron_job_id })
      .then((job) => setDirectJob(job ?? null))
      .catch(() => setDirectJob(null))
      .finally(() => setDirectLoading(false));
  }, [cron_job_id]);

  useEffect(() => {
    if (!cron_job_id) return;

    const unsubCreated = ipcBridge.cron.onJobCreated.on((created) => {
      if (created.id === cron_job_id) {
        setDirectJob(created);
        setDirectLoading(false);
      }
    });
    const unsubUpdated = ipcBridge.cron.onJobUpdated.on((updated) => {
      if (updated.id === cron_job_id) {
        setDirectJob(updated);
        setDirectLoading(false);
      }
    });
    const unsubRemoved = ipcBridge.cron.onJobRemoved.on(({ job_id }) => {
      if (job_id === cron_job_id) {
        setDirectJob(null);
        setDirectLoading(false);
      }
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubRemoved();
    };
  }, [cron_job_id]);

  // For regular conversations, use the existing hook
  const { jobs, loading: listLoading, hasJobs } = useCronJobs(cron_job_id ? undefined : conversation_id);

  const job = cron_job_id ? directJob : (jobs[0] ?? null);
  const loading = cron_job_id ? directLoading : listLoading;
  const found = cron_job_id ? !!directJob : hasJobs;

  // Handle unconfigured state (no jobs)
  // If cron skill is not loaded for this conversation, hide entirely
  if (!found && !loading && !hasCronSkill) return null;

  if (!found && !loading) {
    const handleCreateClick = () => {
      emitter.emit('sendbox.fill', t('cron.status.defaultPrompt'));
    };

    return (
      <Popover
        trigger='hover'
        position='bottom'
        content={
          <div className='flex flex-col gap-8px p-4px max-w-240px'>
            <div className='text-13px text-t-secondary'>{t('cron.status.unconfiguredHint')}</div>
            <Button type='primary' size='mini' onClick={handleCreateClick}>
              {t('cron.status.createNow')}
            </Button>
          </div>
        }
      >
        <Button
          type='text'
          size='small'
          className='cron-job-manager-button chat-header-cron-pill !h-auto !w-auto !min-w-0 !px-0 !py-0'
        >
          <span className='inline-flex items-center gap-2px rounded-full px-8px py-2px bg-2'>
            <AlarmClock theme='outline' size={16} fill={iconColors.disabled} />
            <span className='ml-4px w-8px h-8px rounded-full bg-[#86909c]' />
          </span>
        </Button>
      </Popover>
    );
  }

  if (loading || !job) return null;

  const { hasError, isPaused } = getJobStatusFlags(job);
  const tooltipContent = isPaused ? t('cron.status.paused') : hasError ? t('cron.status.error') : job.name;

  return (
    <Tooltip content={tooltipContent}>
      <Button
        type='text'
        size='small'
        className='cron-job-manager-button chat-header-cron-pill !h-auto !w-auto !min-w-0 !px-0 !py-0'
        onClick={() => navigate(`/scheduled/${job.id}`)}
      >
        <span className='inline-flex items-center gap-2px rounded-full px-8px py-2px bg-2'>
          <AlarmClock theme='outline' size={16} fill={iconColors.primary} />
          <span
            className={`ml-4px w-8px h-8px rounded-full ${hasError ? 'bg-[#f53f3f]' : isPaused ? 'bg-[#ff7d00]' : 'bg-[#00b42a]'}`}
          />
        </span>
      </Button>
    </Tooltip>
  );
};

export default CronJobManager;
