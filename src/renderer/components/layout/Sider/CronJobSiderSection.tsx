/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Down, Right } from '@icon-park/react';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import CronJobSiderItem from './CronJobSiderItem';

interface CronJobSiderSectionProps {
  jobs: ICronJob[];
  pathname: string;
  onNavigate: (path: string) => void;
}

const CronJobSiderSection: React.FC<CronJobSiderSectionProps> = ({ jobs, pathname, onNavigate }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  // Batch-fetch conversations for all "existing" mode jobs to avoid N+1 IPC calls
  const existingModeConvIds = useMemo(
    () =>
      jobs
        .filter((j) => j.target.executionMode !== 'new_conversation' && j.metadata.conversationId)
        .map((j) => j.metadata.conversationId),
    [jobs]
  );

  const [existingConversations, setExistingConversations] = useState<Map<string, TChatConversation>>(new Map());

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
  }, [existingModeConvIds]);

  if (jobs.length === 0) return null;

  return (
    <div className='mb-8px min-w-0'>
      <div
        className='group flex items-center px-12px py-6px cursor-pointer select-none sticky top-0 z-10 bg-fill-2'
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className='text-12px text-t-secondary font-medium'>{t('cron.scheduledTasks')}</span>
        <span className='ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-t-secondary flex items-center'>
          {expanded ? <Down theme='outline' size={12} /> : <Right theme='outline' size={12} />}
        </span>
      </div>
      {expanded &&
        jobs.map((job) => (
          <CronJobSiderItem
            key={job.id}
            job={job}
            pathname={pathname}
            onNavigate={onNavigate}
            existingConversation={existingConversations.get(job.metadata.conversationId)}
          />
        ))}
    </div>
  );
};

export default CronJobSiderSection;
