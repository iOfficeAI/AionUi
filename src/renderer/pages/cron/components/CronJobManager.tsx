/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { ipcBridge } from '@/common';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { Button, Empty, Message, Popover, Tooltip } from '@arco-design/web-react';
import { AlarmClock, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCronJobs } from '../useCronJobs';
import { getJobStatusFlags } from '../cronUtils';
import CreateTaskDialog from '../ScheduledTasksPage/CreateTaskDialog';

type CronJobManagerProps = {
  conversationId: string;
  conversationTitle?: string;
  agentType?: string;
};

const CronJobManager: React.FC<CronJobManagerProps> = ({ conversationId, conversationTitle, agentType }) => {
  const { t } = useTranslation();
  const { jobs, loading, refetch } = useCronJobs(conversationId);
  const [allJobs, setAllJobs] = useState<ICronJob[]>([]);
  const [allJobsLoading, setAllJobsLoading] = useState(false);
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [bindingJobId, setBindingJobId] = useState<string | null>(null);

  const loadAllJobs = useCallback(async () => {
    setAllJobsLoading(true);
    try {
      const result = await ipcBridge.cron.listJobs.invoke();
      setAllJobs(result || []);
    } catch (err) {
      console.error('[CronJobManager] Failed to load cron jobs:', err);
      setAllJobs([]);
    } finally {
      setAllJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAllJobs();
  }, [loadAllJobs]);

  const boundJobIds = useMemo(() => new Set(jobs.map((job) => job.id)), [jobs]);
  const bindableJobs = useMemo(
    () => allJobs.filter((job) => job.target.executionMode !== 'new_conversation' && !boundJobIds.has(job.id)),
    [allJobs, boundJobIds]
  );

  const status = useMemo(() => {
    if (jobs.length === 0) return 'none';
    if (jobs.some((job) => job.state.lastStatus === 'error')) return 'error';
    if (jobs.every((job) => !job.enabled)) return 'paused';
    return 'active';
  }, [jobs]);

  const indicatorClass =
    status === 'error' ? 'bg-danger' : status === 'paused' ? 'bg-warning' : status === 'active' ? 'bg-success' : 'bg-6';
  const iconFill = status === 'none' ? iconColors.disabled : iconColors.primary;
  const tooltipContent =
    status === 'none'
      ? t('cron.binding.noBoundTasks')
      : status === 'paused'
        ? t('cron.status.paused')
        : status === 'error'
          ? t('cron.status.error')
          : t('cron.binding.boundTaskCount', { count: jobs.length });

  const handleBind = useCallback(
    async (job: ICronJob) => {
      setBindingJobId(job.id);
      try {
        await ipcBridge.cron.bindConversation.invoke({ jobId: job.id, conversationId });
        Message.success(t('cron.binding.bindSuccess'));
        await Promise.all([refetch(), loadAllJobs()]);
      } catch (err) {
        Message.error(String(err));
      } finally {
        setBindingJobId(null);
      }
    },
    [conversationId, loadAllJobs, refetch, t]
  );

  const handleUnbind = useCallback(
    async (job: ICronJob) => {
      setBindingJobId(job.id);
      try {
        await ipcBridge.cron.unbindConversation.invoke({ jobId: job.id, conversationId });
        Message.success(t('cron.binding.unbindSuccess'));
        await Promise.all([refetch(), loadAllJobs()]);
      } catch (err) {
        Message.error(String(err));
      } finally {
        setBindingJobId(null);
      }
    },
    [conversationId, loadAllJobs, refetch, t]
  );

  const handleCreateClose = useCallback(() => {
    setCreateDialogVisible(false);
    void Promise.all([refetch(), loadAllJobs()]);
  }, [loadAllJobs, refetch]);

  const renderJobRow = (job: ICronJob, onClick: () => void) => {
    const { hasError, isPaused } = getJobStatusFlags(job);
    const dotClass = hasError ? 'bg-danger' : isPaused ? 'bg-warning' : 'bg-success';
    return (
      <Button
        key={job.id}
        type='text'
        loading={bindingJobId === job.id}
        className='!h-auto !min-w-0 !w-full !justify-start !rounded-8px !px-8px !py-6px !text-left hover:!bg-fill-2'
        onClick={onClick}
      >
        <span className='flex min-w-0 items-center gap-6px'>
          <span className={`h-7px w-7px shrink-0 rounded-full ${dotClass}`} />
          <span className='min-w-0 truncate text-13px text-t-primary'>{job.name}</span>
        </span>
      </Button>
    );
  };

  return (
    <>
      <Popover
        trigger='click'
        position='bottom'
        content={
          <div className='flex w-300px max-w-[calc(100vw-32px)] flex-col gap-12px p-4px'>
            <div className='flex items-center justify-between gap-8px'>
              <span className='text-13px font-medium text-t-primary'>{t('cron.binding.title')}</span>
              <Button
                size='mini'
                type='primary'
                icon={<Plus theme='outline' size={12} />}
                onClick={() => setCreateDialogVisible(true)}
              >
                {t('cron.binding.createAndBind')}
              </Button>
            </div>

            <div className='flex flex-col gap-6px'>
              <span className='text-12px text-t-secondary'>{t('cron.binding.boundTasks')}</span>
              {loading ? (
                <div className='py-8px text-12px text-t-secondary'>{t('common.loading')}</div>
              ) : jobs.length > 0 ? (
                <div className='flex max-h-160px flex-col overflow-y-auto'>
                  {jobs.map((job) => renderJobRow(job, () => handleUnbind(job)))}
                </div>
              ) : (
                <Empty description={t('cron.binding.noBoundTasks')} className='py-8px' />
              )}
            </div>

            <div className='h-1px w-full bg-[var(--color-border-2)]' />

            <div className='flex flex-col gap-6px'>
              <span className='text-12px text-t-secondary'>{t('cron.binding.availableTasks')}</span>
              {allJobsLoading ? (
                <div className='py-8px text-12px text-t-secondary'>{t('common.loading')}</div>
              ) : bindableJobs.length > 0 ? (
                <div className='flex max-h-180px flex-col overflow-y-auto'>
                  {bindableJobs.map((job) => renderJobRow(job, () => handleBind(job)))}
                </div>
              ) : (
                <div className='py-8px text-12px text-t-secondary'>{t('cron.binding.noAvailableTasks')}</div>
              )}
            </div>
          </div>
        }
      >
        <Tooltip content={tooltipContent}>
          <Button
            type='text'
            size='small'
            className='cron-job-manager-button chat-header-cron-pill !h-auto !w-auto !min-w-0 !px-0 !py-0'
          >
            <span className='inline-flex items-center gap-2px rounded-full px-8px py-2px bg-2'>
              <AlarmClock theme='outline' size={16} fill={iconFill} />
              <span className={`ml-4px h-8px w-8px rounded-full ${indicatorClass}`} />
            </span>
          </Button>
        </Tooltip>
      </Popover>

      <CreateTaskDialog
        visible={createDialogVisible}
        onClose={handleCreateClose}
        conversationId={conversationId}
        conversationTitle={conversationTitle}
        agentType={agentType}
      />
    </>
  );
};

export default CronJobManager;
