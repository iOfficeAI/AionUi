/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantListItem } from '../types';
import { type AssistantEnabledFilter, filterByEnabled } from '../assistantUtils';
import AssistantAvatar from '../AssistantAvatar';
import RuntimeBadge from './RuntimeBadge';
import { Button, Dropdown, Menu, Switch } from '@arco-design/web-react';
import { AllApplication, Down, MoreOne } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type OfficialAssistantsGridProps = {
  assistants: AssistantListItem[];
  localeKey: string;
  onOpenSettings: (assistant: AssistantListItem) => void;
  onDuplicate: (assistant: AssistantListItem) => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  onStartChat: (assistant: AssistantListItem) => void;
  searchActive?: boolean;
};

const FILTER_OPTIONS: AssistantEnabledFilter[] = ['all', 'enabled', 'disabled'];

/**
 * Official (builtin) assistants as a card grid. Official templates cannot be
 * reordered or deleted; each card exposes an enable switch (top-right), a
 * "Chat" primary action when enabled, and a ⋯ menu (Settings / Duplicate).
 */
const OfficialAssistantsGrid: React.FC<OfficialAssistantsGridProps> = ({
  assistants,
  localeKey,
  onOpenSettings,
  onDuplicate,
  onToggleEnabled,
  onStartChat,
  searchActive = false,
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<AssistantEnabledFilter>('all');
  const officialAssistants = useMemo(() => {
    const builtins = assistants.filter((a) => a.source === 'builtin').toSorted((a, b) => a.sort_order - b.sort_order);
    return filterByEnabled(builtins, filter);
  }, [assistants, filter]);

  const filterMenu = (
    <Menu onClickMenuItem={(key) => setFilter(key as AssistantEnabledFilter)}>
      {FILTER_OPTIONS.map((option) => (
        <Menu.Item key={option} data-testid={`official-filter-option-${option}`}>
          {t(`settings.assistantFilter.${option}`, {
            defaultValue: option === 'all' ? 'All' : option === 'enabled' ? 'Enabled' : 'Disabled',
          })}
        </Menu.Item>
      ))}
    </Menu>
  );

  return (
    <div data-testid='official-assistants-pane'>
      {/* Compact toolbar: quiet one-line hint (full text on hover) + filter. */}
      <div className='mb-14px flex items-center justify-between gap-12px'>
        <span className='inline-flex min-w-0 items-center gap-6px text-12px text-t-tertiary'>
          <AllApplication
            theme='outline'
            size={14}
            fill='currentColor'
            className='block shrink-0 leading-none text-t-quaternary'
            style={{ lineHeight: 0 }}
          />
          <span className='truncate'>
            {t('settings.officialAssistantsHintShort', {
              defaultValue: 'Maintained by AionUi · enable to use, duplicate to customize',
            })}
          </span>
        </span>
        <Dropdown droplist={filterMenu} trigger='click' position='br'>
          <Button
            size='mini'
            data-testid='official-enabled-filter'
            className='!flex !shrink-0 !items-center !gap-4px !rounded-8px'
          >
            <span>
              {t(`settings.assistantFilter.${filter}`, {
                defaultValue: filter === 'all' ? 'All' : filter === 'enabled' ? 'Enabled' : 'Disabled',
              })}
            </span>
            <Down theme='outline' size={12} fill='currentColor' />
          </Button>
        </Dropdown>
      </div>

      <div className='grid grid-cols-1 gap-14px sm:grid-cols-2 lg:grid-cols-3'>
        {officialAssistants.length === 0 ? (
          <div className='col-span-full rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-28px text-center text-13px text-t-secondary'>
            {searchActive
              ? t('settings.assistantNoMatch', { defaultValue: 'No assistants match the current filters.' })
              : t('settings.assistantsEmpty', { defaultValue: 'No assistants configured.' })}
          </div>
        ) : null}
        {officialAssistants.map((assistant) => {
          const enabled = assistant.enabled !== false;
          const actionMenu = (
            <Menu
              onClickMenuItem={(key) => {
                if (key === 'settings') onOpenSettings(assistant);
                if (key === 'duplicate') onDuplicate(assistant);
              }}
            >
              <Menu.Item key='settings'>
                <span data-testid={`menu-settings-${assistant.id}`}>
                  {t('common.settings', { defaultValue: 'Settings' })}
                </span>
              </Menu.Item>
              <Menu.Item key='duplicate'>
                <span data-testid={`menu-duplicate-${assistant.id}`}>
                  {t('settings.duplicateAssistant', { defaultValue: 'Duplicate as my assistant' })}
                </span>
              </Menu.Item>
            </Menu>
          );

          return (
            <div
              key={assistant.id}
              data-testid={`official-card-${assistant.id}`}
              className='group flex cursor-pointer flex-col rounded-14px border border-solid border-transparent bg-base p-16px transition-all duration-180 hover:border-border-2'
              onClick={() => onOpenSettings(assistant)}
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
              <div className={`mt-12px truncate text-14px font-600 text-t-primary ${enabled ? '' : 'opacity-70'}`}>
                {assistant.name_i18n?.[localeKey] || assistant.name}
              </div>
              <div
                className={`mt-6px line-clamp-2 text-12px leading-[1.5] text-t-secondary ${enabled ? '' : 'opacity-55'}`}
              >
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
        })}
      </div>
    </div>
  );
};

export default OfficialAssistantsGrid;
