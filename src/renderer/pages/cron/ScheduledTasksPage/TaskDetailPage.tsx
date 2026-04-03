/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Message, Switch, Popconfirm, Spin, Empty } from '@arco-design/web-react';
import { Left, Delete, PlayOne, Write, Attention } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import CronStatusTag from './CronStatusTag';
import CreateTaskDialog from './CreateTaskDialog';
import { formatSchedule, formatNextRun } from '@renderer/pages/cron/cronUtils';
import { useCronJobConversations } from '@renderer/pages/cron/useCronJobs';
import { getActivityTime } from '@/renderer/utils/chat/timeline';

const getDescriptionPreview = (text: string) => {
  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return '-';
  if (firstLine.length <= 72) return firstLine;
  return `${firstLine.slice(0, 72).trimEnd()}...`;
};

const TaskDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<ICronJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const [runningNow, setRunningNow] = useState(false);

  const isNewConversationMode = job?.target.executionMode === 'new_conversation';
  const isManualOnly = job?.schedule.kind === 'cron' && !job.schedule.expr;
  const { conversations } = useCronJobConversations(jobId);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const found = await ipcBridge.cron.getJob.invoke({ jobId });
      setJob(found ?? null);
    } catch (err) {
      console.error('[TaskDetailPage] Failed to fetch job:', err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void fetchJob();
  }, [fetchJob]);

  // Auto-refresh when the job is updated or executed
  useEffect(() => {
    if (!jobId) return;
    const unsubUpdated = ipcBridge.cron.onJobUpdated.on((updated) => {
      if (updated.id === jobId) {
        setJob(updated);
      }
    });
    const unsubExecuted = ipcBridge.cron.onJobExecuted.on((data) => {
      if (data.jobId === jobId) {
        void fetchJob();
      }
    });
    return () => {
      unsubUpdated();
      unsubExecuted();
    };
  }, [jobId, fetchJob]);

  const handleToggleEnabled = useCallback(async () => {
    if (!job) return;
    try {
      await ipcBridge.cron.updateJob.invoke({ jobId: job.id, updates: { enabled: !job.enabled } });
      Message.success(job.enabled ? t('cron.pauseSuccess') : t('cron.resumeSuccess'));
      await fetchJob();
    } catch (err) {
      Message.error(String(err));
    }
  }, [job, fetchJob, t]);

  const handleRunNow = useCallback(async () => {
    if (!job) return;
    setRunningNow(true);
    try {
      const result = await ipcBridge.cron.runNow.invoke({ jobId: job.id });
      Message.success(t('cron.runNowSuccess'));
      if (result?.conversationId) {
        navigate(`/conversation/${result.conversationId}`);
      }
    } catch (err) {
      Message.error(String(err));
    } finally {
      setRunningNow(false);
    }
  }, [job, t, navigate]);

  const handleDelete = useCallback(async () => {
    if (!job) return;
    try {
      await ipcBridge.cron.removeJob.invoke({ jobId: job.id });
      Message.success(t('cron.deleteSuccess'));
      navigate('/scheduled');
    } catch (err) {
      Message.error(String(err));
    }
  }, [job, navigate, t]);

  if (loading) {
    return (
      <div className='size-full flex-center'>
        <Spin />
      </div>
    );
  }

  if (!job) {
    return (
      <div className='w-full min-h-full box-border overflow-y-auto px-14px pt-28px pb-24px md:px-40px md:pt-52px md:pb-42px'>
        <div className='mx-auto flex w-full max-w-760px flex-col gap-28px box-border'>
          <Button
            type='text'
            size='small'
            className='w-fit !px-0 !text-14px !text-text-3 md:!text-15px hover:!text-text-1'
            icon={<Left theme='outline' size={16} className='line-height-0 shrink-0' />}
            onClick={() => navigate('/scheduled')}
          >
            {t('cron.detail.backToAll')}
          </Button>
          <div className='flex min-h-320px items-center justify-center'>
            <Empty description={t('cron.detail.notFound')} />
          </div>
        </div>
      </div>
    );
  }

  const descriptionPreview = getDescriptionPreview(job.target.payload.text);
  const currentExecutionModeLabel = isNewConversationMode
    ? t('cron.page.form.newConversation')
    : t('cron.page.form.existingConversation');
  const executionModeExplanation = isNewConversationMode
    ? t('cron.detail.executionModeDescriptionNew')
    : t('cron.detail.executionModeDescriptionExisting');

  return (
    <div className='w-full min-h-full box-border overflow-y-auto px-14px pt-28px pb-24px md:px-40px md:pt-52px md:pb-42px'>
      <div className='mx-auto flex w-full max-w-760px flex-col gap-28px box-border'>
        <Button
          type='text'
          size='small'
          className='w-fit !px-0 !text-14px !text-text-3 md:!text-15px hover:!text-text-1'
          icon={<Left theme='outline' size={16} className='line-height-0 shrink-0' />}
          onClick={() => navigate('/scheduled')}
        >
          {t('cron.detail.backToAll')}
        </Button>

        <div className='flex flex-col gap-20px pb-8px'>
          <div className='flex flex-wrap items-start justify-between gap-14px'>
            <h1 className='m-0 min-w-0 flex-1 break-words text-30px font-bold leading-38px md:text-34px md:leading-42px'>
              {job.name}
            </h1>
            <div className='flex shrink-0 items-center gap-8px'>
              <Button
                size='mini'
                type='text'
                className='!h-20px !min-w-20px !w-20px !rounded-0 !border-none !bg-transparent !p-0 !text-text-3 hover:!bg-transparent hover:!text-text-2 translate-y-1px'
                icon={<Write theme='outline' size={16} fill='currentColor' />}
                onClick={() => setEditDialogVisible(true)}
              />
              <Popconfirm title={t('cron.confirmDeleteWithConversations')} onOk={handleDelete}>
                <Button
                  size='mini'
                  type='text'
                  className='!h-20px !min-w-20px !w-20px !rounded-0 !border-none !bg-transparent !p-0 !text-text-3 hover:!bg-transparent hover:!text-text-2 translate-y-1px'
                  icon={<Delete theme='outline' size={16} fill='currentColor' />}
                />
              </Popconfirm>
              <Button
                type='primary'
                shape='round'
                loading={runningNow}
                icon={<PlayOne theme='outline' size={14} />}
                onClick={handleRunNow}
              >
                {t('cron.detail.runNow')}
              </Button>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-10px md:gap-12px'>
            <CronStatusTag job={job} />
            {job.state.nextRunAtMs && (
              <span className='text-14px text-text-3'>
                {t('cron.nextRun')} {formatNextRun(job.state.nextRunAtMs)}
              </span>
            )}
          </div>
          <div className='h-1px w-full bg-[var(--color-border-2)]' />
        </div>

        <div className='grid w-full min-w-0 grid-cols-1 gap-28px md:grid-cols-[280px_minmax(0,1fr)] md:items-start md:gap-40px'>
          <div className='flex min-w-0 flex-col gap-28px'>
            <section className='flex flex-col gap-10px'>
              <h2 className='m-0 text-13px font-medium text-text-3'>{t('cron.detail.description')}</h2>
              <p className='m-0 text-14px leading-22px text-text-1'>{descriptionPreview}</p>
            </section>

            {job.metadata.agentConfig && (
              <section className='flex flex-col gap-10px'>
                <h2 className='m-0 text-13px font-medium text-text-3'>{t('cron.detail.agent')}</h2>
                <div className='flex items-center gap-10px'>
                  <img
                    src={getAgentLogo(job.metadata.agentConfig.backend)}
                    alt={job.metadata.agentConfig.name}
                    className='h-28px w-28px rounded-50%'
                  />
                  <span className='min-w-0 text-14px font-medium text-text-1'>{job.metadata.agentConfig.name}</span>
                </div>
              </section>
            )}

            <section className='flex flex-col gap-10px'>
              <h2 className='m-0 text-13px font-medium text-text-3'>{t('cron.detail.repeats')}</h2>
              <div className='flex flex-wrap items-center gap-10px'>
                {!isManualOnly && <Switch size='small' checked={job.enabled} onChange={handleToggleEnabled} />}
                <span className='text-14px text-text-1'>{formatSchedule(job, t)}</span>
              </div>
            </section>

            <section className='flex flex-col gap-10px'>
              <h2 className='m-0 text-13px font-medium text-text-3'>{t('cron.page.form.executionMode')}</h2>
              <div className='inline-flex items-center gap-4px'>
                <span className='text-14px leading-22px text-text-1'>{currentExecutionModeLabel}</span>
                <Attention theme='outline' size={12} className='line-height-0 shrink-0 text-text-3' />
              </div>
              <div className='box-border rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-16px py-14px'>
                <div className='flex flex-col gap-10px'>
                  <p className='m-0 text-13px leading-20px text-text-2'>{executionModeExplanation}</p>
                  <div className='h-1px w-full bg-[var(--color-border-2)]' />
                  <p className='m-0 text-12px leading-18px text-text-3'>{t('cron.page.form.executionModeEditHint')}</p>
                </div>
              </div>
            </section>
          </div>

          <div className='flex min-w-0 flex-col gap-28px'>
            <section className='flex flex-col gap-12px'>
              <h2 className='m-0 text-13px font-medium text-text-3'>{t('cron.detail.instructions')}</h2>
              <div className='box-border rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-16px py-14px'>
                <div className='whitespace-pre-wrap break-words text-14px leading-22px text-text-1'>
                  {job.target.payload.text || '-'}
                </div>
              </div>
            </section>

            <section className='flex flex-col gap-12px'>
              <h2 className='m-0 text-13px font-medium text-text-3'>{t('cron.detail.history')}</h2>

              {conversations.length > 0 ? (
                <div className='flex flex-col'>
                  <div className='h-1px w-full bg-[var(--color-border-2)]' />
                  {conversations.map((conv, index) => (
                    <React.Fragment key={conv.id}>
                      <div
                        className='flex cursor-pointer items-center justify-between gap-14px py-15px transition-colors hover:text-text-1'
                        onClick={() => navigate(`/conversation/${conv.id}`)}
                      >
                        <span className='min-w-0 flex-1 truncate text-14px text-text-1'>{conv.name || conv.id}</span>
                        <span className='shrink-0 text-13px text-text-3'>{formatNextRun(getActivityTime(conv))}</span>
                      </div>
                      {index < conversations.length - 1 && <div className='h-1px w-full bg-[var(--color-border-2)]' />}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className='text-14px text-text-3'>
                  <span>{t('cron.detail.noHistory')}</span>
                  {job.enabled && job.state.nextRunAtMs && (
                    <span className='ml-4px'>
                      · {t('cron.nextRun')} {formatNextRun(job.state.nextRunAtMs)}
                    </span>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <CreateTaskDialog
        visible={editDialogVisible}
        onClose={() => {
          setEditDialogVisible(false);
        }}
        editJob={job ?? undefined}
      />
    </div>
  );
};

export default TaskDetailPage;
