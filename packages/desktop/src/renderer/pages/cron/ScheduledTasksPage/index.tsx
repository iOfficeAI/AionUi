/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Empty, Message, Spin, Switch, Tooltip } from '@arco-design/web-react';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { useAllCronJobs } from '@renderer/pages/cron/useCronJobs';
import { formatSchedule, formatNextRun } from '@renderer/pages/cron/cronUtils';
import { systemSettings, type ICronJob } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import { useConversationAssistants } from '@renderer/pages/conversation/hooks/useConversationAssistants';
import CronStatusTag from './CronStatusTag';
import CreateTaskDialog from './CreateTaskDialog';
import { getJobAgentMeta } from './jobAgentMeta';
import { useAgentLogos } from '@renderer/utils/model/agentLogo';
import TalkToButlerButton from '@/renderer/components/base/TalkToButlerButton';
import { AionSearchInput } from '@/renderer/components/base';
import SettingsPageHeader from '@/renderer/pages/settings/components/SettingsPageHeader';
import { Attention, Robot } from '@icon-park/react';

const ScheduledTasksPage: React.FC = () => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { jobs, loading, pauseJob, resumeJob } = useAllCronJobs();
  const { presetAssistants } = useConversationAssistants();
  const logos = useAgentLogos();
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setKeepAwake(configService.get('system.keepAwake') ?? false);
  }, []);

  const handleKeepAwakeChange = useCallback(async (enabled: boolean) => {
    setKeepAwake(enabled);
    configService.setLocal('system.keepAwake', enabled);
    try {
      await systemSettings.setKeepAwake.invoke({ enabled });
    } catch (err) {
      setKeepAwake(!enabled);
      configService.setLocal('system.keepAwake', !enabled);
      Message.error(String(err));
    }
  }, []);

  const handleGoToDetail = useCallback(
    (job: ICronJob) => {
      navigate(`/scheduled/${job.id}`);
    },
    [navigate]
  );

  // "Create via chat": jump to the home page with the default cron prompt
  // pre-filled. The assistant selection is left to the home page's existing
  // logic (it restores the user's last-used assistant).
  const handleCreateViaChat = useCallback(() => {
    navigate('/guid', { state: { prefillPrompt: t('cron.status.defaultPrompt') } });
  }, [navigate, t]);

  const handleCreateManually = useCallback(() => {
    setCreateDialogVisible(true);
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredJobs = useMemo(() => {
    if (!normalizedSearchQuery) return jobs;
    return jobs.filter((job) => {
      const agentMeta = getJobAgentMeta(job, presetAssistants, logos);
      const executionModeLabel =
        job.target.execution_mode === 'new_conversation'
          ? t('cron.page.form.newConversation')
          : t('cron.page.form.existingConversation');
      const searchableText = [
        job.name,
        job.description,
        job.target.payload.text,
        job.metadata.conversation_title,
        job.metadata.agent_type,
        job.metadata.agent_config?.name,
        job.metadata.agent_config?.workspace,
        agentMeta.name,
        executionModeLabel,
        formatSchedule(job, t),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchableText.includes(normalizedSearchQuery);
    });
  }, [jobs, logos, normalizedSearchQuery, presetAssistants, t]);

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

  return (
    <div className='w-full h-full min-h-0 box-border bg-1 flex flex-col overflow-hidden'>
      <div
        className={classNames(
          'shrink-0 bg-1',
          isMobile ? 'px-16px pt-14px pb-14px' : 'px-12px pt-14px pb-14px md:px-40px md:pt-32px md:pb-16px'
        )}
      >
        <div className='mx-auto w-full max-w-800px box-border'>
          <SettingsPageHeader
            sticky={false}
            data-testid='scheduled-tasks-header'
            title={t('cron.scheduledTasks')}
            description={t('cron.page.description')}
            actions={
              <>
                {!isMobile && (
                  <AionSearchInput
                    className='shrink-0 w-[200px] hidden md:flex'
                    data-testid='input-search-scheduled-tasks'
                    placeholder={t('cron.page.searchPlaceholder', { defaultValue: 'Search tasks...' })}
                    value={searchQuery}
                    onChange={setSearchQuery}
                  />
                )}
                <TalkToButlerButton
                  label={t('cron.page.newTask')}
                  onChat={handleCreateViaChat}
                  chatLabel={t('cron.page.createViaChat')}
                  onManual={handleCreateManually}
                  manualLabel={t('cron.page.createManually')}
                />
              </>
            }
          />
        </div>
      </div>

      <div
        className={classNames(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          isMobile ? 'px-16px pb-14px' : 'px-12px pb-24px md:px-40px md:pb-32px'
        )}
      >
        <div
          className={classNames(
            'mx-auto flex w-full max-w-800px box-border flex-col',
            isMobile ? 'gap-14px' : 'gap-16px'
          )}
        >
          <div className='grid w-full box-border grid-cols-[minmax(0,1fr)_auto] items-center gap-x-12px gap-y-10px rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-14px py-12px sm:rounded-14px sm:px-16px max-[520px]:grid-cols-1'>
            <span
              className={classNames(
                'min-w-0 text-t-primary',
                isMobile ? 'text-12px leading-18px' : 'text-13px leading-20px'
              )}
            >
              {t('cron.page.awakeBanner')}
            </span>
            <div className='justify-self-end max-[520px]:justify-self-start'>
              <Tooltip content={t('cron.page.keepAwakeTooltip')}>
                <div className='flex items-center gap-8px text-t-secondary text-12px leading-18px sm:text-13px'>
                  <span>{t('cron.page.keepAwake')}</span>
                  <Switch size='small' checked={keepAwake} onChange={handleKeepAwakeChange} />
                </div>
              </Tooltip>
            </div>
          </div>

          {loading ? (
            <div className='flex min-h-220px items-center justify-center rounded-16px border border-dashed border-border-2 bg-fill-1'>
              <Spin />
            </div>
          ) : jobs.length === 0 ? (
            <div className='flex min-h-220px items-center justify-center rounded-16px border border-dashed border-border-2 bg-fill-1'>
              <Empty description={t('cron.noTasks')} />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className='flex min-h-220px items-center justify-center rounded-16px border border-dashed border-border-2 bg-fill-1'>
              <Empty description={t('cron.page.noSearchResults', { defaultValue: 'No matching scheduled tasks.' })} />
            </div>
          ) : (
            <div className='w-full'>
              {filteredJobs.map((job, index) => {
                const agentMeta = getJobAgentMeta(job, presetAssistants, logos);
                const isManualOnly = job.schedule.kind === 'cron' && !job.schedule.expr;
                const hasError = job.state.last_status === 'error' || job.state.last_status === 'missed';
                const executionModeLabel =
                  job.target.execution_mode === 'new_conversation'
                    ? t('cron.page.form.newConversation')
                    : t('cron.page.form.existingConversation');
                const nextRun = job.state.next_run_at_ms ? formatNextRun(job.state.next_run_at_ms, i18n.language) : '-';
                const errorHint = job.state.last_error
                  ? t('cron.lastErrorWithDetail', { error: job.state.last_error })
                  : t('cron.status.error');

                return (
                  <div
                    key={job.id}
                    className={classNames(
                      'group flex cursor-pointer items-center justify-between gap-12px rounded-12px border border-solid border-transparent bg-transparent px-12px py-6px transition-colors duration-180 hover:bg-fill-2',
                      isMobile ? '' : 'min-h-48px'
                    )}
                    style={{ marginBottom: index === filteredJobs.length - 1 ? 0 : 12 }}
                    onClick={() => handleGoToDetail(job)}
                  >
                    <div className='flex min-w-0 flex-1 items-center gap-8px'>
                      <Tooltip content={agentMeta.name}>
                        <div className='flex h-24px w-24px shrink-0 items-center justify-center overflow-hidden rounded-50% bg-fill-2 text-11px text-t-secondary'>
                          {agentMeta.logo ? (
                            <img src={agentMeta.logo} alt={agentMeta.name} className='h-full w-full object-cover' />
                          ) : agentMeta.emoji ? (
                            agentMeta.emoji
                          ) : (
                            <Robot size='16' className='shrink-0 text-t-secondary' />
                          )}
                        </div>
                      </Tooltip>
                      <div className='min-w-0 flex-1'>
                        <div className='flex min-w-0 items-center gap-8px'>
                          <span className='min-w-0 truncate text-14px leading-19px font-medium text-t-primary'>
                            {job.name}
                          </span>
                          <span className='shrink-0 rounded-4px bg-fill-2 px-5px py-1px text-11px leading-15px text-t-secondary'>
                            {executionModeLabel}
                          </span>
                        </div>
                        <div
                          className='mt-1px min-w-0 truncate text-12px leading-16px text-t-secondary'
                          title={`${formatSchedule(job, t)} · ${t('cron.nextRun')}：${nextRun}`}
                        >
                          {formatSchedule(job, t)}
                          <span className='mx-6px text-t-secondary opacity-60'>·</span>
                          {t('cron.nextRun')}：{nextRun}
                        </div>
                      </div>
                    </div>

                    <div className='flex shrink-0 items-center gap-6px' onClick={(event) => event.stopPropagation()}>
                      {!isManualOnly && <CronStatusTag job={job} />}
                      {hasError && (
                        <Tooltip content={errorHint}>
                          <Attention
                            theme='outline'
                            size={16}
                            className='shrink-0 text-danger-6'
                            aria-label={errorHint}
                          />
                        </Tooltip>
                      )}
                      {!isManualOnly && (
                        <Switch size='small' checked={job.enabled} onChange={() => handleToggleEnabled(job)} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CreateTaskDialog visible={createDialogVisible} onClose={() => setCreateDialogVisible(false)} />
    </div>
  );
};

export default ScheduledTasksPage;
