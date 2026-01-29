/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/ipcBridge';
import { iconColors } from '@/renderer/theme/colors';
import { Button, Message, Popconfirm } from '@arco-design/web-react';
import { AlarmClock, Attention, DeleteOne, Lightning, LinkOne, PauseOne, PlayOne } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSchedule, formatNextRun, getJobStatusFlags } from '../utils/cronUtils';

/**
 * Get status icon for a cron job
 */
export const CronJobStatusIcon: React.FC<{ job: ICronJob; size?: number }> = ({ job, size = 14 }) => {
  const { hasError, isPaused } = getJobStatusFlags(job);

  if (hasError) {
    return <Attention theme='outline' size={size} fill={iconColors.warning} />;
  }
  if (isPaused) {
    return <PauseOne theme='outline' size={size} fill={iconColors.secondary} />;
  }
  return <AlarmClock theme='outline' size={size} fill={iconColors.primary} />;
};

export interface CronJobActions {
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onDelete: () => Promise<void>;
  onRunNow: () => Promise<void>;
}

interface CronJobItemProps extends CronJobActions {
  job: ICronJob;
  onNavigate?: () => void;
  showConversationTitle?: boolean;
  showMessage?: boolean;
  showGoToButton?: boolean;
  variant?: 'compact' | 'full';
}

/**
 * Reusable cron job item component
 */
const CronJobItem: React.FC<CronJobItemProps> = ({ job, onPause, onResume, onDelete, onRunNow, onNavigate, showConversationTitle = false, showMessage = false, showGoToButton = false, variant = 'compact' }) => {
  const { t } = useTranslation();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { hasError, isPaused } = getJobStatusFlags(job);

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action);
    try {
      await fn();
      if (action === 'pause') Message.success(t('cron.pauseSuccess'));
      else if (action === 'resume') Message.success(t('cron.resumeSuccess'));
      else if (action === 'runNow') Message.success(t('cron.runNowSuccess'));
    } catch (err) {
      Message.error(String(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    setActionLoading('delete');
    try {
      await onDelete();
      Message.success(t('cron.deleteSuccess'));
    } catch (err) {
      Message.error(String(err));
    } finally {
      setActionLoading(null);
    }
  };

  const isCompact = variant === 'compact';
  const buttonSize = isCompact ? 'mini' : 'small';
  const buttonType = isCompact ? 'text' : 'secondary';

  return (
    <div className={isCompact ? 'cron-job-item py-8px border-b border-[var(--color-border-2)] last:border-b-0' : 'cron-job-item'}>
      {/* Job name and status */}
      <div className='flex items-center gap-8px mb-4px'>
        <CronJobStatusIcon job={job} size={isCompact ? 14 : 16} />
        {onNavigate ? (
          <span className='font-medium text-14px truncate max-w-[200px] cursor-pointer hover:text-[var(--color-primary-6)]' onClick={onNavigate} title={t('cron.goToConversation')}>
            {job.name}
          </span>
        ) : (
          <span className='font-medium text-14px truncate flex-1'>{job.name}</span>
        )}
      </div>

      {/* Conversation title (optional) */}
      {showConversationTitle && job.metadata.conversationTitle && (
        <div className='text-12px text-t-secondary mb-4px pl-22px truncate max-w-[250px]' title={job.metadata.conversationTitle}>
          📍 {job.metadata.conversationTitle}
        </div>
      )}

      {/* Schedule and next run */}
      <div className={`text-12px text-t-secondary mb-8px ${isCompact ? 'pl-22px' : ''}`}>
        <div className='mb-2px'>
          {t('cron.schedule')}: {formatSchedule(job)}
        </div>
        <div>
          {t('cron.nextRun')}: {formatNextRun(job.state.nextRunAtMs)}
        </div>
        {hasError && job.state.lastError && (
          <div className='text-[var(--color-danger-6)] mt-4px'>
            {t('cron.lastError')}: {job.state.lastError}
          </div>
        )}
      </div>

      {/* Message content (optional) */}
      {showMessage && (
        <div className='text-12px mb-12px'>
          <div className='text-t-secondary mb-2px'>{t('cron.message')}:</div>
          <div className='bg-[var(--color-fill-2)] rounded-4px p-6px max-h-60px overflow-auto whitespace-pre-wrap break-all text-t-primary'>{job.target.payload.text}</div>
        </div>
      )}

      {/* Actions */}
      <div className={`flex items-center gap-${isCompact ? '4' : '8'}px ${isCompact ? 'pl-22px' : 'border-t border-[var(--color-border-2)] pt-8px'} flex-wrap`}>
        {showGoToButton && onNavigate && (
          <Button type='text' size={buttonSize} icon={<LinkOne theme='outline' size={14} />} onClick={onNavigate}>
            {t('cron.actions.goTo')}
          </Button>
        )}

        {isPaused ? (
          <Button type={isCompact ? 'text' : 'primary'} size={buttonSize} icon={<PlayOne theme='outline' size={14} />} loading={actionLoading === 'resume'} onClick={() => handleAction('resume', onResume)}>
            {t('cron.actions.resume')}
          </Button>
        ) : (
          <Button type={buttonType} size={buttonSize} icon={<PauseOne theme='outline' size={14} />} loading={actionLoading === 'pause'} onClick={() => handleAction('pause', onPause)}>
            {t('cron.actions.pause')}
          </Button>
        )}

        <Button type={buttonType} size={buttonSize} icon={<Lightning theme='outline' size={14} />} loading={actionLoading === 'runNow'} onClick={() => handleAction('runNow', onRunNow)}>
          {t('cron.actions.runNow')}
        </Button>

        <Popconfirm title={t('cron.confirmDelete')} onOk={handleDelete}>
          <Button type='text' size={buttonSize} status='danger' icon={<DeleteOne theme='outline' size={14} />} loading={actionLoading === 'delete'}>
            {isCompact && t('cron.actions.delete')}
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
};

export default CronJobItem;
