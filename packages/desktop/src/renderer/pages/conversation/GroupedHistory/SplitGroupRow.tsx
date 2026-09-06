/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Button, Dropdown, Tooltip } from '@arco-design/web-react';
import { CloseSmall, Drag, MoreOne } from '@icon-park/react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ConversationLeadingIcon from './ConversationLeadingIcon';
import type { CronJobStatus } from './ConversationLeadingIcon';
import { ConversationRowMenu } from './ConversationRow';
import { useConversationDrag } from './hooks/ConversationDragContext';
import { useCanHover } from './hooks/useCanHover';
import type { ConversationRowProps } from './types';
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
  /**
   * The props a member's row would have as a plain sidebar row, so its
   * right-click menu offers the same actions. Omitted means the member rows
   * have no menu.
   */
  getMemberRowProps?: (member: TChatConversation) => ConversationRowProps;
};

type SplitGroupMemberRowProps = {
  member: TChatConversation;
  collapsed: boolean;
  dimIcon: boolean;
  batchMode: boolean;
  isMobile: boolean;
  isGenerating: boolean;
  isWaitingConfirmation: boolean;
  unread: boolean;
  jobStatus: CronJobStatus;
  onOpen: (member_id: string) => void;
  onRemove: (member_id: string) => void;
  rowProps?: ConversationRowProps;
};

/**
 * One member of a split group, laid out like a browser tab: a grab handle of
 * its own, then the slot that carries the conversation's mark, then its title.
 *
 * The mark slot is the remove button while the pointer is on the row (or the
 * keyboard is in it) and the conversation's icon — or its activity spinner —
 * the rest of the time, the way a browser tab swaps its favicon for a x. That
 * slot is the only remove button on a pointer device; a touch screen has no
 * hover, so there it keeps a permanent place at the end of the row instead.
 *
 * The handle never shares a slot with anything, so a row that is working is
 * still grabbable — dragging a member out of the block is how it leaves the
 * group, and a busy conversation is exactly the one you want to move. It is
 * there in every layout the row has: beside the mark when the sidebar is
 * expanded, over the mark when the rail is collapsed (the way a plain row's
 * handle covers its icon), and regardless of how narrow the window is. The
 * only thing that takes it away is a pointer that cannot hover, because a
 * hover-revealed handle nobody can see would only steal the scroll gesture.
 */
const SplitGroupMemberRow: React.FC<SplitGroupMemberRowProps> = ({
  member,
  collapsed,
  dimIcon,
  batchMode,
  isMobile,
  isGenerating,
  isWaitingConfirmation,
  unread,
  jobStatus,
  onOpen,
  onRemove,
  rowProps,
}) => {
  const { t } = useTranslation();
  // Tracked apart and combined on read. Sharing one flag meant the pointer
  // leaving the row hid a control the keyboard was still inside — and, for the
  // remove button in the leading slot, unmounted the very element that held
  // the focus.
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const engaged = hovered || focusWithin;
  const canHover = useCanHover();
  // Width never decides this. The collapsed rail and a narrow window are
  // layouts the handle has to fit into, not reasons to take it away.
  const draggable = !batchMode && canHover;
  const { listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: member.id,
    disabled: !draggable,
    data: { kind: 'conversation', conversation_id: member.id },
  });

  const name = member.name || t('conversation.welcome.newConversation');
  /** The row offers a menu only where there is room for one and something to put in it. */
  const menu = rowProps && !batchMode && !collapsed ? rowProps : null;
  const swapped = engaged && canHover && !collapsed && !batchMode && !isDragging;
  /** In the rail the handle has no slot of its own, so it covers the mark while the pointer is on the row. */
  const handleOverMark = draggable && collapsed;
  const markHidden = swapped || (handleOverMark && (engaged || isDragging));
  const removeLabel = t('conversation.splitGroup.removeMember', { name });

  const remove = () => {
    cleanupSiderTooltips();
    onRemove(member.id);
  };

  const removeButton = (className: string) => (
    <Button
      type='text'
      size='mini'
      aria-label={removeLabel}
      data-testid={`split-group-remove-${member.id}`}
      icon={<CloseSmall theme='outline' size='12' fill='currentColor' />}
      className={classNames('!p-0 !min-w-0 flex items-center justify-center', className)}
      onClick={(event) => {
        event.stopPropagation();
        remove();
      }}
    />
  );

  // Only a PointerSensor is registered, so the handle can be grabbed but never
  // driven from the keyboard; it is a pointer affordance and is marked as one —
  // no tab stop, no role, hidden from assistive tech. The keyboard leaves a
  // group through the remove button in the icon slot or the row's menu.
  const dragHandle = (className: string, onClick?: (event: React.MouseEvent) => void) => (
    <span
      ref={setActivatorNodeRef}
      {...listeners}
      aria-hidden='true'
      data-testid={`split-group-drag-handle-${member.id}`}
      className={classNames(
        'flex items-center justify-center shrink-0 text-t-tertiary transition-opacity',
        isDragging ? 'opacity-100 cursor-grabbing' : engaged ? 'opacity-100 cursor-grab' : 'opacity-0 cursor-grab',
        className
      )}
      style={{ lineHeight: 0, touchAction: 'none' }}
      onClick={onClick}
    >
      <Drag theme='outline' size='12' fill='currentColor' />
    </span>
  );

  const mark = (
    <>
      <span
        className={classNames('flex items-center justify-center size-full', markHidden && 'opacity-0')}
        aria-hidden={markHidden}
      >
        <ConversationLeadingIcon
          conversation={member}
          cronStatus={jobStatus}
          isGenerating={isGenerating && !batchMode}
          isWaitingConfirmation={isWaitingConfirmation && !batchMode}
          className={dimIcon ? 'opacity-60 group-hover/member:opacity-100' : undefined}
        />
      </span>
      {unread && !markHidden && (
        <span
          className='absolute -top-1px -start-1px h-6px w-6px rounded-full bg-#2C7FFF shadow-[0_0_0_2px_rgba(44,127,255,0.18)] pointer-events-none'
          data-testid={`split-group-member-unread-${member.id}`}
        />
      )}
      {swapped &&
        removeButton(
          'absolute inset-0 flex items-center justify-center rd-4px text-t-secondary hover:!text-t-primary transition-colors'
        )}
      {/* The rail's handle sits over the mark, inside the opener. A click that
          is not a drag falls through to the opener and opens the member: the
          handle covers the only thing there is to click, so it cannot eat the
          click the way the expanded row's handle does. */}
      {handleOverMark && dragHandle('absolute inset-0 rd-4px bg-fill-3')}
    </>
  );

  // The collapsed rail has no title, no remove button and no menu — the mark
  // is all there is, so the mark is the control. Expanded, the title is the
  // control and this stays a plain slot, because a button holding the remove
  // button would be a control inside a control again.
  const leadingSlot =
    collapsed && !batchMode ? (
      <Button
        type='text'
        size='mini'
        aria-label={t('conversation.splitGroup.focusMember', { name })}
        data-testid={`split-group-open-${member.id}`}
        className='!size-22px !min-w-22px !p-0 !bg-transparent hover:!bg-transparent shrink-0 relative flex items-center justify-center'
        onClick={(event) => {
          event.stopPropagation();
          cleanupSiderTooltips();
          onOpen(member.id);
        }}
      >
        {mark}
      </Button>
    ) : (
      <span className='size-22px flex items-center justify-center shrink-0 relative'>{mark}</span>
    );

  const row = (
    <div
      ref={setNodeRef}
      data-testid={`split-group-member-${member.id}`}
      style={isDragging ? { opacity: 0.4 } : undefined}
      className={classNames(
        'group/member relative flex items-center h-28px rd-6px min-w-0 transition-colors',
        collapsed ? 'justify-center px-0' : 'gap-6px ps-2px pe-6px',
        // A primary wash, not a grey fill: over the block's own tint a
        // heavier grey would read as a second container.
        batchMode ? 'cursor-default' : 'cursor-pointer hover:bg-[rgba(var(--primary-6),0.06)]'
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocusWithin(false);
      }}
      // A pointer shortcut over the whole row, redundant with the control
      // inside it: the keyboard and assistive tech reach the member through
      // that control, so the row itself is not one. It used to be — a
      // role='button' row with focusable buttons inside it, which is a control
      // nested in a control, and neither ARIA nor a screen reader has a way to
      // read that.
      onClick={(event) => {
        event.stopPropagation();
        cleanupSiderTooltips();
        if (batchMode) return;
        onOpen(member.id);
      }}
    >
      {draggable && !collapsed && dragHandle('size-14px', (event) => event.stopPropagation())}
      {leadingSlot}
      {!collapsed &&
        (batchMode ? (
          <span
            className='chat-history__item-name flex-1 min-w-0 truncate text-14px font-[500] lh-24px text-t-primary'
            data-testid={`split-group-title-${member.id}`}
          >
            {name}
          </span>
        ) : (
          <Button
            type='text'
            size='mini'
            aria-label={t('conversation.splitGroup.focusMember', { name })}
            data-testid={`split-group-title-${member.id}`}
            className='chat-history__item-name flex-1 min-w-0 !h-24px !p-0 !bg-transparent hover:!bg-transparent !text-t-primary !text-14px !font-[500] !lh-24px text-start'
            onClick={(event) => {
              event.stopPropagation();
              cleanupSiderTooltips();
              onOpen(member.id);
            }}
          >
            <span className='block w-full truncate text-start'>{name}</span>
          </Button>
        ))}
      {!collapsed && !batchMode && !canHover && (
        <span className='size-18px flex items-center justify-center shrink-0'>
          {removeButton('!size-18px !rd-4px !text-t-tertiary hover:!text-t-primary')}
        </span>
      )}
      {/* The same "…" a plain row carries. Right-clicking the row opens the
          same menu, but that gesture is pointer-only on macOS, and nothing on
          the row said a menu existed at all — the actions behind it were out
          of reach for anyone not using a mouse. */}
      {menu && (
        <Button
          type='text'
          size='mini'
          aria-label={t('conversation.splitGroup.memberActions', { name })}
          aria-haspopup='menu'
          data-testid={`split-group-member-menu-${member.id}`}
          icon={<MoreOne theme='outline' size='14' fill='currentColor' />}
          className={classNames(
            '!size-18px !min-w-18px !p-0 !rd-4px shrink-0 flex items-center justify-center !text-t-tertiary hover:!text-t-primary transition-opacity',
            // `engaged` is set by the row's own focus handler, which fires when
            // any child takes focus, so tabbing here reveals it rather than
            // landing on an invisible stop.
            !canHover || menu.menuVisible || engaged ? 'opacity-100' : 'opacity-0'
          )}
          onClick={(event) => {
            event.stopPropagation();
            cleanupSiderTooltips();
            menu.onOpenMenu(member);
          }}
        />
      )}
    </div>
  );

  // The two wrappers never both apply: the tooltip only speaks for a row whose
  // title is hidden by the collapsed rail, and that rail has no room for a
  // menu. Nesting one Arco trigger directly inside another stops the inner one
  // from ever opening, so the row picks exactly one.
  if (menu) {
    return (
      <Dropdown
        droplist={<ConversationRowMenu {...menu} onRemoveFromSplit={() => onRemove(member.id)} />}
        trigger='contextMenu'
        position='br'
        popupVisible={menu.menuVisible}
        onVisibleChange={(visible) => menu.onMenuVisibleChange(member.id, visible)}
        getPopupContainer={() => document.body}
        unmountOnExit={false}
      >
        {row}
      </Dropdown>
    );
  }
  return (
    <Tooltip content={name} position='right' disabled={!collapsed || isMobile}>
      {row}
    </Tooltip>
  );
};

/**
 * The sidebar block for a split group: one row per member — its grab handle,
 * its leading icon and its full title — sitting where the group's first member
 * used to sit. The block is one unit: clicking any row opens the columns with
 * that member focused, the whole block is the drop target for a conversation
 * joining the group, and a member leaves it through the remove button in its
 * icon slot, its right-click menu, or by being dragged out.
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
  getMemberRowProps,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { activeConversation, dropTarget } = useConversationDrag();
  const dropId = splitGroupDropId(group.id);
  const { setNodeRef } = useDroppable({
    id: dropId,
    disabled: batchMode,
    data: { kind: 'split_group', group_id: group.id },
  });
  // One of this block's own members is being dragged: releasing here changes
  // nothing, so the block must not offer itself as a target.
  const draggingOwnMember = group.members.some((member) => member.id === activeConversation?.id);
  const dropTargeted = dropTarget?.id === dropId && !draggingOwnMember;
  const names = group.members.map((member) => member.name || t('conversation.welcome.newConversation'));
  const label = t('conversation.splitGroup.tooltip', { names: names.join(' · ') });

  return (
    <Tooltip {...getSiderTooltipProps(tooltipEnabled)} content={label} position='right' disabled={!collapsed}>
      <div
        ref={setNodeRef}
        role='group'
        aria-label={label}
        data-testid={`split-group-row-${group.id}`}
        className={classNames(
          'chat-history__item rd-8px flex flex-col gap-1px py-3px group relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0 transition-colors border border-solid border-[var(--border-base)]',
          collapsed ? 'px-2px items-center' : dimIcon ? 'ps-30px pe-4px' : 'ps-6px pe-4px',
          // The container is always tinted, so the members read as one block
          // rather than as loose rows; being the open group only deepens the
          // same wash instead of boxing it in.
          selected ? 'bg-[rgba(var(--primary-6),0.10)]' : 'bg-fill-2',
          {
            'shadow-[inset_0_0_0_2px_rgb(var(--primary-6))] bg-[rgba(var(--primary-6),0.08)]': dropTargeted,
            'cursor-pointer': !batchMode,
          }
        )}
        onClick={(event) => {
          // A member's menu is portalled to the body but still bubbles through
          // this block in the React tree; a click inside it is not a click on
          // the block, and must not open the group behind the menu.
          if (!event.currentTarget.contains(event.target as Node)) return;
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
        {/* The accent bar: the one mark that says "these belong together",
            read before any of the text is. */}
        <span aria-hidden='true' className='absolute inset-y-0 start-0 w-2px bg-[rgba(var(--primary-6),1)]' />
        {!collapsed && (
          <div
            data-testid={`split-group-label-${group.id}`}
            className='flex items-center h-16px ps-4px text-11px font-[600] lh-16px text-t-tertiary tracking-[0.04em] select-none shrink-0'
          >
            {t('conversation.splitGroup.blockLabel', { count: group.members.length })}
          </div>
        )}
        {/* Indented under the header, so the block has an inside. */}
        <div className={classNames('flex flex-col gap-1px min-w-0', collapsed ? 'items-center' : 'ps-4px')}>
          {group.members.map((member) => (
            <SplitGroupMemberRow
              key={member.id}
              member={member}
              collapsed={collapsed}
              dimIcon={dimIcon}
              batchMode={batchMode}
              isMobile={isMobile}
              isGenerating={isGenerating(member.id)}
              isWaitingConfirmation={isWaitingConfirmation(member.id)}
              unread={hasUnread(member.id) && !isGenerating(member.id) && !isWaitingConfirmation(member.id)}
              jobStatus={getJobStatus(member.id)}
              onOpen={(member_id) => onOpen(group, member_id)}
              onRemove={(member_id) => onRemoveMember(group, member_id)}
              rowProps={getMemberRowProps?.(member)}
            />
          ))}
        </div>
      </div>
    </Tooltip>
  );
};

export default SplitGroupRow;
