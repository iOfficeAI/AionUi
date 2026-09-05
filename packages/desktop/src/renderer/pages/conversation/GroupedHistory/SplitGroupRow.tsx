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
 * The sidebar pill for a split group: one leading icon per member, each with
 * its own ×, sitting where the group's first member used to sit. Clicking the
 * pill opens the columns; clicking a member's icon opens them with that
 * column focused; × takes that member out of the group and nothing else.
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

  const memberChip = (member: TChatConversation) => {
    const name = member.name || t('conversation.welcome.newConversation');
    const unread = hasUnread(member.id) && !isGenerating(member.id) && !isWaitingConfirmation(member.id);
    return (
      <span
        key={member.id}
        className={classNames(
          'group/member relative flex items-center rd-6px shrink-0 transition-colors',
          collapsed ? 'size-22px justify-center' : 'h-24px ps-3px pe-2px gap-1px hover:bg-fill-4',
          { 'opacity-60 group-hover:opacity-100': dimIcon }
        )}
        data-testid={`split-group-member-${member.id}`}
      >
        <Tooltip content={name} position='top' disabled={collapsed || isMobile}>
          <span
            role='button'
            tabIndex={0}
            aria-label={t('conversation.splitGroup.focusMember', { name })}
            className='size-22px flex items-center justify-center cursor-pointer'
            onClick={(event) => {
              event.stopPropagation();
              cleanupSiderTooltips();
              onOpen(group, member.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onOpen(group, member.id);
              }
            }}
          >
            <ConversationLeadingIcon
              conversation={member}
              cronStatus={getJobStatus(member.id)}
              isGenerating={isGenerating(member.id) && !batchMode}
              isWaitingConfirmation={isWaitingConfirmation(member.id) && !batchMode}
            />
          </span>
        </Tooltip>
        {unread && (
          <span
            className='absolute top-2px start-2px h-6px w-6px rounded-full bg-#2C7FFF shadow-[0_0_0_2px_rgba(44,127,255,0.18)] pointer-events-none'
            data-testid={`split-group-member-unread-${member.id}`}
          />
        )}
        {!collapsed && !batchMode && (
          <span
            role='button'
            tabIndex={0}
            aria-label={t('conversation.splitGroup.removeMember', { name })}
            data-testid={`split-group-remove-${member.id}`}
            className={classNames(
              'flex items-center justify-center size-16px rd-4px cursor-pointer text-t-tertiary hover:text-t-primary hover:bg-fill-3 transition-opacity',
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
      </span>
    );
  };

  return (
    <Tooltip {...getSiderTooltipProps(tooltipEnabled)} content={label} position='right'>
      <div
        ref={setNodeRef}
        role='button'
        tabIndex={0}
        aria-label={t('conversation.splitGroup.open')}
        data-testid={`split-group-row-${group.id}`}
        className={classNames(
          'chat-history__item h-34px rd-8px flex items-center group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0 transition-colors',
          collapsed ? 'justify-center px-0 flex-wrap gap-1px' : 'justify-start gap-2px pe-8px',
          !collapsed && (dimIcon ? 'ps-30px' : 'ps-6px'),
          {
            'hover:bg-fill-3': !batchMode && !selected && !dropTargeted,
            '!bg-fill-3': selected,
            'shadow-[inset_0_0_0_2px_rgb(var(--primary-6))] bg-[rgba(var(--primary-6),0.08)]': dropTargeted,
          }
        )}
        onClick={() => {
          cleanupSiderTooltips();
          if (batchMode) return;
          onOpen(group);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(group);
          }
        }}
      >
        {group.members.map(memberChip)}
      </div>
    </Tooltip>
  );
};

export default SplitGroupRow;
