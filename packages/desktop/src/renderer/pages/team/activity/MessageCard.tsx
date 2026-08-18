/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Tag, Tooltip } from '@arco-design/web-react';
import { Announcement, Down, Mail, Paperclip, Up } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { ITeamMailboxMessage } from '@/common/types/team/teamTypes';
import { ACTIVITY_USER_IDENTITY, isBroadcastMessage, isSystemMessageType } from './activityTypes';
import { clampStyle, useIsClamped } from './useIsClamped';
import { formatActivityTime } from './activityTime';

/** Resolves a member/identity display name and color for a slot id. */
export type ActivityIdentityResolver = {
  nameOf: (slotId: string | undefined) => string;
  colorOf: (slotId: string | undefined) => string;
};

type Props = {
  message: ITeamMailboxMessage;
  identity: ActivityIdentityResolver;
};

const MemberChip: React.FC<{ name: string; color: string }> = ({ name, color }) => (
  <span className='inline-flex items-center gap-4px min-w-0'>
    <span className='inline-block w-8px h-8px rounded-full shrink-0' style={{ backgroundColor: color }} />
    <span className='truncate text-12px text-[color:var(--color-text-1)]'>{name}</span>
  </span>
);

const MessageCard: React.FC<Props> = ({ message, identity }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const broadcast = isBroadcastMessage(message);
  const fromName =
    message.from_agent_id === ACTIVITY_USER_IDENTITY
      ? t('team.activity.userIdentity', { defaultValue: 'User / external' })
      : identity.nameOf(message.from_agent_id);
  const toName = broadcast
    ? t('team.activity.broadcast', { defaultValue: 'Broadcast to all' })
    : message.to_agent_id === ACTIVITY_USER_IDENTITY
      ? t('team.activity.userIdentity', { defaultValue: 'User / external' })
      : identity.nameOf(message.to_agent_id);

  const body = message.summary && message.summary.length > 0 ? message.summary : message.content;
  const attachments = message.files?.length ?? 0;
  const isClamped = useIsClamped(bodyRef, [body, expanded]);
  const time = formatActivityTime(message.created_at);

  return (
    <div
      className='rounded-8px border border-solid border-[color:var(--border-base)] bg-1 p-8px flex flex-col gap-6px'
      data-testid='activity-message-card'
      data-message-id={message.id}
    >
      <div className='flex items-center gap-6px text-12px text-[color:var(--color-text-2)]'>
        <Mail theme='outline' size='13' fill='currentColor' />
        <MemberChip name={fromName} color={identity.colorOf(message.from_agent_id)} />
        <span className='text-[color:var(--color-text-3)]'>→</span>
        {broadcast ? (
          <Tag size='small' color='arcoblue' icon={<Announcement theme='outline' size='11' fill='currentColor' />}>
            {toName}
          </Tag>
        ) : (
          <MemberChip name={toName} color={identity.colorOf(message.to_agent_id)} />
        )}
        <span className='ms-auto flex items-center gap-6px'>
          {isSystemMessageType(message.msg_type) && (
            <Tag size='small' color='gray'>
              {t(`team.activity.msgType.${message.msg_type}`, { defaultValue: message.msg_type })}
            </Tag>
          )}
          <Tag size='small' color={message.read ? 'green' : 'orange'}>
            {message.read
              ? t('team.activity.read', { defaultValue: 'Read' })
              : t('team.activity.unread', { defaultValue: 'Unread' })}
          </Tag>
        </span>
      </div>

      <div
        ref={bodyRef}
        className='text-13px text-[color:var(--color-text-1)] whitespace-pre-wrap break-words'
        style={expanded ? undefined : clampStyle(3)}
      >
        {body}
      </div>

      <div className='flex items-center gap-8px text-11px text-[color:var(--color-text-3)]'>
        {attachments > 0 && (
          <span className='inline-flex items-center gap-2px'>
            <Paperclip theme='outline' size='11' fill='currentColor' />
            {t('team.activity.attachments', { count: attachments, defaultValue: '{{count}} files' })}
          </span>
        )}
        {(isClamped || expanded) && (
          <Tooltip
            content={
              expanded
                ? t('team.activity.collapse', { defaultValue: 'Collapse' })
                : t('team.activity.expand', { defaultValue: 'Expand' })
            }
          >
            <span
              className='inline-flex items-center gap-2px cursor-pointer text-[color:var(--brand)]'
              role='button'
              tabIndex={0}
              data-testid='activity-message-expand'
              onClick={() => setExpanded((v) => !v)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpanded((v) => !v)}
            >
              {expanded ? (
                <Up theme='outline' size='11' fill='currentColor' />
              ) : (
                <Down theme='outline' size='11' fill='currentColor' />
              )}
              {expanded
                ? t('team.activity.collapse', { defaultValue: 'Collapse' })
                : t('team.activity.expand', { defaultValue: 'Expand' })}
            </span>
          </Tooltip>
        )}
        <span className='ms-auto shrink-0' title={time.full}>
          {time.label}
        </span>
      </div>
    </div>
  );
};

export default MessageCard;
