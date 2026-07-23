/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantListItem } from '../types';
import AssistantAvatar from '../AssistantAvatar';
import RuntimeBadge from './RuntimeBadge';
import { Button, Dropdown, Menu, Switch, Tooltip } from '@arco-design/web-react';
import { Attention, MoreOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type MyAssistantCardProps = {
  assistant: AssistantListItem;
  localeKey: string;
  onOpenDetail: (assistant: AssistantListItem) => void;
  onDelete: (assistant: AssistantListItem) => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  onStartChat: (assistant: AssistantListItem) => void;
};

/**
 * A single card in the "My Assistants" grid (bare CLI or user-created).
 * Mirrors the official-assistant card layout. Clicking the card (outside the
 * interactive controls) opens the detail/editor. Ordering lives on the
 * "Enabled" tab, so this card intentionally has no drag handle.
 */
const MyAssistantCard: React.FC<MyAssistantCardProps> = ({
  assistant,
  localeKey,
  onOpenDetail,
  onDelete,
  onToggleEnabled,
  onStartChat,
}) => {
  const { t } = useTranslation();
  const enabled = assistant.enabled !== false;
  const canDelete = assistant.source === 'user';

  const actionMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'edit') onOpenDetail(assistant);
        if (key === 'delete') onDelete(assistant);
      }}
    >
      <Menu.Item key='edit'>
        <span data-testid={`menu-edit-${assistant.id}`}>{t('common.settings', { defaultValue: 'Settings' })}</span>
      </Menu.Item>
      {canDelete ? (
        <Menu.Item key='delete'>
          <span data-testid={`menu-delete-${assistant.id}`} className='text-[rgb(var(--danger-6))]'>
            {t('common.delete', { defaultValue: 'Delete' })}
          </span>
        </Menu.Item>
      ) : null}
    </Menu>
  );

  return (
    <div
      data-testid={`assistant-card-${assistant.id}`}
      className='group flex cursor-pointer flex-col rounded-14px border border-solid border-transparent bg-base p-16px transition-all duration-180 hover:border-border-2'
      onClick={() => onOpenDetail(assistant)}
    >
      {/* Header row: avatar on the left, enable switch on the right. */}
      <div className='flex items-start justify-between'>
        <span className={enabled ? '' : 'opacity-55'}>
          <AssistantAvatar assistant={assistant} size={42} />
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          <Switch
            size='small'
            data-testid={`switch-enabled-${assistant.id}`}
            checked={enabled}
            onChange={(checked) => onToggleEnabled(assistant, checked)}
          />
        </span>
      </div>
      <div className={`mt-12px flex min-w-0 items-center gap-8px ${enabled ? '' : 'opacity-70'}`}>
        <span className='truncate text-14px font-600 text-t-primary'>
          {assistant.name_i18n?.[localeKey] || assistant.name}
        </span>
        {assistant.agent_status !== 'online' && (
          <Tooltip
            content={
              assistant.agent_status === 'missing'
                ? t('settings.assistantAgentMissing', { defaultValue: 'The required agent is not installed.' })
                : assistant.agent_status === 'unchecked'
                  ? t('settings.assistantAgentUnchecked', {
                      defaultValue: 'The required agent has not been checked yet.',
                    })
                  : t('settings.assistantAgentUnavailable', {
                      defaultValue: 'The required agent is currently unavailable.',
                    })
            }
          >
            <span
              className='flex flex-shrink-0 items-center text-warning-6'
              data-testid={`assistant-agent-unavailable-${assistant.id}`}
            >
              <Attention size={15} fill='currentColor' />
            </span>
          </Tooltip>
        )}
      </div>
      <div className={`mt-6px line-clamp-2 text-12px leading-[1.5] text-t-secondary ${enabled ? '' : 'opacity-55'}`}>
        {assistant.description_i18n?.[localeKey] || assistant.description || ''}
      </div>
      {/* Footer: runtime on the left, actions on the right — balanced. */}
      <div className='mt-14px flex items-center justify-between gap-8px'>
        <span className={enabled ? '' : 'opacity-55'}>
          <RuntimeBadge assistant={assistant} />
        </span>
        <div className='flex items-center gap-8px' onClick={(e) => e.stopPropagation()}>
          {enabled ? (
            <Button
              type='text'
              size='small'
              data-testid={`btn-chat-${assistant.id}`}
              className='!inline-flex !h-28px !items-center !justify-center !rounded-9px !bg-fill-2 !px-12px !leading-none !text-t-secondary !opacity-0 transition-all hover:!bg-primary-6 hover:!text-white group-hover:!opacity-100'
              onClick={() => onStartChat(assistant)}
            >
              {t('settings.assistantGoChat', { defaultValue: 'Chat' })}
            </Button>
          ) : null}
          <Dropdown droplist={actionMenu} trigger='click' position='br' getPopupContainer={() => document.body}>
            <Button
              type='text'
              size='small'
              icon={<MoreOne theme='outline' size='16' fill='currentColor' />}
              aria-label={t('common.more', { defaultValue: 'More' })}
              className='!flex !h-32px !w-36px !items-center !justify-center !rounded-9px !p-0 !text-t-tertiary hover:!bg-fill-2 hover:!text-t-primary'
              data-testid={`btn-assistant-more-${assistant.id}`}
            />
          </Dropdown>
        </div>
      </div>
    </div>
  );
};

export default MyAssistantCard;
