/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantListItem } from '../types';
import { type AssistantEnabledFilter, filterByEnabled, groupMyAssistants } from '../assistantUtils';
import MyAssistantCard from './MyAssistantCard';
import { useTalkToButler } from '@/renderer/hooks/assistant/useTalkToButler';
import { Dropdown, Menu, Button } from '@arco-design/web-react';
import { AllApplication, Down } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type MyAssistantsListProps = {
  assistants: AssistantListItem[];
  localeKey: string;
  onOpenDetail: (assistant: AssistantListItem) => void;
  onDelete: (assistant: AssistantListItem) => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  onStartChat: (assistant: AssistantListItem) => void;
  /** Switch to the Official tab (to duplicate an official assistant). */
  onGoOfficial: () => void;
  searchActive?: boolean;
};

const FILTER_OPTIONS: AssistantEnabledFilter[] = ['all', 'enabled', 'disabled'];

const renderGroupHeader = (title: string, count: number, barClass: string) => (
  <div className='mb-10px flex items-center gap-8px px-2px'>
    <span className={`h-13px w-3px rounded-2px ${barClass}`} />
    <span className='text-12px font-600 text-t-secondary'>{title}</span>
    {count > 0 ? (
      <span className='rounded-999px bg-fill-2 px-6px py-1px text-10px font-500 text-t-quaternary'>{count}</span>
    ) : null}
  </div>
);

const MyAssistantsList: React.FC<MyAssistantsListProps> = ({
  assistants,
  localeKey,
  onOpenDetail,
  onDelete,
  onToggleEnabled,
  onStartChat,
  onGoOfficial,
  searchActive = false,
}) => {
  const { t } = useTranslation();
  const talkToButler = useTalkToButler();
  const [filter, setFilter] = useState<AssistantEnabledFilter>('all');

  // "Create via chat": hand off to the AionUi Butler on the home page with a
  // ready-made create-an-assistant prompt (same flow as the header action).
  const handleCreateViaChat = () => {
    void talkToButler({
      prompt: t('settings.talkToButler.prompt.createAssistant', {
        defaultValue: 'Help me create a new assistant and walk me through setting it up.',
      }),
    });
  };

  const { cliAssistants, createdAssistants } = useMemo(() => {
    const filtered = filterByEnabled(assistants, filter);
    return groupMyAssistants(filtered);
  }, [assistants, filter]);

  const filterMenu = (
    <Menu onClickMenuItem={(key) => setFilter(key as AssistantEnabledFilter)}>
      {FILTER_OPTIONS.map((option) => (
        <Menu.Item key={option} data-testid={`filter-option-${option}`}>
          {t(`settings.assistantFilter.${option}`, {
            defaultValue: option === 'all' ? 'All' : option === 'enabled' ? 'Enabled' : 'Disabled',
          })}
        </Menu.Item>
      ))}
    </Menu>
  );

  const renderCardGrid = (list: AssistantListItem[]) => (
    <div className='grid grid-cols-1 gap-14px sm:grid-cols-2 lg:grid-cols-3'>
      {list.map((assistant) => (
        <MyAssistantCard
          key={assistant.id}
          assistant={assistant}
          localeKey={localeKey}
          onOpenDetail={onOpenDetail}
          onDelete={onDelete}
          onToggleEnabled={onToggleEnabled}
          onStartChat={onStartChat}
        />
      ))}
    </div>
  );

  // The "created by me" group shows a guiding empty state when the user has
  // no custom assistants yet (only in the unfiltered view — a filtered empty
  // just means "no matches", not "none exist").
  const hasVisibleAssistants = cliAssistants.length > 0 || createdAssistants.length > 0;
  const createdEmpty = createdAssistants.length === 0 && filter === 'all' && !searchActive;

  const renderCreatedEmpty = () => (
    <div
      className='flex flex-col items-center rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-28px text-center'
      data-testid='created-empty'
    >
      <div className='mb-6px text-13px font-600 text-t-primary'>
        {t('settings.customEmptyTitle', { defaultValue: 'No custom assistants yet' })}
      </div>
      <p className='mb-16px max-w-360px text-12px leading-[1.6] text-t-secondary'>
        {t('settings.customEmptyBody', {
          defaultValue: 'Create one by chatting with the butler, or duplicate an official assistant into your own.',
        })}
      </p>
      <div className='flex items-center gap-10px'>
        <Button
          type='primary'
          size='small'
          className='!rounded-8px'
          onClick={handleCreateViaChat}
          data-testid='created-empty-create'
        >
          {t('settings.customEmptyCreate', { defaultValue: 'Create via chat' })}
        </Button>
        <Button size='small' className='!rounded-8px' onClick={onGoOfficial} data-testid='created-empty-official'>
          {t('settings.customEmptyBrowseOfficial', { defaultValue: 'Browse official' })}
        </Button>
      </div>
    </div>
  );

  return (
    <div data-testid='my-assistants-pane'>
      {/* Compact toolbar: quiet one-line hint (full text on hover) + enabled filter. */}
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
            {t('settings.myAssistantsHintShort', {
              defaultValue: 'Your own assistants — used wherever you pick one.',
            })}
          </span>
        </span>
        <Dropdown droplist={filterMenu} trigger='click' position='br'>
          <Button
            size='mini'
            data-testid='assistant-enabled-filter'
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

      {searchActive && !hasVisibleAssistants ? (
        <div className='rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-28px text-center text-13px text-t-secondary'>
          {t('settings.assistantNoMatch', { defaultValue: 'No assistants match the current filters.' })}
        </div>
      ) : null}

      {/* Created-by-you group on top. */}
      {createdAssistants.length > 0 || createdEmpty ? (
        <div data-testid='group-created-section'>
          {renderGroupHeader(
            t('settings.assistantGroupCreated', { defaultValue: 'Created by you' }),
            createdAssistants.length,
            'bg-primary-5'
          )}
          {createdEmpty ? renderCreatedEmpty() : renderCardGrid(createdAssistants)}
        </div>
      ) : null}

      {/* CLI group below. */}
      {cliAssistants.length > 0 ? (
        <div className='mt-20px' data-testid='group-cli'>
          {renderGroupHeader(
            t('settings.assistantGroupCli', { defaultValue: 'Your CLI' }),
            cliAssistants.length,
            'bg-warning-5'
          )}
          {renderCardGrid(cliAssistants)}
        </div>
      ) : null}
    </div>
  );
};

export default MyAssistantsList;
