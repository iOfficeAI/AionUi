/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import classNames from 'classnames';
import React, { useMemo } from 'react';

import WorkspaceCollapse from '../WorkspaceCollapse';
import SortableConversationRow from './SortableConversationRow';
import type { ConversationRowProps, WorkspaceGroup } from './types';

type SortableWorkspaceGroupProps = {
  group: WorkspaceGroup;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  batchMode: boolean;
  isDragEnabled: boolean;
  renderConversationProps: (conversationId: string) => ConversationRowProps | undefined;
};

const SortableWorkspaceGroup: React.FC<SortableWorkspaceGroupProps> = ({ group, collapsed, expanded, onToggle, batchMode, isDragEnabled, renderConversationProps }) => {
  const sortableId = `workspace:${group.workspace}`;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled: !isDragEnabled,
    data: {
      type: 'workspace',
      workspaceGroup: group,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : undefined,
  };

  const conversationIds = useMemo(() => group.conversations.map((c) => c.id), [group.conversations]);

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={classNames('min-w-0', { 'px-8px': !collapsed })}>
      <WorkspaceCollapse
        expanded={expanded}
        onToggle={onToggle}
        siderCollapsed={collapsed}
        dragHandleProps={isDragEnabled ? listeners : undefined}
        header={
          <div className='flex items-center gap-8px text-14px min-w-0'>
            <span className='font-medium truncate flex-1 text-t-primary min-w-0'>{group.displayName}</span>
          </div>
        }
      >
        <SortableContext items={conversationIds} strategy={verticalListSortingStrategy}>
          <div className={classNames('flex flex-col gap-2px min-w-0', { 'mt-4px': !collapsed })}>
            {group.conversations.map((conversation) => {
              const props = renderConversationProps(conversation.id);
              if (!props) return null;
              return isDragEnabled ? <SortableConversationRow key={conversation.id} {...props} /> : <SortableConversationRow key={conversation.id} {...props} />;
            })}
          </div>
        </SortableContext>
      </WorkspaceCollapse>
    </div>
  );
};

export default SortableWorkspaceGroup;
