/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Drag } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type SortableSidebarRowData = {
  type: 'conversation' | 'team';
  conversation?: TChatConversation;
};

type SortableSidebarRowProps = {
  /** Composite sortable id (`${item_type}:${item_id}`), matching the shared pinned SortableContext. */
  id: string;
  /** Disable dragging (e.g. batch-selection mode) while keeping the row rendered. */
  disabled?: boolean;
  /** dnd payload; harmless when the drag-end resolver derives anchors from the pinned list instead. */
  data?: SortableSidebarRowData;
  /**
   * Render the inner row, receiving the hover-reveal drag handle to place into
   * its leading-icon slot. One wrapper for every pinned row kind
   * (conversation ∪ team) so they share the exact same 6-dot affordance.
   */
  children: (dragHandle: React.ReactNode) => React.ReactNode;
};

/**
 * Shared drag wrapper for pinned sidebar rows. A pinned conversation and a
 * pinned team both render through this, so they get identical drag behaviour: a
 * hover-reveal 6-dot handle overlaying the leading icon is the ONLY drag
 * activator, so clicks elsewhere on the row keep their normal meaning.
 */
const SortableSidebarRow: React.FC<SortableSidebarRowProps> = ({ id, disabled = false, data, children }) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
    data,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : undefined,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
  };

  const dragHandle = (
    <span
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      role='button'
      aria-label={t('conversation.history.reorderPinned')}
      data-testid={`sidebar-drag-handle-${id}`}
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
      {children(dragHandle)}
    </div>
  );
};

export default SortableSidebarRow;
