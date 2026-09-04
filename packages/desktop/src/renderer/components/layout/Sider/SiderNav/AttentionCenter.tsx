/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Button, Empty, Popover, Tooltip } from '@arco-design/web-react';
import { Check, Remind } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { useConversationHistoryContext } from '@renderer/hooks/context/ConversationHistoryContext';
import { blurActiveElement } from '@renderer/utils/ui/focus';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

type AttentionCenterProps = {
  isMobile: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onSessionClick?: () => void;
};

const AttentionCenter: React.FC<AttentionCenterProps> = ({
  isMobile,
  collapsed,
  siderTooltipProps,
  onSessionClick,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const {
    conversations,
    hasCompletionUnread,
    clearCompletionUnread,
    isManualUnread,
    clearManualUnread,
    setActiveConversation,
  } = useConversationHistoryContext();

  const attentionItems = useMemo(
    () =>
      conversations
        .filter((conversation) => hasCompletionUnread(conversation.id) || isManualUnread(conversation.id))
        .sort((left, right) => right.modified_at - left.modified_at),
    [conversations, hasCompletionUnread, isManualUnread]
  );

  const markAsRead = (conversationId: string) => {
    clearCompletionUnread(conversationId);
    clearManualUnread(conversationId);
  };

  const handleOpenConversation = (conversationId: string) => {
    markAsRead(conversationId);
    setActiveConversation(conversationId);
    setVisible(false);
    blurActiveElement();
    void navigate(`/conversation/${conversationId}`);
    onSessionClick?.();
  };

  const handleMarkAllAsRead = () => {
    attentionItems.forEach((conversation) => markAsRead(conversation.id));
  };

  const content = (
    <div className='w-360px max-w-[calc(100vw-24px)]'>
      <div className='flex items-center justify-between gap-12px px-4px pb-10px border-b border-b-solid border-[var(--color-border-2)]'>
        <div>
          <div className='text-15px font-600 text-t-primary'>{t('conversation.attentionCenter.title')}</div>
          <div className='mt-2px text-12px text-t-tertiary'>
            {t('conversation.attentionCenter.count', { count: attentionItems.length })}
          </div>
        </div>
        {attentionItems.length > 0 && (
          <Button type='text' size='mini' icon={<Check theme='outline' size='14' />} onClick={handleMarkAllAsRead}>
            {t('conversation.attentionCenter.markAllAsRead')}
          </Button>
        )}
      </div>
      <div className='max-h-420px overflow-y-auto py-6px'>
        {attentionItems.length === 0 ? (
          <Empty className='py-28px' description={t('conversation.attentionCenter.empty')} />
        ) : (
          attentionItems.map((conversation) => {
            const completionUnread = hasCompletionUnread(conversation.id);
            return (
              <div
                key={conversation.id}
                className='group flex items-center gap-10px px-10px py-9px rd-8px cursor-pointer hover:bg-fill-2 active:bg-fill-3'
                onClick={() => handleOpenConversation(conversation.id)}
              >
                <span
                  className={classNames('size-8px rd-full shrink-0', completionUnread ? 'bg-primary' : 'bg-warning')}
                />
                <div className='min-w-0 flex-1'>
                  <div className='truncate text-14px text-t-primary font-500'>{conversation.name}</div>
                  <div className='mt-2px text-12px text-t-tertiary'>
                    {completionUnread
                      ? t('conversation.attentionCenter.completed')
                      : t('conversation.attentionCenter.manualUnread')}
                  </div>
                </div>
                <Button
                  type='text'
                  size='mini'
                  className='opacity-0 group-hover:opacity-100'
                  onClick={(event) => {
                    event.stopPropagation();
                    markAsRead(conversation.id);
                  }}
                >
                  {t('conversation.history.markAsRead')}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <Popover
      trigger='click'
      position={collapsed ? 'right' : 'bottom'}
      content={content}
      popupVisible={visible}
      onVisibleChange={setVisible}
      unmountOnExit
    >
      <Tooltip {...siderTooltipProps} content={t('conversation.attentionCenter.tooltip')} position='right'>
        <span className={classNames('relative inline-flex', collapsed && 'w-full')}>
          <Button
            type='text'
            className={classNames(
              '!p-0 !min-w-0 flex items-center justify-center text-t-secondary hover:!text-t-primary',
              collapsed ? '!w-full !h-34px !rd-8px' : '!size-26px !rd-6px',
              isMobile && 'sider-action-icon-btn-mobile'
            )}
            icon={<Remind theme='outline' size='15' />}
          />
          {attentionItems.length > 0 && (
            <span
              className={classNames(
                'absolute pointer-events-none flex items-center justify-center bg-[var(--color-primary-light-1)] text-[var(--color-primary-6)] border border-solid border-[var(--color-primary-light-3)] font-600',
                collapsed
                  ? 'top-3px right-3px size-5px rd-full'
                  : '-top-2px -right-6px min-w-12px h-12px px-2px rd-6px text-8px leading-none'
              )}
            >
              {!collapsed && (attentionItems.length > 99 ? '99+' : attentionItems.length)}
            </span>
          )}
        </span>
      </Tooltip>
    </Popover>
  );
};

export default AttentionCenter;
