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

const formatTime = (timestamp: number, locale: string): string => {
  return new Date(timestamp).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const MessageCronBadge: React.FC<MessageCronBadgeProps> = ({ meta }) => {
  const { i18n } = useTranslation();

  return (
    <div className='inline-flex items-center gap-4px mb-4px px-12px py-2px rounded-full text-12px bg-fill-2' style={{ color: 'var(--color-bg-6)' }}>
      <AlarmClock strokeWidth={4} theme='outline' size={13} fill={iconColors.secondary} className='flex items-center' />
      <span>{formatTime(meta.triggeredAt, i18n.language)}</span>
    </div>
  );
};

export default MessageCronBadge;
