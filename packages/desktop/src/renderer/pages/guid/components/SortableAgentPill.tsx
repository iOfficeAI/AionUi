/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';

type SortableAgentPillProps = {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
};

/**
 * Sortable wrapper around an agent pill. Mirrors `SortableSiderEntry` —
 * forwards drag attributes/listeners to the wrapper div and applies the
 * dnd-kit transform / opacity treatment while dragging.
 *
 * The inner pill's onClick still fires for a tap-without-drag thanks to
 * the `PointerSensor` activation distance configured at the DndContext.
 */
const SortableAgentPill: React.FC<SortableAgentPillProps> = ({ id, disabled = false, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : undefined,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
};

export default SortableAgentPill;
