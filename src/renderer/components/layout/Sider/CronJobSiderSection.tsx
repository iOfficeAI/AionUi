/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Down, Right } from '@icon-park/react';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import CronJobSiderItem from './CronJobSiderItem';

interface CronJobSiderSectionProps {
  jobs: ICronJob[];
  pathname: string;
  onNavigate: (path: string) => void;
}

const CronJobSiderSection: React.FC<CronJobSiderSectionProps> = ({ jobs, pathname, onNavigate }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (jobs.length === 0) return null;

  return (
    <div className='mt-2px'>
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
        jobs.map((job) => <CronJobSiderItem key={job.id} job={job} pathname={pathname} onNavigate={onNavigate} />)}
    </div>
  );
};

export default CronJobSiderSection;
