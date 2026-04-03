/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Switch, Tag, Popconfirm, Message, Empty, Spin, Tooltip } from '@arco-design/web-react';
import { IconSun } from '@arco-design/web-react/icon';
import { Plus, Delete, Info } from '@icon-park/react';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { useAllCronJobs } from '@renderer/pages/cron/useCronJobs';
import { formatSchedule, formatNextRun } from '@renderer/pages/cron/cronUtils';
import { systemSettings, type ICronJob } from '@/common/adapter/ipcBridge';
import CreateTaskDialog from './CreateTaskDialog';

const ScheduledTasksPage: React.FC = () => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
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
    if (!job.enabled) {
      return (
        <Tag size='small' color='gray' className='shrink-0'>
          {t('cron.status.paused')}
        </Tag>
      );
    }
    if (job.state.lastStatus === 'error') {
      return (
        <Tag size='small' color='red' className='shrink-0'>
          {t('cron.status.error')}
        </Tag>
      );
    }
    return (
      <Tag size='small' color='green' className='shrink-0'>
        {t('cron.status.active')}
      </Tag>
    );
  };

  const pageShellClass = classNames(
    'w-full min-h-full box-border overflow-y-auto',
    isMobile ? 'px-16px py-14px' : 'px-12px md:px-40px py-24px md:py-32px'
  );
  const contentFrameClass = classNames(
    'mx-auto flex w-full max-w-760px box-border flex-col',
    isMobile ? 'gap-14px' : 'gap-16px'
  );
  const headerSectionClass = classNames('flex w-full flex-col', isMobile ? 'gap-6px' : 'gap-8px');
  const headerTopClass = 'flex w-full items-start justify-between gap-12px sm:gap-16px max-[520px]:flex-wrap';
  const titleRowClass = classNames('flex flex-wrap items-center', isMobile ? 'gap-6px' : 'gap-8px');
  const descriptionClass = classNames(
    'm-0 w-full text-text-3',
    isMobile ? 'text-13px leading-20px' : 'text-14px leading-22px'
  );
  const awakeBarClass =
    'grid w-full box-border grid-cols-[minmax(0,1fr)_auto] items-center gap-x-12px gap-y-10px border border-solid border-[var(--color-border-2)] bg-base rd-12px sm:rd-14px px-14px sm:px-16px py-12px max-[520px]:grid-cols-1';
  const headerActionClass = 'shrink-0 max-[520px]:ml-auto';
  const keepAwakeWrapClass = 'justify-self-end';
  const keepAwakeRowClass = 'flex items-center gap-8px text-text-3 text-12px sm:text-13px leading-18px';
  const taskGridClass = classNames(
    'grid w-full grid-cols-1',
    isMobile ? 'gap-12px' : 'gap-16px sm:grid-cols-2 lg:grid-cols-3'
  );
  const taskCardClass = classNames(
    'group flex box-border cursor-pointer flex-col justify-between border border-solid border-[var(--color-border-2)] bg-base transition-colors duration-200 hover:border-[var(--color-border-3)]',
    isMobile ? 'min-h-136px rd-12px px-14px py-12px' : 'min-h-120px rd-12px px-12px py-12px'
  );

  return (
    <div className={pageShellClass}>
      <div className={contentFrameClass}>
        <div className={headerSectionClass}>
          <div className={headerTopClass}>
            <div className={titleRowClass}>
              <h1
                className={classNames(
                  'm-0 font-bold',
                  isMobile ? 'text-24px leading-[1.2]' : 'text-28px leading-[1.15]'
                )}
              >
                {t('cron.scheduledTasks')}
              </h1>
            </div>
            <div className={headerActionClass}>
              <Button
                type='primary'
                shape='round'
                className='mt-2px shrink-0'
                icon={<Plus theme='outline' size={14} />}
                onClick={() => setCreateDialogVisible(true)}
              >
                {t('cron.page.newTask')}
              </Button>
            </div>
          </div>
          <p className={descriptionClass}>{t('cron.page.description')}</p>
        </div>

        <div className={awakeBarClass}>
          <div className='min-w-0 flex items-start gap-10px'>
            <Info theme='outline' size={14} className='shrink-0 text-text-3' />
            <span className={classNames('text-text-2', isMobile ? 'text-12px leading-18px' : 'text-13px leading-20px')}>
              {t('cron.page.awakeBanner')}
            </span>
          </div>
          <div className={keepAwakeWrapClass}>
            <Tooltip content={t('cron.page.keepAwakeTooltip')}>
              <div className={keepAwakeRowClass}>
                <div className='flex items-center gap-8px'>
                  <IconSun style={{ fontSize: 14 }} />
                  <span>{t('cron.page.keepAwake')}</span>
                </div>
                <Switch size='small' checked={keepAwake} onChange={handleKeepAwakeChange} />
              </div>
            </Tooltip>
          </div>
        </div>

        {loading ? (
          <div className='flex min-h-220px items-center justify-center rd-16px border border-dashed border-border-2 bg-fill-1'>
            <Spin />
          </div>
        ) : jobs.length === 0 ? (
          <div className='flex min-h-220px items-center justify-center rd-16px border border-dashed border-border-2 bg-fill-1'>
            <Empty description={t('cron.noTasks')} />
          </div>
        ) : (
          <div className={taskGridClass}>
            {jobs.map((job) => (
              <div key={job.id} className={taskCardClass} onClick={() => handleGoToDetail(job)}>
                <div className='min-w-0 flex-1'>
                  <div className='flex items-start justify-between gap-10px'>
                    <span
                      className={classNames(
                        'min-w-0 flex-1 font-semibold text-text-1 break-words line-clamp-2',
                        isMobile ? 'text-14px leading-20px' : 'text-15px leading-22px'
                      )}
                    >
                      {job.name}
                    </span>
                    {getStatusTag(job)}
                  </div>
                  <div className={classNames('flex flex-col', isMobile ? 'mt-8px gap-6px' : 'mt-8px gap-6px')}>
                    <div
                      className={classNames(
                        'min-w-0 text-text-2 break-words line-clamp-2',
                        isMobile ? 'text-12px leading-18px' : 'text-13px leading-20px'
                      )}
                      title={formatSchedule(job)}
                    >
                      {formatSchedule(job)}
                    </div>
                    <div
                      className={classNames(
                        'min-w-0 text-text-2 break-words',
                        isMobile ? 'text-12px leading-18px' : 'text-13px leading-20px'
                      )}
                      title={
                        job.state.nextRunAtMs ? `${t('cron.nextRun')} ${formatNextRun(job.state.nextRunAtMs)}` : '-'
                      }
                    >
                      {job.state.nextRunAtMs ? `${t('cron.nextRun')} ${formatNextRun(job.state.nextRunAtMs)}` : '-'}
                    </div>
                  </div>
                </div>
                <div
                  className={classNames('flex items-center justify-end', isMobile ? 'mt-8px' : 'mt-10px')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className='flex items-center gap-8px'>
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

        <CreateTaskDialog visible={createDialogVisible} onClose={() => setCreateDialogVisible(false)} />
      </div>
    </div>
  );
};

export default ScheduledTasksPage;
