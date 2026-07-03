/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantListItem } from '../types';
import AssistantAvatar from '../AssistantAvatar';
import RuntimeBadge from './RuntimeBadge';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Dropdown, Menu, Switch, Tooltip } from '@arco-design/web-react';
import { Attention, Drag, MoreOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type MyAssistantRowProps = {
  assistant: AssistantListItem;
  localeKey: string;
  draggable: boolean;
  onOpenDetail: (assistant: AssistantListItem) => void;
  onDelete: (assistant: AssistantListItem) => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  onStartChat: (assistant: AssistantListItem) => void;
};

/**
 * A single row in the "My Assistants" list (bare CLI or user-created).
 * Clicking the row (outside the interactive controls) opens the detail/editor.
 */
const MyAssistantRow: React.FC<MyAssistantRowProps> = ({
  assistant,
  localeKey,
  draggable,
  onOpenDetail,
  onDelete,
  onToggleEnabled,
  onStartChat,
}) => {
  const { t } = useTranslation();
  const enabled = assistant.enabled !== false;
  const canDelete = assistant.source === 'user';
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: assistant.id,
    disabled: !draggable,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : undefined,
    zIndex: isDragging ? 1 : undefined,
  };

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
      ref={setNodeRef}
      style={style}
      data-testid={`assistant-card-${assistant.id}`}
      className='group flex cursor-pointer items-center justify-between gap-12px rounded-12px border border-solid border-transparent bg-base px-14px py-12px transition-all duration-180 hover:border-border-2'
      onClick={() => onOpenDetail(assistant)}
    >
      <div className='flex min-w-0 flex-1 items-center gap-12px'>
        <Button
          ref={setActivatorNodeRef}
          type='text'
          size='small'
          disabled={!draggable}
          data-testid={`assistant-reorder-handle-${assistant.id}`}
          className={`!min-w-0 !rounded-6px !px-4px !py-0 !text-t-tertiary ${draggable ? 'cursor-grab active:cursor-grabbing' : '!opacity-0'}`}
          onClick={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <Drag size={16} fill='currentColor' />
        </Button>
        <span className={enabled ? '' : 'opacity-50'}>
          <AssistantAvatar assistant={assistant} size={30} />
        </span>
        <div className={`min-w-0 flex-1 ${enabled ? '' : 'opacity-60'}`}>
          <div className='flex min-w-0 items-center gap-8px font-medium text-t-primary'>
            <span className='truncate'>{assistant.name_i18n?.[localeKey] || assistant.name}</span>
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
          <div className='truncate text-12px text-t-secondary'>
            {assistant.description_i18n?.[localeKey] || assistant.description || ''}
          </div>
        </div>
      </div>
      <div
        className='ml-10px flex flex-shrink-0 items-center gap-8px text-t-secondary sm:gap-14px'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chat reveals on row hover to stay quiet at rest. Hidden on narrow widths to give the name room. */}
        {enabled ? (
          <Button
            type='text'
            size='small'
            data-testid={`btn-chat-${assistant.id}`}
            className='!hidden !h-28px !items-center !justify-center !rounded-8px !bg-fill-2 !px-12px !leading-none !text-t-secondary !opacity-0 transition-all hover:!bg-primary-6 hover:!text-white group-hover:!opacity-100 sm:!inline-flex'
            onClick={() => onStartChat(assistant)}
          >
            {t('settings.assistantGoChat', { defaultValue: 'Chat' })}
          </Button>
        ) : null}
        {/* runtime engine — quiet, frameless; hidden on narrow widths. */}
        <span className='hidden sm:inline-flex'>
          <RuntimeBadge assistant={assistant} />
        </span>
        <Switch
          size='small'
          data-testid={`switch-enabled-${assistant.id}`}
          checked={enabled}
          onChange={(checked) => onToggleEnabled(assistant, checked)}
        />
        <Dropdown droplist={actionMenu} trigger='click' position='br' getPopupContainer={() => document.body}>
          <Button
            type='text'
            size='small'
            icon={<MoreOne theme='outline' size='16' fill='currentColor' />}
            aria-label={t('common.more', { defaultValue: 'More' })}
            className='!flex !h-30px !w-30px !items-center !justify-center !rounded-8px !p-0 !text-t-tertiary hover:!bg-fill-2 hover:!text-t-primary'
            data-testid={`btn-assistant-more-${assistant.id}`}
          />
        </Dropdown>
      </div>
    </div>
  );
};

export default MyAssistantRow;
