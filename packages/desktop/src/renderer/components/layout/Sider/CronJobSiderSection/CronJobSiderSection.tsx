/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Right } from '@icon-park/react';
import classNames from 'classnames';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import CronJobSiderItem from './CronJobSiderItem';

interface CronJobSiderSectionProps {
  jobs: ICronJob[];
  pathname: string;
  onNavigate: (path: string) => void;
}

const CronJobSiderSection: React.FC<CronJobSiderSectionProps> = ({ jobs, pathname, onNavigate }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<boolean>(() => localStorage.getItem('cron-section-expanded') === 'true');
  useEffect(() => {
    localStorage.setItem('cron-section-expanded', String(expanded));
  }, [expanded]);

  // Batch-fetch conversations for all "existing" mode jobs to avoid N+1 IPC calls
  const existingModeConvIds = useMemo(
    () =>
      jobs
        .filter((j) => j.target.execution_mode !== 'new_conversation' && j.metadata.conversation_id)
        .map((j) => j.metadata.conversation_id),
    [jobs]
  );

  const [existingConversations, setExistingConversations] = useState<Map<string, TChatConversation>>(new Map());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch conversations when conv IDs change or when refresh event is triggered
  useEffect(() => {
    if (existingModeConvIds.length === 0) {
      setExistingConversations(new Map());
      return;
    }
    // Fetch all conversations in parallel
    Promise.all(existingModeConvIds.map((id) => ipcBridge.conversation.get.invoke({ id }))).then((results) => {
      const map = new Map<string, TChatConversation>();
      for (const conv of results) {
        if (conv) map.set(conv.id, conv);
      }
      setExistingConversations(map);
    });
  }, [existingModeConvIds, refreshTrigger]);

  // Listen to chat.history.refresh to re-fetch existing mode conversations
  useEffect(() => {
    const handleRefresh = () => {
      setRefreshTrigger((prev) => prev + 1);
    };
    emitter.on('chat.history.refresh', handleRefresh);
    return () => {
      emitter.off('chat.history.refresh', handleRefresh);
    };
  }, []);

  if (jobs.length === 0) return null;

  return (
    <div className='min-w-0'>
      <div
        className='group/label sider-section-label flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-16px cursor-pointer'
        onClick={() => setExpanded((v) => !v)}
      >
        <span className='text-14px text-t-tertiary group-hover/label:text-t-primary transition-colors font-[500] leading-none'>{t('cron.scheduledTasks')}</span>
        <span className='ml-2px flex items-center justify-center opacity-0 group-hover/label:opacity-100 transition-opacity text-t-tertiary'>
          <Right
            theme='outline'
            size={12}
            className={classNames('transition-transform duration-150', { 'rotate-90': expanded })}
          />
        </span>
      </div>
      {expanded &&
        jobs.map((job) => (
          <CronJobSiderItem
            key={job.id}
            job={job}
            pathname={pathname}
            onNavigate={onNavigate}
            existingConversation={existingConversations.get(job.metadata.conversation_id)}
          />
        ))}
    </div>
  );
};

export default CronJobSiderSection;
