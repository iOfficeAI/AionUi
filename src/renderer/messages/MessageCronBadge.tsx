/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronMessageMeta } from '@/common/chatLib';
import { iconColors } from '@/renderer/theme/colors';
import { AlarmClock } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type MessageCronBadgeProps = {
  meta: CronMessageMeta;
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const MessageCronBadge: React.FC<MessageCronBadgeProps> = ({ meta }) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center gap-4px mb-4px text-12px' style={{ color: 'var(--color-bg-6)' }}>
      <AlarmClock theme='outline' size={13} fill={iconColors.secondary} className='flex items-center' />
      <span>{meta.cronJobName || t('cron.message.badge')}</span>
      <span>{formatTime(meta.triggeredAt)}</span>
    </div>
  );
};

export default MessageCronBadge;
