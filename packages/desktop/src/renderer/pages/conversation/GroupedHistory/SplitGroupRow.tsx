/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Button, Dropdown, Input, Menu, Modal, Tooltip } from '@arco-design/web-react';
import { CloseSmall, Drag, EditOne, MoreOne } from '@icon-park/react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ConversationLeadingIcon from './ConversationLeadingIcon';
import type { CronJobStatus } from './ConversationLeadingIcon';
import { ConversationRowMenu } from './ConversationRow';
import { isNoHoverPointer } from '@/renderer/pages/conversation/utils/detectPlatform';
import { useConversationDrag } from './hooks/ConversationDragContext';
import type { ConversationRowProps } from './types';
import { splitGroupDropId } from './utils/conversationDropTargets';
import type { SplitGroup } from './utils/splitGroupHelpers';
import { SPLIT_GROUP_NAME_MAX } from './utils/splitGroupHelpers';

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
   * Name the group, or clear its name when the input is blank. Answers whether
   * the write landed. Omitted means the header cannot be renamed.
   */
  onRenameGroup?: (group: SplitGroup, name: string | null) => Promise<boolean>;
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
 * group, and a busy conversation is exactly the one you want to move.
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
  const [engaged, setEngaged] = useState(false);
  const draggable = !batchMode && !collapsed;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: member.id,
    disabled: !draggable,
    data: { kind: 'conversation', conversation_id: member.id },
  });

  const name = member.name || t('conversation.welcome.newConversation');
  /** The row offers a menu only where there is room for one and something to put in it. */
  const menu = rowProps && !batchMode && !collapsed ? rowProps : null;
  // Whether anything here can be revealed by hovering. Width does not answer
  // that — a touch-capable desktop is not "mobile" — and a control that only
  // appears on hover is, without one, a control nobody can reach.
  const canHover = !isMobile && !isNoHoverPointer();
  const swapped = engaged && canHover && !collapsed && !batchMode && !isDragging;
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
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setEngaged(false);
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
      {draggable && !isMobile && (
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          // Only a PointerSensor is registered, so the handle can be grabbed
          // but never driven from the keyboard. Leaving it in the tab order
          // gave keyboard users a stop that does nothing — worse, Enter on it
          // bubbled to the row and opened the conversation. It is a pointer
          // affordance and is now marked as one; the keyboard leaves a group
          // through the remove button in the icon slot or the row's menu.
          tabIndex={-1}
          aria-hidden='true'
          data-testid={`split-group-drag-handle-${member.id}`}
          className={classNames(
            'size-14px flex items-center justify-center shrink-0 text-t-tertiary transition-opacity',
            isDragging ? 'opacity-100 cursor-grabbing' : engaged ? 'opacity-100 cursor-grab' : 'opacity-0 cursor-grab'
          )}
          style={{ lineHeight: 0, touchAction: 'none' }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Drag theme='outline' size='12' fill='currentColor' />
        </span>
      )}
      <span className='size-22px flex items-center justify-center shrink-0 relative'>
        <span
          className={classNames('flex items-center justify-center size-full', swapped && 'opacity-0')}
          aria-hidden={swapped}
        >
          <ConversationLeadingIcon
            conversation={member}
            cronStatus={jobStatus}
            isGenerating={isGenerating && !batchMode}
            isWaitingConfirmation={isWaitingConfirmation && !batchMode}
            className={dimIcon ? 'opacity-60 group-hover/member:opacity-100' : undefined}
          />
        </span>
        {unread && !swapped && (
          <span
            className='absolute -top-1px -start-1px h-6px w-6px rounded-full bg-#2C7FFF shadow-[0_0_0_2px_rgba(44,127,255,0.18)] pointer-events-none'
            data-testid={`split-group-member-unread-${member.id}`}
          />
        )}
        {swapped &&
          removeButton(
            'absolute inset-0 flex items-center justify-center rd-4px cursor-pointer text-t-secondary hover:text-t-primary hover:bg-fill-3 transition-colors'
          )}
      </span>
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
 * The line that names the block: the group's own name when it has one, its
 * size when it does not, and both once it is named — "Research · 3" says which
 * split this is and how much of it there is in the same breath.
 *
 * Renaming is offered the two ways a name is usually changed: a pencil that
 * appears with the pointer (a touch screen has no pointer, so there it stays)
 * and the header's own right-click menu.
 */
const SplitGroupHeader: React.FC<{
  group: SplitGroup;
  isMobile: boolean;
  onRename?: () => void;
}> = ({ group, isMobile, onRename }) => {
  const { t } = useTranslation();
  const count = group.members.length;
  // Width says nothing about whether the pointer can hover; ask that directly.
  const alwaysVisible = isMobile || isNoHoverPointer();
  const label = group.name
    ? t('conversation.splitGroup.blockLabelNamed', { name: group.name, count })
    : t('conversation.splitGroup.blockLabel', { count });

  const line = (
    <div
      data-testid={`split-group-label-${group.id}`}
      className='group/header flex items-center gap-4px h-16px ps-4px pe-2px text-11px font-[600] lh-16px text-t-tertiary tracking-[0.04em] select-none shrink-0 min-w-0'
    >
      <span className='truncate min-w-0'>{label}</span>
      {onRename && (
        <Button
          type='text'
          size='mini'
          aria-label={t('conversation.splitGroup.rename')}
          data-testid={`split-group-rename-${group.id}`}
          icon={<EditOne theme='outline' size='11' fill='currentColor' />}
          className={classNames(
            '!size-14px !min-w-14px !p-0 !rd-4px shrink-0 flex items-center justify-center !text-t-tertiary hover:!text-t-primary transition-opacity',
            // Revealed by hover where there is a hover to reveal it, pinned
            // open where there is not — a touch-capable desktop is not
            // "mobile", and a control nobody can uncover is a control nobody
            // has.
            alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100'
          )}
          onClick={(event) => {
            event.stopPropagation();
            cleanupSiderTooltips();
            onRename();
          }}
        />
      )}
    </div>
  );

  if (!onRename) return line;
  return (
    <Dropdown
      droplist={
        <Menu onClickMenuItem={() => onRename()}>
          <Menu.Item key='rename'>
            <div className='flex items-center gap-8px'>
              <EditOne theme='outline' size='14' />
              <span>{t('conversation.splitGroup.rename')}</span>
            </div>
          </Menu.Item>
        </Menu>
      }
      trigger='contextMenu'
      position='br'
      getPopupContainer={() => document.body}
    >
      {line}
    </Dropdown>
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
  onRenameGroup,
  getMemberRowProps,
}) => {
  const { t } = useTranslation();
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
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

  const block = (
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
          <SplitGroupHeader
            group={group}
            isMobile={isMobile}
            onRename={onRenameGroup && (() => setRenameDraft(group.name ?? ''))}
          />
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

  if (!onRenameGroup) return block;

  /**
   * The name is only forgotten once it is stored. A refused write leaves the
   * box open with what was typed still in it — the write path has already said
   * what went wrong, and asking someone to type it again would be the second
   * thing to go wrong.
   */
  const submitRename = async (): Promise<void> => {
    if (renameDraft === null || renameSaving) return;
    setRenameSaving(true);
    try {
      if (await onRenameGroup(group, renameDraft)) setRenameDraft(null);
    } finally {
      setRenameSaving(false);
    }
  };

  return (
    <>
      {block}
      <Modal
        visible={renameDraft !== null}
        title={t('conversation.splitGroup.rename')}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={renameSaving}
        onOk={() => void submitRename()}
        onCancel={() => {
          if (renameSaving) return;
          setRenameDraft(null);
        }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameDraft ?? ''}
          maxLength={SPLIT_GROUP_NAME_MAX}
          showWordLimit
          disabled={renameSaving}
          placeholder={t('conversation.splitGroup.renamePlaceholder')}
          data-testid={`split-group-rename-input-${group.id}`}
          onChange={setRenameDraft}
          onPressEnter={(event: React.KeyboardEvent<HTMLInputElement>) => {
            // The Enter that confirms an IME composition is not the Enter that
            // confirms the name; acting on it would save half a word and close
            // the box under someone mid-sentence.
            if (event.nativeEvent.isComposing) return;
            void submitRename();
          }}
        />
      </Modal>
    </>
  );
};

export default SplitGroupRow;
