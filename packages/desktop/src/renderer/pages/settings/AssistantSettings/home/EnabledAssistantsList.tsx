/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantListItem } from '../types';
import { resolveAssistantSourceTag } from '../assistantUtils';
import AssistantAvatar from '../AssistantAvatar';
import RuntimeBadge from './RuntimeBadge';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Empty, Switch, Tag } from '@arco-design/web-react';
import { Drag } from '@icon-park/react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';

type EnabledAssistantsListProps = {
  assistants: AssistantListItem[];
  assistantOrder: readonly string[];
  localeKey: string;
  searchActive: boolean;
  onOpenDetail: (assistant: AssistantListItem) => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  onReorder: (activeId: string, overId: string) => void | Promise<void>;
};

type EnabledAssistantRowProps = {
  assistant: AssistantListItem;
  localeKey: string;
  draggable: boolean;
  onOpenDetail: (assistant: AssistantListItem) => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
};

const EnabledAssistantRow: React.FC<EnabledAssistantRowProps> = ({
  assistant,
  localeKey,
  draggable,
  onOpenDetail,
  onToggleEnabled,
}) => {
  const { t } = useTranslation();
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: assistant.id,
    disabled: !draggable,
  });
  const name = assistant.name_i18n?.[localeKey] || assistant.name;
  const sourceTag = resolveAssistantSourceTag(assistant.source);
  const sourceLabel =
    sourceTag === 'builtin'
      ? t('settings.assistantSourceOfficial', { defaultValue: 'Official' })
      : sourceTag === 'cli'
        ? t('settings.assistantSourceCli', { defaultValue: 'CLI' })
        : t('settings.assistantSourceCustom', { defaultValue: 'Custom' });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : undefined,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`enabled-assistant-row-${assistant.id}`}
      className='group flex cursor-pointer items-center justify-between gap-12px rounded-12px border border-solid border-transparent bg-base px-14px py-12px transition-all duration-180 hover:border-border-2'
      onClick={() => onOpenDetail(assistant)}
    >
      <div className='flex min-w-0 flex-1 items-center gap-12px'>
        <Button
          ref={setActivatorNodeRef}
          type='text'
          size='small'
          disabled={!draggable}
          aria-label={`${t('settings.assistantReorderHintShort', { defaultValue: 'Drag to reorder' })}: ${name}`}
          data-testid={`enabled-assistant-reorder-handle-${assistant.id}`}
          className={`!min-w-0 !rounded-6px !px-4px !py-0 !text-t-tertiary ${
            draggable ? 'cursor-grab active:cursor-grabbing' : '!opacity-0'
          }`}
          style={{ touchAction: 'none' }}
          onClick={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <Drag size={16} fill='currentColor' />
        </Button>
        <AssistantAvatar assistant={assistant} imageFit='contain' shape='circle' size={20} />
        <div className='flex min-w-0 flex-1 items-center gap-8px'>
          <span className='truncate font-medium text-t-primary'>{name}</span>
          <Tag
            size='small'
            bordered={false}
            className='!shrink-0 !rounded-10px !bg-fill-2 !px-8px !py-1px !text-10px !font-600 !leading-16px !text-t-secondary'
          >
            {sourceLabel}
          </Tag>
        </div>
      </div>
      <div className='ml-10px flex flex-shrink-0 items-center gap-8px sm:gap-14px' onClick={(e) => e.stopPropagation()}>
        <span className='hidden min-w-0 shrink-0 sm:inline-flex'>
          <RuntimeBadge assistant={assistant} />
        </span>
        <Switch
          size='small'
          data-testid={`switch-enabled-${assistant.id}`}
          checked={assistant.enabled !== false}
          onChange={(checked) => onToggleEnabled(assistant, checked)}
        />
      </div>
    </div>
  );
};

const EnabledAssistantsList: React.FC<EnabledAssistantsListProps> = ({
  assistants,
  assistantOrder,
  localeKey,
  searchActive,
  onOpenDetail,
  onToggleEnabled,
  onReorder,
}) => {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const enabledAssistants = useMemo(
    () => selectableAssistants(assistants, assistantOrder),
    [assistantOrder, assistants]
  );
  const sortingEnabled = !searchActive && enabledAssistants.length > 1;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const draggedId = String(event.active.id);
      const targetId = event.over ? String(event.over.id) : null;
      if (!sortingEnabled || !targetId || draggedId === targetId) return;
      void onReorder(draggedId, targetId);
    },
    [onReorder, sortingEnabled]
  );

  return (
    <div data-testid='enabled-assistants-list'>
      <p
        data-testid={searchActive ? 'enabled-reorder-search-hint' : 'enabled-reorder-hint'}
        className={`mb-12px mt-0 text-12px leading-relaxed ${searchActive ? 'text-warning-6' : 'text-t-tertiary'}`}
      >
        {searchActive
          ? t('settings.assistantReorderSearchDisabled', { defaultValue: 'Clear search to reorder.' })
          : t('settings.assistantReorderHint', {
              defaultValue: 'Drag to reorder. This decides the display order wherever you pick an assistant.',
            })}
      </p>

      {enabledAssistants.length === 0 ? (
        <div className='rounded-12px border border-dashed border-border-2 bg-base py-28px'>
          <Empty
            description={t('settings.myAssistantsEmpty', {
              defaultValue: 'No assistants here yet. Enable an official assistant, or connect a local CLI tool.',
            })}
          />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={enabledAssistants.map((assistant) => assistant.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className='space-y-8px'>
              {enabledAssistants.map((assistant) => (
                <EnabledAssistantRow
                  key={assistant.id}
                  assistant={assistant}
                  localeKey={localeKey}
                  draggable={sortingEnabled}
                  onOpenDetail={onOpenDetail}
                  onToggleEnabled={onToggleEnabled}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

export default EnabledAssistantsList;
