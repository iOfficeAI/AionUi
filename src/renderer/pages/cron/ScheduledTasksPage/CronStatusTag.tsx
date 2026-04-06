/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { ICronJob } from '@/common/adapter/ipcBridge';

type StatusColor = 'gray' | 'red' | 'green';
type StatusTone = 'paused' | 'error' | 'active';

const CronStatusTag: React.FC<{ job: ICronJob }> = ({ job }) => {
  const { t } = useTranslation();

  let color: StatusColor = 'green';
  let label = t('cron.status.active');
  let tone: StatusTone = 'active';

  if (!job.enabled) {
    color = 'gray';
    tone = 'paused';
    label = t('cron.status.paused');
  } else if (job.state.lastStatus === 'error') {
    color = 'red';
    tone = 'error';
    label = t('cron.status.error');
  }

  return (
    <Tag
      size='small'
      bordered
      color={color}
      className={`!rounded-full !px-9px !py-2px !text-12px !leading-16px !font-medium !shadow-none ${
        tone === 'paused'
          ? '!bg-fill-1 !border-arco-3 !text-3'
          : tone === 'error'
            ? '!bg-danger-light-1 !border-danger-4 !text-danger-6'
            : '!bg-success-light-1 !border-success-4 !text-success-6'
      }`}
    >
      {label}
    </Tag>
  );
};

export default CronStatusTag;
