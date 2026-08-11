/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageCronTrigger } from '@/common/chat/chatLib';
import { iconColors } from '@/renderer/styles/colors';
import { AlarmClock, Right } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const MessageCronTrigger: React.FC<{ message: IMessageCronTrigger }> = ({ message }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cronJobId, cronJobName } = message.content;

  return (
    <div className='max-w-780px w-full mx-auto cursor-pointer' onClick={() => navigate(`/scheduled/${cronJobId}`)}>
      <div
        className='flex items-center gap-8px px-16px py-12px rd-12px b-1 b-solid bg-fill-0 hover:bg-fill-1 transition-colors'
        style={{ borderColor: 'color-mix(in srgb, var(--color-border-2) 70%, transparent)' }}
      >
        <AlarmClock
          theme='outline'
          size={18}
          fill={iconColors.secondary}
          className='block leading-none shrink-0'
          style={{ lineHeight: 0 }}
        />
        <span className='flex-1 text-14px truncate text-t-primary'>
          {t('cron.trigger.runScheduledTask', { name: cronJobName })}
        </span>
        <Right
          theme='outline'
          size={16}
          fill={iconColors.secondary}
          className='block leading-none shrink-0'
          style={{ lineHeight: 0 }}
        />
      </div>
    </div>
  );
};

export default MessageCronTrigger;
