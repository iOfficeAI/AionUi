/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Drag } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import ConversationRow from './ConversationRow';
import type { ConversationRowProps } from './types';

const SortableConversationRow: React.FC<ConversationRowProps> = (props) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.conversation.id,
    disabled: props.batchMode,
    data: {
      type: 'conversation',
      conversation: props.conversation,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : undefined,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : undefined,
  };

  // Hover-reveal drag handle overlaying the leading icon (same affordance as
  // assistant / draft-box sorting). The handle is the only drag activator so
  // clicks elsewhere on the row keep their normal meaning.
  const dragHandle = (
    <span
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      role='button'
      aria-label={t('conversation.history.reorderPinned')}
      data-testid={`conversation-drag-handle-${props.conversation.id}`}
      className={`absolute inset-0 flex-center text-t-secondary transition-opacity ${
        isDragging ? 'opacity-100 cursor-grabbing' : 'opacity-0 group-hover:opacity-100 cursor-grab'
      }`}
      style={{ lineHeight: 0, background: 'var(--color-fill-3)', borderRadius: 4, touchAction: 'none' }}
      onClick={(event) => event.stopPropagation()}
    >
      <Drag theme='outline' size='14' fill='currentColor' />
    </span>
  );

  return (
    <div ref={setNodeRef} style={style}>
      <ConversationRow {...props} dragHandle={dragHandle} />
    </div>
  );
};

export default SortableConversationRow;
