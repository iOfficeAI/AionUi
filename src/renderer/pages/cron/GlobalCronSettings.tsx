/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/adapter/ipcBridge';
import SettingsPageWrapper from '@/renderer/pages/settings/components/SettingsPageWrapper';
import { Button, Empty, Input, Message, Select, Spin, Tag, Typography } from '@arco-design/web-react';
import { AlarmClock, ArrowRight, Edit, Pause, Play, Refresh, Search } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatNextRun } from './cronUtils';
import CronJobDrawer from './components/CronJobDrawer';
import { useAllCronJobs } from './useCronJobs';
import {
  filterGlobalCronJobs,
  getGlobalCronJobStatus,
  summarizeGlobalCronJobs,
  type GlobalCronJobStatus,
} from './globalCronSettingsUtils';

const statusColorMap: Record<GlobalCronJobStatus, string> = {
  active: 'green',
  paused: 'orange',
  error: 'red',
};

const GlobalCronSettings: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [messageApi, messageContext] = Message.useMessage();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<GlobalCronJobStatus | 'all'>('all');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { jobs, loading, refetch, pauseJob, resumeJob, deleteJob, updateJob } = useAllCronJobs();

  const stats = useMemo(() => summarizeGlobalCronJobs(jobs), [jobs]);
  const filteredJobs = useMemo(
    () => filterGlobalCronJobs(jobs, searchQuery, statusFilter),
    [jobs, searchQuery, statusFilter]
  );
  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) ?? jobs.find((job) => job.id === selectedJobId) ?? null,
    [filteredJobs, jobs, selectedJobId]
  );

  const statusOptions = useMemo(
    () => [
      { label: t('cron.overview.filters.allStatuses'), value: 'all' },
      { label: t('cron.status.active'), value: 'active' },
      { label: t('cron.status.paused'), value: 'paused' },
      { label: t('cron.status.error'), value: 'error' },
    ],
    [t]
  );

  const handleRefresh = async () => {
    await refetch();
  };

  const handleToggleJob = async (job: ICronJob) => {
    try {
      if (job.enabled) {
        await pauseJob(job.id);
        messageApi.success(t('cron.pauseSuccess'));
      } else {
        await resumeJob(job.id);
        messageApi.success(t('cron.resumeSuccess'));
      }
    } catch (error) {
      console.error('[GlobalCronSettings] Failed to toggle cron job:', error);
      messageApi.error(t('common.unknownError'));
    }
  };

  const handleSaveJob = async (job: ICronJob, updates: { message: string; enabled: boolean }) => {
    await updateJob(job.id, {
      enabled: updates.enabled,
      target: { payload: { kind: 'message', text: updates.message } },
    });
  };

  const handleDeleteJob = async (job: ICronJob) => {
    await deleteJob(job.id);
  };

  return (
    <>
      {messageContext}
      <SettingsPageWrapper contentClassName='max-w-1200px'>
        <div className='flex flex-col gap-16px'>
          <div className='rounded-16px border border-border-2 bg-bg-1 p-20px md:p-24px'>
            <div className='flex flex-col gap-16px md:flex-row md:items-start md:justify-between'>
              <div className='min-w-0'>
                <Typography.Title heading={5} className='!mb-8px'>
                  {t('cron.allScheduledTasks')}
                </Typography.Title>
                <Typography.Paragraph className='!mb-0 text-t-secondary'>
                  {t('cron.overview.description')}
                </Typography.Paragraph>
              </div>
              <Button
                type='outline'
                icon={<Refresh size={14} className={loading ? 'animate-spin' : ''} />}
                onClick={() => void handleRefresh()}
              >
                {t('common.refresh')}
              </Button>
            </div>
          </div>

          <div className='grid gap-12px md:grid-cols-4'>
            <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
              <Typography.Text type='secondary' className='text-12px'>
                {t('cron.overview.stats.total')}
              </Typography.Text>
              <div className='mt-6px text-28px font-semibold text-t-primary'>{stats.total}</div>
            </div>
            <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
              <Typography.Text type='secondary' className='text-12px'>
                {t('cron.overview.stats.active')}
              </Typography.Text>
              <div className='mt-6px text-28px font-semibold text-t-primary'>{stats.active}</div>
            </div>
            <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
              <Typography.Text type='secondary' className='text-12px'>
                {t('cron.overview.stats.paused')}
              </Typography.Text>
              <div className='mt-6px text-28px font-semibold text-t-primary'>{stats.paused}</div>
            </div>
            <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
              <Typography.Text type='secondary' className='text-12px'>
                {t('cron.overview.stats.error')}
              </Typography.Text>
              <div className='mt-6px text-28px font-semibold text-t-primary'>{stats.error}</div>
            </div>
          </div>

          <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
            <div className='flex flex-col gap-12px md:flex-row'>
              <Input
                value={searchQuery}
                allowClear
                prefix={<Search theme='outline' size={14} />}
                placeholder={t('cron.overview.filters.searchPlaceholder')}
                onChange={setSearchQuery}
              />
              <Select
                value={statusFilter}
                options={statusOptions}
                className='md:max-w-220px'
                onChange={(value) => setStatusFilter(value as GlobalCronJobStatus | 'all')}
              />
            </div>
          </div>

          <div className='rounded-16px border border-border-2 bg-bg-1 p-16px md:p-20px'>
            <div className='mb-16px flex items-center gap-8px'>
              <AlarmClock theme='outline' size={18} />
              <Typography.Text className='text-14px font-medium'>
                {t('cron.taskCount', { count: filteredJobs.length })}
              </Typography.Text>
            </div>

            <Spin loading={loading} className='w-full'>
              {filteredJobs.length === 0 ? (
                <Empty
                  description={jobs.length > 0 ? t('cron.overview.emptyFiltered') : t('cron.overview.emptyInitial')}
                  className='py-24px'
                />
              ) : (
                <div className='flex flex-col gap-12px'>
                  {filteredJobs.map((job) => {
                    const status = getGlobalCronJobStatus(job);
                    return (
                      <div
                        key={job.id}
                        className='rounded-16px border border-border-2 p-16px transition-colors hover:bg-fill-1'
                      >
                        <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
                          <div className='min-w-0 flex-1'>
                            <div className='flex flex-wrap items-center gap-8px'>
                              <Typography.Text className='text-15px font-semibold text-t-primary'>
                                {job.name}
                              </Typography.Text>
                              <Tag color={statusColorMap[status]}>{t(`cron.status.${status}`)}</Tag>
                              <Tag>{job.metadata.agentType}</Tag>
                            </div>

                            <div className='mt-8px flex flex-col gap-6px text-13px text-t-secondary'>
                              <div className='flex flex-wrap items-center gap-6px'>
                                <span className='font-medium text-t-primary'>
                                  {job.metadata.conversationTitle || job.metadata.conversationId}
                                </span>
                                <span className='text-t-tertiary'>#{job.metadata.conversationId}</span>
                              </div>
                              <div>
                                {t('cron.schedule')}: {job.schedule.description}
                              </div>
                              <div>
                                {t('cron.nextRun')}: {formatNextRun(job.state.nextRunAtMs)}
                              </div>
                              <div>
                                {t('cron.lastRun')}: {formatNextRun(job.state.lastRunAtMs)}
                              </div>
                              <div className='break-words'>
                                {t('cron.message')}: {job.target.payload.text}
                              </div>
                              {job.state.lastError && (
                                <div className='break-words text-[var(--color-danger-light-4)]'>
                                  {t('cron.lastError')}: {job.state.lastError}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className='flex shrink-0 flex-wrap items-center gap-8px'>
                            <Button
                              type='outline'
                              icon={<ArrowRight size={14} />}
                              onClick={() => void navigate(`/conversation/${job.metadata.conversationId}`)}
                            >
                              {t('cron.actions.goTo')}
                            </Button>
                            <Button type='outline' icon={<Edit size={14} />} onClick={() => setSelectedJobId(job.id)}>
                              {t('common.edit')}
                            </Button>
                            <Button
                              type='outline'
                              icon={job.enabled ? <Pause size={14} /> : <Play size={14} />}
                              onClick={() => void handleToggleJob(job)}
                            >
                              {job.enabled ? t('cron.actions.pause') : t('cron.actions.resume')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Spin>
          </div>
        </div>
      </SettingsPageWrapper>

      {selectedJob && (
        <CronJobDrawer
          visible
          job={selectedJob}
          onClose={() => setSelectedJobId(null)}
          onSave={(updates) => handleSaveJob(selectedJob, updates)}
          onDelete={() => handleDeleteJob(selectedJob)}
        />
      )}
    </>
  );
};

export default GlobalCronSettings;
