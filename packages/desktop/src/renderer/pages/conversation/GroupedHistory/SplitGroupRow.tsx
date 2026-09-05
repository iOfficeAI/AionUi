/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Tooltip } from '@arco-design/web-react';
import { CloseSmall } from '@icon-park/react';
import { useDroppable } from '@dnd-kit/core';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

import ConversationLeadingIcon from './ConversationLeadingIcon';
import type { CronJobStatus } from './ConversationLeadingIcon';
import { useConversationDrag } from './hooks/ConversationDragContext';
import { splitGroupDropId } from './utils/conversationDropTargets';
import type { SplitGroup } from './utils/splitGroupHelpers';

export type SplitGroupRowProps = {
  group: SplitGroup;
  collapsed: boolean;
  tooltipEnabled: boolean;
  batchMode: boolean;
  /** The group's own route is open, or one of its members is open on its own. */
  selected: boolean;
  dimIcon?: boolean;
  isGenerating: (conversation_id: string) => boolean;
  isWaitingConfirmation: (conversation_id: string) => boolean;
  hasUnread: (conversation_id: string) => boolean;
  getJobStatus: (conversation_id: string) => CronJobStatus;
  /** Open the group; `member_id` asks for that column to take the focus. */
  onOpen: (group: SplitGroup, member_id?: string) => void;
  onRemoveMember: (group: SplitGroup, member_id: string) => void;
};

/**
 * The sidebar block for a split group: one row per member — its leading
 * icon and its full title — with a × on each row, sitting where the group's
 * first member used to sit. The block is one unit: clicking any row opens
 * the columns with that member focused, the whole block is the drop target,
 * and × takes that member out of the group and nothing else.
 */
const SplitGroupRow: React.FC<SplitGroupRowProps> = ({
  group,
  collapsed,
  tooltipEnabled,
  batchMode,
  selected,
  dimIcon = false,
  isGenerating,
  isWaitingConfirmation,
  hasUnread,
  getJobStatus,
  onOpen,
  onRemoveMember,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { dropTarget } = useConversationDrag();
  const dropId = splitGroupDropId(group.id);
  const { setNodeRef } = useDroppable({
    id: dropId,
    disabled: batchMode,
    data: { kind: 'split_group', group_id: group.id },
  });
  const dropTargeted = dropTarget?.id === dropId;
  const names = group.members.map((member) => member.name || t('conversation.welcome.newConversation'));
  const label = t('conversation.splitGroup.tooltip', { names: names.join(' · ') });

  const openMember = (member_id: string) => {
    cleanupSiderTooltips();
    if (batchMode) return;
    onOpen(group, member_id);
  };

  const memberRow = (member: TChatConversation) => {
    const name = member.name || t('conversation.welcome.newConversation');
    const unread = hasUnread(member.id) && !isGenerating(member.id) && !isWaitingConfirmation(member.id);
    return (
      <Tooltip key={member.id} content={name} position='right' disabled={!collapsed || isMobile}>
        <div
          role='button'
          tabIndex={batchMode ? -1 : 0}
          aria-disabled={batchMode || undefined}
          aria-label={t('conversation.splitGroup.focusMember', { name })}
          data-testid={`split-group-member-${member.id}`}
          className={classNames(
            'group/member relative flex items-center h-28px rd-6px min-w-0 transition-colors',
            collapsed ? 'justify-center px-0' : 'gap-8px ps-4px pe-6px',
            batchMode ? 'cursor-default' : 'cursor-pointer hover:bg-fill-4'
          )}
          onClick={(event) => {
            event.stopPropagation();
            openMember(member.id);
          }}
          onKeyDown={(event) => {
            if (batchMode) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              openMember(member.id);
            }
          }}
        >
          <span className='size-22px flex items-center justify-center shrink-0 relative'>
            <ConversationLeadingIcon
              conversation={member}
              cronStatus={getJobStatus(member.id)}
              isGenerating={isGenerating(member.id) && !batchMode}
              isWaitingConfirmation={isWaitingConfirmation(member.id) && !batchMode}
              className={dimIcon ? 'opacity-60 group-hover/member:opacity-100' : undefined}
            />
            {unread && (
              <span
                className='absolute -top-1px -start-1px h-6px w-6px rounded-full bg-#2C7FFF shadow-[0_0_0_2px_rgba(44,127,255,0.18)] pointer-events-none'
                data-testid={`split-group-member-unread-${member.id}`}
              />
            )}
          </span>
          {!collapsed && (
            <span
              className='chat-history__item-name flex-1 min-w-0 truncate text-14px font-[500] lh-24px text-t-primary'
              data-testid={`split-group-title-${member.id}`}
            >
              {name}
            </span>
          )}
          {!collapsed && !batchMode && (
            <span
              role='button'
              tabIndex={0}
              aria-label={t('conversation.splitGroup.removeMember', { name })}
              data-testid={`split-group-remove-${member.id}`}
              className={classNames(
                'flex items-center justify-center size-18px rd-4px shrink-0 cursor-pointer text-t-tertiary hover:text-t-primary hover:bg-fill-3 transition-opacity',
                isMobile ? 'opacity-100' : 'opacity-0 group-hover/member:opacity-100 focus-visible:opacity-100'
              )}
              onClick={(event) => {
                event.stopPropagation();
                cleanupSiderTooltips();
                onRemoveMember(group, member.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveMember(group, member.id);
                }
              }}
            >
              <CloseSmall theme='outline' size='12' fill='currentColor' />
            </span>
          )}
        </div>
      </Tooltip>
    );
  };

  return (
    <Tooltip {...getSiderTooltipProps(tooltipEnabled)} content={label} position='right' disabled={!collapsed}>
      <div
        ref={setNodeRef}
        role='group'
        aria-label={label}
        data-testid={`split-group-row-${group.id}`}
        className={classNames(
          'chat-history__item rd-8px flex flex-col gap-1px py-3px group relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0 transition-colors border border-solid',
          collapsed ? 'px-2px items-center' : dimIcon ? 'ps-28px pe-4px' : 'ps-4px pe-4px',
          // A visible container at all times, so the members read as one block.
          selected ? 'border-b-base bg-fill-2' : 'border-b-base bg-fill-1',
          {
            'shadow-[inset_0_0_0_2px_rgb(var(--primary-6))] bg-[rgba(var(--primary-6),0.08)]': dropTargeted,
            'cursor-pointer': !batchMode,
          }
        )}
        onClick={() => {
          cleanupSiderTooltips();
          if (batchMode) return;
          onOpen(group);
        }}
        onKeyDown={(event) => {
          if (batchMode) return;
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onOpen(group);
          }
        }}
      >
        {group.members.map(memberRow)}
      </div>
    </Tooltip>
  );
};

export default SplitGroupRow;
