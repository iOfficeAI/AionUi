/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Message, Switch, Tag, Popconfirm, Spin, Empty } from '@arco-design/web-react';
import { Left, Delete, PlayOne, Editor } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import CreateTaskDialog from './CreateTaskDialog';
import { formatSchedule, formatNextRun } from '@renderer/pages/cron/cronUtils';
import { useCronJobConversations } from '@renderer/pages/cron/useCronJobs';
import { getActivityTime } from '@/renderer/utils/chat/timeline';

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
  const { conversations } = useCronJobConversations(isNewConversationMode ? jobId : undefined);

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
      <div className='size-full flex flex-col'>
        <div className='px-24px pt-16px'>
          <span
            className='inline-flex items-center gap-4px text-13px text-text-3 cursor-pointer hover:text-text-1'
            onClick={() => navigate('/scheduled')}
          >
            <Left theme='outline' size={14} />
            {t('cron.detail.backToAll')}
          </span>
        </div>
        <div className='flex-1 flex-center'>
          <Empty description={t('cron.detail.notFound')} />
        </div>
      </div>
    );
  }

  const statusTag = !job.enabled ? (
    <Tag color='gray'>{t('cron.status.paused')}</Tag>
  ) : job.state.lastStatus === 'error' ? (
    <Tag color='red'>{t('cron.status.error')}</Tag>
  ) : (
    <Tag color='green'>{t('cron.status.active')}</Tag>
  );

  return (
    <div className='size-full flex flex-col overflow-hidden'>
      {/* Back link */}
      <div className='shrink-0 px-24px pt-16px'>
        <span
          className='inline-flex items-center gap-4px text-13px text-text-3 cursor-pointer hover:text-text-1'
          onClick={() => navigate('/scheduled')}
        >
          <Left theme='outline' size={14} className='line-height-0 shrink-0' />
          {t('cron.detail.backToAll')}
        </span>
      </div>

      {/* Content */}
      <div className='flex-1 min-h-0 overflow-y-auto px-24px pt-12px pb-24px'>
        {/* Header row */}
        <div className='flex items-start justify-between mb-8px'>
          <div>
            <h1 className='text-24px font-bold m-0 mb-8px'>{job.name}</h1>
            <div className='flex items-center gap-12px'>
              {statusTag}
              {job.state.nextRunAtMs && (
                <span className='text-13px text-text-3'>
                  {t('cron.nextRun')} {formatNextRun(job.state.nextRunAtMs)}
                </span>
              )}
            </div>
          </div>
          <div className='flex items-center gap-8px'>
            <Button
              type='text'
              icon={<Editor theme='outline' size={16} />}
              onClick={() => setEditDialogVisible(true)}
            />
            <Popconfirm title={t('cron.confirmDeleteWithConversations')} onOk={handleDelete}>
              <Button type='text' status='danger' icon={<Delete theme='outline' size={16} />} />
            </Popconfirm>
            <Button
              type='primary'
              size='small'
              loading={runningNow}
              icon={<PlayOne theme='outline' size={14} />}
              onClick={handleRunNow}
            >
              {t('cron.detail.runNow')}
            </Button>
          </div>
        </div>

        {/* Agent */}
        {job.metadata.agentConfig && (
          <div className='mt-24px'>
            <h3 className='text-14px font-medium text-text-2 mb-8px'>{t('cron.detail.agent')}</h3>
            <div className='flex items-center gap-8px'>
              <img
                src={getAgentLogo(job.metadata.agentConfig.backend)}
                alt={job.metadata.agentConfig.name}
                className='w-24px h-24px rounded-50%'
              />
              <span className='text-14px text-text-1'>{job.metadata.agentConfig.name}</span>
            </div>
          </div>
        )}

        {/* Execution Mode */}
        <div className='mt-24px'>
          <h3 className='text-14px font-medium text-text-2 mb-8px'>{t('cron.page.form.executionMode')}</h3>
          <span className='text-14px text-text-1'>
            {isNewConversationMode ? t('cron.page.form.newConversation') : t('cron.page.form.existingConversation')}
          </span>
          <span className='text-12px text-text-3 ml-8px'>
            {isNewConversationMode
              ? t('cron.page.form.newConversationHint')
              : t('cron.page.form.existingConversationHint')}
          </span>
        </div>

        {/* Instructions */}
        <div className='mt-24px'>
          <h3 className='text-14px font-medium text-text-2 mb-8px'>{t('cron.detail.instructions')}</h3>
          <div className='bg-fill-1 rd-8px py-12px text-14px text-text-1 whitespace-pre-wrap'>
            {job.target.payload.text || '-'}
          </div>
        </div>

        {/* Repeats */}
        <div className='mt-24px'>
          <h3 className='text-14px font-medium text-text-2 mb-8px'>{t('cron.detail.repeats')}</h3>
          <div className='flex items-center gap-12px'>
            {isManualOnly ? (
              <span className='text-14px text-text-1'>{formatSchedule(job)}</span>
            ) : (
              <>
                <Switch size='small' checked={job.enabled} onChange={handleToggleEnabled} />
                <span className='text-14px text-text-1'>{formatSchedule(job)}</span>
              </>
            )}
          </div>
        </div>

        {/* Execution History */}
        <div className='mt-24px'>
          <h3 className='text-14px font-medium text-text-2 mb-8px'>
            {t('cron.detail.history')}
            {isNewConversationMode && conversations.length > 0 && (
              <span className='ml-4px font-normal text-text-3'>({conversations.length})</span>
            )}
          </h3>

          {isNewConversationMode ? (
            // new_conversation mode: show child conversations as execution history
            conversations.length > 0 ? (
              <div className='flex flex-col gap-4px'>
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className='flex items-center justify-between px-12px py-8px bg-fill-1 rd-8px cursor-pointer hover:bg-fill-2 transition-colors'
                    onClick={() => navigate(`/conversation/${conv.id}`)}
                  >
                    <span className='text-14px text-text-1 truncate mr-12px'>{conv.name || conv.id}</span>
                    <span className='text-13px text-text-3 shrink-0'>{formatNextRun(getActivityTime(conv))}</span>
                  </div>
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
            )
          ) : // existing mode: show last run info
          job.state.lastRunAtMs ? (
            <div className='text-14px text-text-3'>
              {formatNextRun(job.state.lastRunAtMs)}
              {job.state.lastStatus === 'error' && job.state.lastError && (
                <span className='ml-8px text-[rgb(var(--danger-6))]'>{job.state.lastError}</span>
              )}
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
