import type { ConversationCommandQueueItem } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import {
  type Modifier,
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Dropdown, Menu, Typography } from '@arco-design/web-react';
import { CornerDownRight, Delete, Drag, MoreOne } from '@icon-park/react';
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const getCommandPreview = (input: string): string => input.replace(/\s+/g, ' ').trim();

const restrictQueueDragToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

const createRestrictToQueueContainerModifier = (
  queueContainerRef: React.RefObject<HTMLDivElement | null>
): Modifier => {
  return ({ draggingNodeRect, overlayNodeRect, transform }) => {
    const queueContainerRect = queueContainerRef.current?.getBoundingClientRect();
    const activeRect = overlayNodeRect ?? draggingNodeRect;

    if (!queueContainerRect || !activeRect) {
      return transform;
    }

    const minY = queueContainerRect.top - activeRect.top;
    const maxY = queueContainerRect.bottom - (activeRect.top + activeRect.height);

    return {
      ...transform,
      y: Math.min(Math.max(transform.y, minY), maxY),
    };
  };
};

type CommandQueuePanelProps = {
  items: ConversationCommandQueueItem[];
  paused: boolean;
  interactionLocked: boolean;
  onPause: () => void;
  onResume: () => void;
  onInteractionLock: () => void;
  onInteractionUnlock: () => void;
  onUpdate?: (commandId: string, input: string) => boolean;
  onEdit?: (item: ConversationCommandQueueItem) => void;
  onReorder: (activeCommandId: string, overCommandId: string) => void;
  onRemove: (commandId: string) => void;
  onClear: () => void;
};

type RenderActionIconButtonArgs = {
  ariaLabel: string;
  disabled?: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  danger?: boolean;
};

type SortableQueueItemProps = {
  item: ConversationCommandQueueItem;
  dragDisabled: boolean;
  dragHandleLabel: string;
  preview: string;
  fileCountLabel: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
  onEdit?: (item: ConversationCommandQueueItem) => void;
  onRemove: (commandId: string) => void;
  onClear: () => void;
  onDragHandlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

type QueueItemCardProps = {
  item: ConversationCommandQueueItem;
  isDragging: boolean;
  dragDisabled: boolean;
  dragHandleLabel: string;
  preview: string;
  fileCountLabel: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
  onEdit?: (item: ConversationCommandQueueItem) => void;
  onRemove: (commandId: string) => void;
  onClear: () => void;
  onDragHandlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  dragHandleButtonProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
  dragHandleRef: (element: HTMLButtonElement | null) => void;
};

const renderQueueActionIconButton = ({
  ariaLabel,
  disabled = false,
  onClick,
  icon,
  danger = false,
}: RenderActionIconButtonArgs) => (
  <Button
    size='mini'
    type='text'
    shape='circle'
    className='w-22px h-22px min-w-22px p-0 opacity-72 hover:opacity-100'
    disabled={disabled}
    status={danger ? 'danger' : 'default'}
    aria-label={ariaLabel}
    onClick={onClick}
  >
    <span
      className='inline-flex items-center justify-center'
      style={{
        color: danger ? 'rgb(var(--danger-6))' : disabled ? 'var(--color-text-4)' : 'var(--color-text-3)',
      }}
    >
      {icon}
    </span>
  </Button>
);

const QueueItemCard: React.FC<QueueItemCardProps> = ({
  item,
  isDragging,
  dragDisabled,
  dragHandleLabel,
  preview,
  fileCountLabel,
  t,
  onEdit,
  onRemove,
  onClear,
  onDragHandlePointerDown,
  dragHandleButtonProps,
  dragHandleRef,
}) => {
  const { onPointerDown: onSortableDragHandlePointerDown, ...restDragHandleButtonProps } = dragHandleButtonProps ?? {};
  return (
    <div
      className='group flex items-center justify-between gap-6px rd-10px px-8px py-5px transition-[background-color,opacity] duration-180 ease-out'
      data-command-id={item.id}
      data-sortable={dragDisabled ? 'disabled' : 'enabled'}
      aria-grabbed={isDragging}
      aria-label={preview}
      style={{
        background: isDragging
          ? 'color-mix(in srgb, var(--color-fill-2) 88%, var(--color-bg-1))'
          : 'color-mix(in srgb, var(--color-fill-1) 76%, transparent)',
      }}
    >
      <div className='flex items-center gap-6px min-w-0 flex-1 relative pl-4px'>
        <div className='flex items-center gap-5px w-18px shrink-0 relative'>
          <button
            {...restDragHandleButtonProps}
            ref={dragHandleRef}
            type='button'
            aria-label={dragHandleLabel}
            disabled={dragDisabled}
            data-drag-handle={dragDisabled ? 'disabled' : 'enabled'}
            data-floating-handle='visible'
            className={`absolute inline-flex h-16px w-12px items-center justify-center border-none bg-transparent p-0 outline-none transition-[opacity,color] duration-160 ease-out ${
              dragDisabled
                ? 'cursor-default opacity-0'
                : isDragging
                  ? 'cursor-grabbing opacity-100'
                  : 'cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
            style={{
              left: '-9px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-3)',
              touchAction: dragDisabled ? undefined : 'none',
            }}
            onPointerDown={(event) => {
              onDragHandlePointerDown(event);
              onSortableDragHandlePointerDown?.(event);
            }}
          >
            <Drag theme='outline' size='12' strokeWidth={2.5} />
          </button>
          <span
            aria-hidden='true'
            data-queue-arrow='true'
            className='inline-flex h-16px w-16px items-center justify-center shrink-0'
            style={{
              color: 'var(--color-text-3)',
            }}
          >
            <CornerDownRight theme='outline' size='12' strokeWidth={2.3} />
          </span>
        </div>
        <div className='min-w-0 flex-1 flex items-center gap-6px'>
          <Typography.Ellipsis rows={1} showTooltip className='min-w-0 flex-1 text-11px leading-16px text-t-secondary'>
            {preview}
          </Typography.Ellipsis>
          {fileCountLabel ? (
            <span
              className='inline-flex items-center rd-999px px-5px py-1px text-9px leading-none shrink-0'
              style={{
                color: 'var(--color-text-3)',
                background: 'color-mix(in srgb, var(--color-fill-2) 72%, transparent)',
              }}
            >
              {fileCountLabel}
            </span>
          ) : null}
        </div>
      </div>
      <div className='flex items-center gap-0.5 shrink-0'>
        {renderQueueActionIconButton({
          ariaLabel: t('conversation.commandQueue.remove', { defaultValue: 'Remove' }),
          onClick: () => onRemove(item.id),
          icon: <Delete theme='outline' size='14' strokeWidth={2.5} />,
          danger: true,
        })}
        <Dropdown
          trigger='click'
          droplist={
            <Menu>
              <Menu.Item
                key='edit'
                onClick={() => {
                  onEdit?.(item);
                }}
              >
                {t('conversation.commandQueue.edit', { defaultValue: 'Edit' })}
              </Menu.Item>
              <Menu.Item key='clear-queue' onClick={onClear}>
                {t('conversation.commandQueue.clear', { defaultValue: 'Clear queue' })}
              </Menu.Item>
            </Menu>
          }
        >
          {renderQueueActionIconButton({
            ariaLabel: t('conversation.commandQueue.moreActions', { defaultValue: 'More actions' }),
            icon: <MoreOne theme='outline' size='14' strokeWidth={2.5} />,
          })}
        </Dropdown>
      </div>
    </div>
  );
};

const SortableQueueItem: React.FC<SortableQueueItemProps> = ({
  item,
  dragDisabled,
  dragHandleLabel,
  preview,
  fileCountLabel,
  t,
  onEdit,
  onRemove,
  onClear,
  onDragHandlePointerDown,
}) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: dragDisabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.58 : 1,
    zIndex: isDragging ? 2 : undefined,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <QueueItemCard
        item={item}
        isDragging={isDragging}
        dragDisabled={dragDisabled}
        dragHandleLabel={dragHandleLabel}
        preview={preview}
        fileCountLabel={fileCountLabel}
        t={t}
        onEdit={onEdit}
        onRemove={onRemove}
        onClear={onClear}
        onDragHandlePointerDown={onDragHandlePointerDown}
        dragHandleRef={setActivatorNodeRef}
        dragHandleButtonProps={{
          ...(attributes as React.ButtonHTMLAttributes<HTMLButtonElement>),
          ...(listeners as React.ButtonHTMLAttributes<HTMLButtonElement>),
        }}
      />
    </div>
  );
};

const CommandQueuePanel: React.FC<CommandQueuePanelProps> = ({
  items,
  interactionLocked,
  onInteractionLock,
  onInteractionUnlock,
  onEdit,
  onReorder,
  onRemove,
  onClear,
}) => {
  const { t } = useTranslation();
  const queueContainerRef = useRef<HTMLDivElement | null>(null);
  const activeDragHandleRef = useRef<HTMLButtonElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const clearDragHandleFocus = () => {
    activeDragHandleRef.current?.blur();
    activeDragHandleRef.current = null;
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    onInteractionUnlock();
    clearDragHandleFocus();

    if (!over || active.id === over.id) {
      return;
    }

    onReorder(String(active.id), String(over.id));
  };

  const handleDragStart = () => {
    if (interactionLocked) {
      return;
    }

    onInteractionLock();
  };

  const handleDragCancel = () => {
    onInteractionUnlock();
    clearDragHandleFocus();
  };

  const dragHandleLabel = t('conversation.commandQueue.reorder', {
    defaultValue: 'Drag to reorder queued command',
  });
  const dragModifiers = useMemo(
    () => [restrictQueueDragToVerticalAxis, createRestrictToQueueContainerModifier(queueContainerRef)],
    []
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div className='relative z-1 mb--12px px-8px pt-8px pb-12px'>
      <div
        aria-label={t('conversation.commandQueue.title', { defaultValue: 'Queued Commands' })}
        className='overflow-hidden rd-t-18px border b-solid'
        style={{
          borderColor: 'color-mix(in srgb, var(--color-border-2) 56%, transparent)',
          background: 'color-mix(in srgb, var(--color-fill-1) 84%, var(--color-bg-1))',
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          modifiers={dragModifiers}
        >
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <div
              ref={queueContainerRef}
              data-command-queue-list='true'
              data-drag-axis='vertical'
              data-drag-bounds='queue'
              className='p-6px flex flex-col gap-4px'
            >
              {items.map((item) => {
                const preview = getCommandPreview(item.input);
                const fileCountLabel =
                  item.files.length > 0
                    ? t('conversation.commandQueue.files', {
                        count: item.files.length,
                        defaultValue: `${item.files.length} files`,
                      })
                    : null;

                return (
                  <SortableQueueItem
                    key={item.id}
                    item={item}
                    dragDisabled={false}
                    dragHandleLabel={dragHandleLabel}
                    preview={preview}
                    fileCountLabel={fileCountLabel}
                    t={t}
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onClear={onClear}
                    onDragHandlePointerDown={(event) => {
                      activeDragHandleRef.current = event.currentTarget;
                    }}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

export default CommandQueuePanel;
