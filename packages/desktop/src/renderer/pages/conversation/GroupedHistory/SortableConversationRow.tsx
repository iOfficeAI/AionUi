/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Drag } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import ConversationRow from './ConversationRow';
import { useConversationDrag } from './hooks/ConversationDragContext';
import type { ConversationRowProps } from './types';
import type { ConversationDragSource, ConversationDropTarget } from './utils/conversationDropTargets';

/**
 * Hover-reveal drag handle overlaying the leading icon (same affordance as
 * assistant / draft-box sorting). The handle is the only drag activator so
 * clicks elsewhere on the row keep their normal meaning.
 */
const DragHandle: React.FC<{
  conversation_id: string;
  label: string;
  isDragging: boolean;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}> = ({ conversation_id, label, isDragging, setActivatorNodeRef, attributes, listeners }) => (
  <span
    ref={setActivatorNodeRef}
    {...attributes}
    {...listeners}
    role='button'
    aria-label={label}
    data-testid={`conversation-drag-handle-${conversation_id}`}
    className={`absolute inset-0 flex-center text-t-secondary transition-opacity ${
      isDragging ? 'opacity-100 cursor-grabbing' : 'opacity-0 group-hover:opacity-100 cursor-grab'
    }`}
    // `manipulation`, not `none`: a swipe that starts on the handle must still
    // scroll the list; the touch sensor only takes over after a hold.
    style={{ lineHeight: 0, background: 'var(--color-fill-3)', borderRadius: 4, touchAction: 'manipulation' }}
    onClick={(event) => event.stopPropagation()}
  >
    <Drag theme='outline' size='14' fill='currentColor' />
  </span>
);

const dragSource = (conversation_id: string): ConversationDragSource => ({ kind: 'conversation', conversation_id });
const rowTarget = (conversation_id: string): ConversationDropTarget => ({
  kind: 'conversation',
  conversation_id,
  surface: 'row',
});

/**
 * A pinned row: sortable among its pinned siblings (drop between rows to
 * reorder) and a drop target in its own right (drop onto it to fuse into a
 * split group). The dragged row itself stays put at reduced opacity; the
 * ghost that follows the pointer is the DragOverlay in ConversationDragContext.
 */
const SortableConversationRow: React.FC<ConversationRowProps> = (props) => {
  const { t } = useTranslation();
  const { dropTarget } = useConversationDrag();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.conversation.id,
    disabled: props.batchMode,
    data: { ...dragSource(props.conversation.id), ...rowTarget(props.conversation.id) },
  });

  const style: React.CSSProperties = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ConversationRow
        {...props}
        dropTargeted={dropTarget?.id === props.conversation.id && dropTarget.intent === 'onto'}
        dragHandle={
          <DragHandle
            conversation_id={props.conversation.id}
            label={t('conversation.history.reorderPinned')}
            isDragging={isDragging}
            setActivatorNodeRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
          />
        }
      />
    </div>
  );
};

/**
 * Any other row: draggable onto another row, a pill or the open chat area to
 * fuse into a split group, and a drop target for the same gesture. Not
 * sortable — there is no order to keep outside the pinned section.
 */
export const DraggableConversationRow: React.FC<ConversationRowProps> = (props) => {
  const { t } = useTranslation();
  const { dropTarget } = useConversationDrag();
  const id = props.conversation.id;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id,
    disabled: props.batchMode,
    data: dragSource(id),
  });
  const { setNodeRef: setDroppableRef } = useDroppable({ id, disabled: props.batchMode, data: rowTarget(id) });

  return (
    <div
      ref={(element) => {
        setNodeRef(element);
        setDroppableRef(element);
      }}
      style={{ opacity: isDragging ? 0.4 : undefined, position: 'relative' }}
    >
      <ConversationRow
        {...props}
        dropTargeted={dropTarget?.id === id}
        dragHandle={
          <DragHandle
            conversation_id={id}
            label={t('conversation.splitGroup.dragToSplit')}
            isDragging={isDragging}
            setActivatorNodeRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
          />
        }
      />
    </div>
  );
};

export default SortableConversationRow;
