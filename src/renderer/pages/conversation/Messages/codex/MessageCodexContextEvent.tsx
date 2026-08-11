/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageCodexContextEvent } from '@/common/chat/chatLib';
import { Badge, Tag } from '@arco-design/web-react';
import type { BadgeProps } from '@arco-design/web-react';
import { CheckOne, CloseOne, Refresh } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const MessageCodexContextEvent: React.FC<{ message: IMessageCodexContextEvent }> = ({ message }) => {
  const { t } = useTranslation();
  const { event, status, threadId } = message.content;
  const badgeStatus: BadgeProps['status'] =
    status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'processing';

  const icon =
    status === 'completed' ? (
      <CheckOne theme='filled' size='15' fill='rgb(var(--success-6))' />
    ) : status === 'failed' ? (
      <CloseOne theme='filled' size='15' fill='rgb(var(--danger-6))' />
    ) : (
      <Refresh theme='outline' size='15' fill='rgb(var(--primary-6))' />
    );

  return (
    <div className='w-full flex justify-center'>
      <div className='max-w-full flex items-center gap-8px px-12px py-7px rd-8px bg-2 border border-solid border-b-base text-12px text-t-secondary'>
        <span className='flex items-center'>{icon}</span>
        <Badge status={badgeStatus} text={t(`codex.contextEvent.${event}`)} />
        {threadId ? (
          <Tag size='small' color='gray' className='max-w-220px overflow-hidden text-ellipsis'>
            {threadId}
          </Tag>
        ) : null}
      </div>
    </div>
  );
};

export default MessageCodexContextEvent;
