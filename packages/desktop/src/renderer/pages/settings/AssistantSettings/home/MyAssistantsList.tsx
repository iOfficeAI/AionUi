/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DragEndEvent } from '@dnd-kit/core';
import type { AssistantListItem } from '../types';
import { type AssistantEnabledFilter, filterByEnabled, groupMyAssistants } from '../assistantUtils';
import MyAssistantRow from './MyAssistantRow';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTalkToButler } from '@/renderer/hooks/assistant/useTalkToButler';
import { Dropdown, Menu, Button } from '@arco-design/web-react';
import { Down, SortTwo } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type MyAssistantsListProps = {
  assistants: AssistantListItem[];
  localeKey: string;
  onOpenDetail: (assistant: AssistantListItem) => void;
  onDelete: (assistant: AssistantListItem) => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  onReorder: (activeId: string, overId: string) => void | Promise<void>;
  onStartChat: (assistant: AssistantListItem) => void;
  /** Switch to the Official tab (to duplicate an official assistant). */
  onGoOfficial: () => void;
  searchActive?: boolean;
};

const FILTER_OPTIONS: AssistantEnabledFilter[] = ['all', 'enabled', 'disabled'];

const MyAssistantsList: React.FC<MyAssistantsListProps> = ({
  assistants,
  localeKey,
  onOpenDetail,
  onDelete,
  onToggleEnabled,
  onReorder,
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Drag reorder is only meaningful in the unfiltered "all" view; a filtered
  // view hides rows, so dragging would produce an ambiguous global order.
  const draggable = filter === 'all';

  const { cliAssistants, createdAssistants } = useMemo(() => {
    const filtered = filterByEnabled(assistants, filter);
    return groupMyAssistants(filtered);
  }, [assistants, filter]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!draggable || !over || active.id === over.id) return;
      void onReorder(String(active.id), String(over.id));
    },
    [draggable, onReorder]
  );

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

  const renderGroup = (title: string, list: AssistantListItem[], testId: string, barClass: string) => {
    if (list.length === 0) return null;
    return (
      <div className='mt-20px first:mt-0' data-testid={testId}>
        <div className='mb-10px flex items-center gap-8px px-2px'>
          <span className={`h-13px w-3px rounded-2px ${barClass}`} />
          <span className='text-12px font-600 text-t-secondary'>{title}</span>
          <span className='rounded-999px bg-fill-2 px-6px py-1px text-10px font-500 text-t-quaternary'>
            {list.length}
          </span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={list.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className='space-y-8px'>
              {list.map((assistant) => (
                <MyAssistantRow
                  key={assistant.id}
                  assistant={assistant}
                  localeKey={localeKey}
                  draggable={draggable}
                  onOpenDetail={onOpenDetail}
                  onDelete={onDelete}
                  onToggleEnabled={onToggleEnabled}
                  onStartChat={onStartChat}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    );
  };

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
      {/* Compact toolbar: a quiet reorder hint (icon + tooltip) on the left, the
          enabled filter on the right — no full-width banner hogging a row. */}
      <div className='mb-4px flex items-center justify-between'>
        <span className='inline-flex min-w-0 items-center gap-6px text-12px text-t-tertiary'>
          <SortTwo
            theme='outline'
            size={14}
            fill='currentColor'
            className='block shrink-0 leading-none text-t-quaternary'
            style={{ lineHeight: 0 }}
          />
          <span className='truncate'>
            {t('settings.myAssistantsHintShort', {
              defaultValue: 'Your own assistants — used wherever you pick one. Drag to reorder.',
            })}
          </span>
        </span>
        <Dropdown droplist={filterMenu} trigger='click' position='br'>
          <Button
            size='mini'
            data-testid='assistant-enabled-filter'
            className='!flex !items-center !gap-4px !rounded-8px'
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

      {renderGroup(
        t('settings.assistantGroupCli', { defaultValue: 'Your CLI' }),
        cliAssistants,
        'group-cli',
        'bg-warning-5'
      )}

      {createdAssistants.length > 0 || createdEmpty ? (
        <div className='mt-20px' data-testid='group-created-section'>
          <div className='mb-10px flex items-center gap-8px px-2px'>
            <span className='h-13px w-3px rounded-2px bg-primary-5' />
            <span className='text-12px font-600 text-t-secondary'>
              {t('settings.assistantGroupCreated', { defaultValue: 'Created by you' })}
            </span>
            {createdAssistants.length > 0 ? (
              <span className='rounded-999px bg-fill-2 px-6px py-1px text-10px font-500 text-t-quaternary'>
                {createdAssistants.length}
              </span>
            ) : null}
          </div>
          {createdEmpty ? (
            renderCreatedEmpty()
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={createdAssistants.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <div className='space-y-8px'>
                  {createdAssistants.map((assistant) => (
                    <MyAssistantRow
                      key={assistant.id}
                      assistant={assistant}
                      localeKey={localeKey}
                      draggable={draggable}
                      onOpenDetail={onOpenDetail}
                      onDelete={onDelete}
                      onToggleEnabled={onToggleEnabled}
                      onStartChat={onStartChat}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default MyAssistantsList;
