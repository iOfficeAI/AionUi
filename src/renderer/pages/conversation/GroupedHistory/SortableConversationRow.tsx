/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';

import ConversationRow from './ConversationRow';
import type { ConversationRowProps } from './types';

const SortableConversationRow: React.FC<ConversationRowProps> = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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
    opacity: isDragging ? 0.4 : undefined,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ConversationRow {...props} />
    </div>
  );
};

export default SortableConversationRow;
