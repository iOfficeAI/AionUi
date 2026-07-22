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
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Empty, Tag } from '@arco-design/web-react';
import { Drag } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';

type EnabledAssistantsListProps = {
  assistants: AssistantListItem[];
  assistantOrder: readonly string[];
  localeKey: string;
  searchActive: boolean;
  onOpenDetail: (assistant: AssistantListItem) => void;
  onReorder: (activeId: string, overId: string) => void | Promise<void>;
};

type EnabledAssistantRowProps = {
  assistant: AssistantListItem;
  localeKey: string;
  draggable: boolean;
  dropTarget: boolean;
  onOpenDetail: (assistant: AssistantListItem) => void;
};

const EnabledAssistantRow: React.FC<EnabledAssistantRowProps> = ({
  assistant,
  localeKey,
  draggable,
  dropTarget,
  onOpenDetail,
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
      className={`group relative flex cursor-pointer items-center justify-between gap-12px rounded-12px border border-solid px-14px py-12px transition-all duration-180 ${
        isDragging || dropTarget
          ? 'border-primary-5 bg-primary-1'
          : 'border-transparent bg-base hover:border-border-2 hover:bg-fill-1'
      }`}
      onClick={() => onOpenDetail(assistant)}
    >
      {dropTarget && !isDragging ? (
        <span className='pointer-events-none absolute inset-x-12px -top-1px h-2px rounded-full bg-primary-6' />
      ) : null}
      <div className='flex min-w-0 flex-1 items-center gap-12px'>
        <Button
          ref={setActivatorNodeRef}
          type='text'
          size='small'
          disabled={!draggable}
          aria-label={`${t('settings.assistantReorderHintShort', { defaultValue: 'Drag to reorder' })}: ${name}`}
          data-testid={`enabled-assistant-reorder-handle-${assistant.id}`}
          className={`!min-w-0 !rounded-6px !px-4px !py-0 !text-t-tertiary transition-opacity ${
            draggable
              ? 'cursor-grab !opacity-100 active:cursor-grabbing sm:!opacity-0 sm:group-hover:!opacity-100 sm:focus:!opacity-100'
              : '!opacity-0'
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
      <span className='hidden min-w-0 shrink-0 sm:inline-flex'>
        <RuntimeBadge assistant={assistant} showLabel={false} showName />
      </span>
    </div>
  );
};

const EnabledAssistantsList: React.FC<EnabledAssistantsListProps> = ({
  assistants,
  assistantOrder,
  localeKey,
  searchActive,
  onOpenDetail,
  onReorder,
}) => {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const enabledAssistants = useMemo(
    () => selectableAssistants(assistants, assistantOrder),
    [assistantOrder, assistants]
  );
  const sortingEnabled = !searchActive && enabledAssistants.length > 1;

  const resetDragState = useCallback(() => {
    setActiveId(null);
    setOverId(null);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setOverId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null);
  }, []);

  const handleDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      resetDragState();
    },
    [resetDragState]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const draggedId = String(event.active.id);
      const targetId = event.over ? String(event.over.id) : null;
      resetDragState();
      if (!sortingEnabled || !targetId || draggedId === targetId) return;
      void onReorder(draggedId, targetId);
    },
    [onReorder, resetDragState, sortingEnabled]
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
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
                  dropTarget={overId === assistant.id && activeId !== assistant.id}
                  onOpenDetail={onOpenDetail}
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
