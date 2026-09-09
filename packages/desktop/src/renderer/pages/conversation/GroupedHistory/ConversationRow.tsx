/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Checkbox, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { CloseSmall, EditOne, Export, FolderClose, Inbox, MoreOne, Pushpin, Timer } from '@icon-park/react';
import ForkBranchIcon from '@renderer/components/base/ForkBranchIcon';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

import ConversationLeadingIcon from './ConversationLeadingIcon';
import type { TChatConversation } from '@/common/config/storage';
import type { ConversationRowProps } from './types';
import { isConversationPinned } from './utils/groupingHelpers';

/**
 * The actions a conversation row offers, in the order they are offered. Shared
 * with the rows inside a split-group block, which reach it by right-click and
 * get one extra item — leaving the group — that a plain row has no use for.
 */
export const ConversationRowMenu: React.FC<
  Pick<
    ConversationRowProps,
    | 'conversation'
    | 'isManualUnread'
    | 'onTogglePin'
    | 'onToggleManualUnread'
    | 'onEditStart'
    | 'onCreateCronTask'
    | 'onArchive'
    | 'onExport'
  > & {
    /** Only supplied for a row that is a member of a split group. */
    onRemoveFromSplit?: (conversation: TChatConversation) => void;
  }
> = ({
  conversation,
  isManualUnread,
  onTogglePin,
  onToggleManualUnread,
  onEditStart,
  onCreateCronTask,
  onArchive,
  onExport,
  onRemoveFromSplit,
}) => {
  const { t } = useTranslation();
  const isPinned = isConversationPinned(conversation);
  return (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'pin') {
          onTogglePin(conversation);
          return;
        }
        if (key === 'toggleManualUnread') {
          onToggleManualUnread(conversation);
          return;
        }
        if (key === 'rename') {
          onEditStart(conversation);
          return;
        }
        if (key === 'createCronTask') {
          onCreateCronTask(conversation);
          return;
        }
        if (key === 'removeFromSplit') {
          onRemoveFromSplit?.(conversation);
          return;
        }
        if (key === 'export') {
          onExport?.(conversation);
          return;
        }
        if (key === 'archive') {
          onArchive(conversation);
        }
      }}
    >
      <Menu.Item key='pin'>
        <div className='flex items-center gap-8px'>
          <Pushpin theme='outline' size='14' />
          <span>{isPinned ? t('conversation.history.unpin') : t('conversation.history.pin')}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='toggleManualUnread'>
        <div className='flex items-center gap-8px'>
          <Inbox theme='outline' size='14' />
          <span>{isManualUnread ? t('conversation.history.markAsRead') : t('conversation.history.markAsUnread')}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='rename'>
        <div className='flex items-center gap-8px'>
          <EditOne theme='outline' size='14' />
          <span>{t('conversation.history.rename')}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='createCronTask'>
        <div className='flex items-center gap-8px'>
          <Timer theme='outline' size='14' />
          <span>{t('conversation.history.createCronTask')}</span>
        </div>
      </Menu.Item>
      {onRemoveFromSplit && (
        <Menu.Item key='removeFromSplit'>
          <div className='flex items-center gap-8px'>
            <CloseSmall theme='outline' size='14' />
            <span>{t('conversation.splitGroup.removeFromSplit')}</span>
          </div>
        </Menu.Item>
      )}
      {onExport && (
        <Menu.Item key='export'>
          <div className='flex items-center gap-8px'>
            <Export theme='outline' size='14' />
            <span>{t('conversation.history.export')}</span>
          </div>
        </Menu.Item>
      )}
      <Menu.Item key='archive'>
        <div className='flex items-center gap-8px'>
          <FolderClose theme='outline' size='14' />
          <span>{t('conversation.history.archive')}</span>
        </div>
      </Menu.Item>
    </Menu>
  );
};

const ConversationRow: React.FC<ConversationRowProps> = (props) => {
  const {
    conversation,
    isGenerating,
    isWaitingConfirmation,
    hasUnread,
    collapsed,
    tooltipEnabled,
    batchMode,
    checked,
    selected,
    menuVisible,
    dimIcon = false,
    dragHandle,
    dropTargeted = false,
  } = props;
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const {
    onToggleChecked,
    onConversationClick,
    onOpenMenu,
    onMenuVisibleChange,
    onEditStart,
    onCreateCronTask,
    onArchive,
    onExport,
    onTogglePin,
    onToggleManualUnread,
    isManualUnread,
    getJobStatus,
  } = props;
  const { t } = useTranslation();
  const isPinned = isConversationPinned(conversation);
  // Fork-lineage badge: present only on forked conversations (extra.fork is
  // server-minted by the fork API). Parent name resolves from the loaded
  // sidebar list; a deleted/unloaded parent degrades to the generic tip.
  const forkLineage = (conversation.extra as { fork?: { parent_conversation_id?: string } } | undefined)?.fork;
  const forkParentName = forkLineage?.parent_conversation_id
    ? props.resolveConversationName?.(forkLineage.parent_conversation_id)
    : undefined;
  const cronStatus = getJobStatus(conversation.id);
  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  const inlineNameTooltipEnabled = !collapsed && !isMobile && !!conversation.name;

  // Hovering reveals an overlay on the leading icon — the drag handle when the
  // row is draggable, otherwise a pushpin marker on pinned rows. The resting
  // icon fades on hover so the overlay reads cleanly.
  //
  // A busy row is draggable like any other. The activity spinner used to take
  // this slot and suppress the handle outright, so a conversation could not be
  // grabbed while it was working — the one time you most want to move it. The
  // spinner keeps the resting slot and the handle keeps the hover slot; the
  // badge below carries the "still working" signal while the handle is up, so
  // the two never contend for the same place.
  //
  // Whether the row is a drag source at all is the list's decision (it asks the
  // pointer, not the viewport); a narrow window still gets the overlay, so a
  // handle it was handed is never left with nowhere to show.
  const showLeadingOverlay = !batchMode;
  const leadingOverlay = dragHandle ?? (isPinned ? <Pushpin theme='outline' size='14' /> : null);
  const leadingFade = showLeadingOverlay && leadingOverlay ? 'group-hover:opacity-0 transition-opacity' : undefined;

  const handleRowClick = () => {
    cleanupSiderTooltips();
    if (batchMode) {
      onToggleChecked(conversation);
      return;
    }
    onConversationClick(conversation);
  };

  const handleRowContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    cleanupSiderTooltips();
    if (batchMode) {
      return;
    }
    onOpenMenu(conversation);
  };

  // Waiting on the user takes visual precedence over the generating spinner: a
  // paused turn still streams frames that mark it "generating", so without this
  // the distinct icon would never win.
  const showWaitingConfirmation = isWaitingConfirmation && !batchMode;

  /** The row is working, so the handle covers its spinner while the pointer is on it. */
  const busy = (isGenerating || isWaitingConfirmation) && !batchMode;

  const renderCompletionUnreadDot = () => {
    if (batchMode || !hasUnread || isGenerating || isWaitingConfirmation) {
      return null;
    }

    return (
      <span className='absolute end-8px top-1/2 -translate-y-1/2 flex items-center justify-center group-hover:hidden'>
        <span className='h-8px w-8px rounded-full bg-#2C7FFF shadow-[0_0_0_2px_rgba(44,127,255,0.18)]' />
      </span>
    );
  };

  return (
    <Tooltip
      key={conversation.id}
      {...siderTooltipProps}
      content={conversation.name || t('conversation.welcome.newConversation')}
      position='right'
    >
      <div
        id={'c-' + conversation.id}
        className={classNames(
          'chat-history__item h-34px rd-8px flex items-center group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0 transition-colors',
          collapsed ? 'justify-center px-0' : 'justify-start gap-8px pe-16px',
          // dimIcon means this row sits inside a project/cron parent — visually indent the row content while keeping the bg full-width
          !collapsed && (dimIcon ? 'ps-34px' : 'ps-10px'),
          {
            'hover:bg-fill-2': !batchMode && !selected && !dropTargeted,
            // The open conversation is marked by a light primary wash and a
            // hairline in the border token, drawn as an inset shadow so the
            // row keeps its exact size. The solid fill this replaces read as a
            // black slab against the sidebar.
            'bg-[rgba(var(--primary-6),0.08)] shadow-[inset_0_0_0_1px_var(--border-base)]': selected,
            'bg-[rgba(var(--primary-6),0.08)]': batchMode && checked,
            // A dragged row would fuse with this one on release.
            'shadow-[inset_0_0_0_2px_rgb(var(--primary-6))] bg-[rgba(var(--primary-6),0.08)]': dropTargeted,
          }
        )}
        onClick={handleRowClick}
        onContextMenu={handleRowContextMenu}
      >
        {batchMode && (
          <span
            className='me-8px flex-center'
            onClick={(event) => {
              event.stopPropagation();
              onToggleChecked(conversation);
            }}
          >
            <Checkbox checked={checked} />
          </span>
        )}
        <span className='size-22px flex items-center justify-center shrink-0 relative'>
          <ConversationLeadingIcon
            conversation={conversation}
            cronStatus={cronStatus}
            isGenerating={isGenerating && !batchMode}
            isWaitingConfirmation={showWaitingConfirmation}
            className={leadingFade}
          />
          {showLeadingOverlay && busy && (
            <span
              aria-hidden='true'
              data-testid={`conversation-busy-badge-${conversation.id}`}
              className='absolute -top-2px -end-2px z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none'
            >
              <span className='block size-6px rounded-full bg-[rgba(var(--primary-6),1)] animate-pulse' />
            </span>
          )}
          {showLeadingOverlay &&
            leadingOverlay &&
            (dragHandle ?? (
              <span
                className='absolute inset-0 flex-center text-t-secondary pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity'
                style={{ lineHeight: 0 }}
              >
                {leadingOverlay}
              </span>
            ))}
        </span>
        <FlexFullContainer className='h-24px min-w-0 flex-1 collapsed-hidden'>
          <Tooltip
            content={conversation.name}
            disabled={!inlineNameTooltipEnabled}
            trigger='hover'
            popupVisible={inlineNameTooltipEnabled ? undefined : false}
            unmountOnExit
            popupHoverStay={false}
            position='top'
          >
            <div className='chat-history__item-name overflow-hidden text-ellipsis flex items-center gap-4px w-full text-14px font-[500] lh-24px whitespace-nowrap min-w-0 text-t-primary'>
              <span className='block overflow-hidden text-ellipsis whitespace-nowrap min-w-0'>{conversation.name}</span>
              {forkLineage && (
                <Tooltip
                  content={
                    forkParentName
                      ? t('conversation.history.forkedFrom', { name: forkParentName })
                      : t('conversation.history.forkedConversation')
                  }
                  position='top'
                >
                  <span className='flex-shrink-0 line-height-0 text-t-tertiary' data-testid='conversation-fork-badge'>
                    <ForkBranchIcon size={12} />
                  </span>
                </Tooltip>
              )}
            </div>
          </Tooltip>
        </FlexFullContainer>

        {renderCompletionUnreadDot()}
        {!batchMode && (
          <div
            className={classNames(
              'absolute end-8px top-1/2 -translate-y-1/2 items-center justify-end !collapsed-hidden',
              {
                flex: isMobile || menuVisible,
                'hidden group-hover:flex': !isMobile && !menuVisible,
              }
            )}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Dropdown
              droplist={<ConversationRowMenu {...props} />}
              trigger='click'
              position='br'
              popupVisible={menuVisible}
              onVisibleChange={(visible) => onMenuVisibleChange(conversation.id, visible)}
              getPopupContainer={() => document.body}
              unmountOnExit={false}
            >
              <span
                data-testid={`conversation-row-menu-${conversation.id}`}
                className={classNames(
                  'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                  {
                    flex: isMobile || menuVisible,
                    'hidden group-hover:flex': !isMobile && !menuVisible,
                  }
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMenu(conversation);
                }}
              >
                <MoreOne theme='outline' size='14' fill='currentColor' className='block leading-none' />
              </span>
            </Dropdown>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default ConversationRow;
