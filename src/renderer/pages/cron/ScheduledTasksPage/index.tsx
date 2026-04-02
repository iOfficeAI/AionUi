/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Switch, Tag, Popconfirm, Message, Empty, Spin, Tooltip } from '@arco-design/web-react';
import { AlarmClock, Plus, Delete } from '@icon-park/react';
import { useAllCronJobs } from '@renderer/pages/cron/useCronJobs';
import { formatSchedule, formatNextRun } from '@renderer/pages/cron/cronUtils';
import { systemSettings, type ICronJob } from '@/common/adapter/ipcBridge';
import CreateTaskDialog from './CreateTaskDialog';

const ScheduledTasksPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobs, loading, pauseJob, resumeJob, deleteJob } = useAllCronJobs();
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);

  useEffect(() => {
    systemSettings.getKeepAwake
      .invoke()
      .then(setKeepAwake)
      .catch(() => {});
  }, []);

  const handleKeepAwakeChange = useCallback(async (enabled: boolean) => {
    try {
      await systemSettings.setKeepAwake.invoke({ enabled });
      setKeepAwake(enabled);
    } catch (err) {
      Message.error(String(err));
    }
  }, []);

  const handleGoToDetail = useCallback(
    (job: ICronJob) => {
      navigate(`/scheduled/${job.id}`);
    },
    [navigate]
  );

  const handleToggleEnabled = useCallback(
    async (job: ICronJob) => {
      try {
        if (job.enabled) {
          await pauseJob(job.id);
          Message.success(t('cron.pauseSuccess'));
        } else {
          await resumeJob(job.id);
          Message.success(t('cron.resumeSuccess'));
        }
      } catch (err) {
        Message.error(String(err));
      }
    },
    [pauseJob, resumeJob, t]
  );

  const handleDelete = useCallback(
    async (jobId: string) => {
      try {
        await deleteJob(jobId);
        Message.success(t('cron.deleteSuccess'));
      } catch (err) {
        Message.error(String(err));
      }
    },
    [deleteJob, t]
  );

  const getStatusTag = (job: ICronJob) => {
    if (!job.enabled) return <Tag color='gray'>{t('cron.status.paused')}</Tag>;
    if (job.state.lastStatus === 'error') return <Tag color='red'>{t('cron.status.error')}</Tag>;
    return <Tag color='green'>{t('cron.status.active')}</Tag>;
  };

  return (
    <div className='size-full flex flex-col overflow-hidden'>
      {/* Header */}
      <div className='shrink-0 px-24px pt-24px pb-16px'>
        <div className='flex items-center justify-between mb-8px'>
          <div className='flex items-center gap-12px'>
            <AlarmClock theme='outline' size={24} fill='currentColor' />
            <h1 className='text-20px font-bold m-0'>{t('cron.scheduledTasks')}</h1>
            {jobs.length > 0 && <Tag className='ml-4px'>{t('cron.taskCount', { count: jobs.length })}</Tag>}
          </div>
          <Button
            type='primary'
            shape='round'
            icon={<Plus theme='outline' size={14} />}
            onClick={() => setCreateDialogVisible(true)}
          >
            {t('cron.page.newTask')}
          </Button>
        </div>
        <p className='text-text-3 text-13px m-0'>{t('cron.page.description')}</p>
      </div>

      {/* Info banner */}
      <div className='shrink-0 mx-24px mb-16px px-16px py-12px bg-[rgba(var(--warning-6),0.08)] rd-8px flex items-center justify-between text-13px'>
        <span className='text-text-2'>{t('cron.page.awakeBanner')}</span>
        <Tooltip content={t('cron.page.keepAwakeTooltip')}>
          <div className='flex items-center gap-8px shrink-0 cursor-pointer'>
            <span className='text-text-3'>{t('cron.page.keepAwake')}</span>
            <Switch size='small' checked={keepAwake} onChange={handleKeepAwakeChange} />
          </div>
        </Tooltip>
      </div>

      {/* Task list */}
      <div className='flex-1 min-h-0 overflow-y-auto px-24px pb-24px'>
        {loading ? (
          <div className='flex justify-center py-48px'>
            <Spin />
          </div>
        ) : jobs.length === 0 ? (
          <Empty className='py-48px' description={t('cron.noTasks')} />
        ) : (
          <div className='grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-12px'>
            {jobs.map((job) => (
              <div
                key={job.id}
                className='bg-fill-1 rd-10px px-16px py-14px cursor-pointer hover:shadow-sm transition-shadow border border-solid border-[var(--color-border-2)] hover:border-[var(--color-border-3)]'
                onClick={() => handleGoToDetail(job)}
              >
                <div className='flex items-center justify-between mb-8px'>
                  <span className='text-14px font-medium truncate flex-1 min-w-0 mr-8px'>{job.name}</span>
                  {getStatusTag(job)}
                </div>
                <div className='text-13px text-text-3 truncate mb-8px'>{formatSchedule(job)}</div>
                <div className='flex items-center justify-between'>
                  <span className='text-12px text-text-3'>
                    {job.state.nextRunAtMs ? `${t('cron.nextRun')} ${formatNextRun(job.state.nextRunAtMs)}` : ''}
                  </span>
                  <div className='flex items-center gap-6px' onClick={(e) => e.stopPropagation()}>
                    <Switch size='small' checked={job.enabled} onChange={() => handleToggleEnabled(job)} />
                    <Popconfirm title={t('cron.confirmDeleteWithConversations')} onOk={() => handleDelete(job.id)}>
                      <Button size='mini' type='text' status='danger' icon={<Delete theme='outline' size={14} />} />
                    </Popconfirm>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateTaskDialog visible={createDialogVisible} onClose={() => setCreateDialogVisible(false)} />
    </div>
  );
};

export default ScheduledTasksPage;
