/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConversationDrag } from '@/renderer/pages/conversation/GroupedHistory/hooks/ConversationDragContext';
import { chatAreaDropId } from '@/renderer/pages/conversation/GroupedHistory/utils/conversationDropTargets';
import type { ConversationDropTarget } from '@/renderer/pages/conversation/GroupedHistory/utils/conversationDropTargets';
import { useDroppable } from '@dnd-kit/core';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Makes an open conversation view a drop target for a sidebar row. Dropping on
 * a single conversation fuses the two into a split group; dropping on a column
 * of an open group adds the row as another column. The overlay exists only
 * while a row is being dragged and never takes pointer events, so the chat
 * underneath keeps working.
 */
const ConversationDropZone: React.FC<
  React.PropsWithChildren<{
    conversation_id: string;
    /** What a drop here does, for the hint text: fuse two, or add to an open group. */
    mode: 'split' | 'add';
    className?: string;
  }>
> = ({ conversation_id, mode, className, children }) => {
  const { t } = useTranslation();
  const { activeConversation, dropTarget } = useConversationDrag();
  const id = chatAreaDropId(conversation_id);
  const data: ConversationDropTarget = { kind: 'conversation', conversation_id, surface: 'chat' };
  const { setNodeRef } = useDroppable({ id, data });
  const dragging = activeConversation !== null && activeConversation.id !== conversation_id;
  const over = dropTarget?.id === id;

  return (
    <div
      ref={setNodeRef}
      className={classNames('relative flex flex-col flex-1 min-h-0 min-w-0', className)}
      data-testid={`conversation-drop-zone-${conversation_id}`}
      data-drop-over={over ? 'true' : undefined}
    >
      {children}
      {dragging && (
        <div
          aria-hidden='true'
          className={classNames(
            'absolute inset-8px rd-12px z-40 pointer-events-none flex items-center justify-center border-2 border-dashed transition-colors',
            over
              ? 'border-[rgb(var(--primary-6))] bg-[rgba(var(--primary-6),0.10)]'
              : 'border-[rgba(var(--primary-6),0.35)] bg-[rgba(var(--primary-6),0.03)]'
          )}
        >
          <span
            className={classNames(
              'px-14px py-8px rd-20px text-13px font-[500] bg-2 text-t-primary shadow-lg border border-solid border-b-base transition-opacity',
              over ? 'opacity-100' : 'opacity-80'
            )}
          >
            {t(mode === 'add' ? 'conversation.splitGroup.dropToAdd' : 'conversation.splitGroup.dropToSplit')}
          </span>
        </div>
      )}
    </div>
  );
};

export default ConversationDropZone;
