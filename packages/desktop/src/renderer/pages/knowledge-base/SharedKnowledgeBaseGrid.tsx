/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeBaseItem } from './types';
import KnowledgeBaseAvatar from './KnowledgeBaseAvatar';
import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type SharedKnowledgeBaseGridProps = {
  items: KnowledgeBaseItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpen: (item: KnowledgeBaseItem) => void;
  onStartChat: (item: KnowledgeBaseItem) => void;
};

/**
 * Shared knowledge base displayed as a card grid. Cards are read-only
 * since they are managed by their owners; a "Chat" button on each card
 * starts a conversation using the configured agent.
 */
const SharedKnowledgeBaseGrid: React.FC<SharedKnowledgeBaseGridProps> = ({
  items,
  loading = false,
  error = null,
  onRetry,
  onOpen,
  onStartChat,
}) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div
        className='flex items-center justify-center rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-28px text-center'
        data-testid='shared-kb-loading'
      >
        <div className='text-13px text-t-tertiary'>
          {t('settings.knowledgeBaseSharedLoading', { defaultValue: 'Loading shared knowledge bases…' })}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className='flex flex-col items-center rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-20px text-center'
        data-testid='shared-kb-error'
      >
        <div className='mb-6px text-13px font-600 text-t-primary'>
          {t('settings.knowledgeBaseSharedLoadFailed', { defaultValue: 'Failed to load shared knowledge bases' })}
        </div>
        <div className='mb-10px text-12px text-t-tertiary'>{error}</div>
        {onRetry ? (
          <Button
            type='primary'
            size='small'
            className='!h-28px !rounded-9px'
            onClick={onRetry}
            data-testid='shared-kb-retry'
          >
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        ) : null}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className='flex flex-col items-center rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-28px text-center'
        data-testid='shared-kb-empty'
      >
        <div className='mb-6px text-13px font-600 text-t-primary'>
          {t('settings.knowledgeBaseSharedEmpty', { defaultValue: 'No shared knowledge bases available' })}
        </div>
      </div>
    );
  }

  return (
    <div data-testid='shared-kb-grid' className='grid grid-cols-1 gap-14px sm:grid-cols-2 lg:grid-cols-3'>
      {items.map((item) => (
        <div
          key={item.id}
          data-testid={`shared-card-${item.id}`}
          className='group flex cursor-pointer flex-col rounded-14px border border-solid border-transparent bg-base p-16px transition-all duration-180 hover:border-border-2'
          onClick={() => onOpen(item)}
        >
          <div className='flex items-start justify-between'>
            <KnowledgeBaseAvatar knowledgeBase={item} size={44} />
            {typeof item.documentCount === 'number' ? (
              <span className='rounded-999px bg-fill-2 px-8px py-2px text-10px font-500 text-t-tertiary'>
                {t('settings.knowledgeBaseDocumentCount', {
                  count: item.documentCount,
                  defaultValue: `${item.documentCount} docs`,
                })}
              </span>
            ) : null}
          </div>
          <div className='mt-12px truncate text-14px font-600 text-t-primary'>{item.name}</div>
          <div className='mt-6px line-clamp-2 text-12px leading-[1.5] text-t-secondary'>{item.description || ''}</div>
          {item.owner ? (
            <div className='mt-14px truncate text-11px text-t-tertiary'>
              {t('settings.knowledgeBaseOwner', { defaultValue: 'Owner' })}: {item.owner}
            </div>
          ) : null}
          <div className='mt-14px flex justify-end' onClick={(e) => e.stopPropagation()}>
            <Button
              type='text'
              size='small'
              data-testid={`btn-shared-kb-chat-${item.id}`}
              className='!inline-flex !h-28px !items-center !justify-center !rounded-9px !bg-fill-2 !px-12px !leading-none !text-t-secondary !opacity-0 transition-all hover:!bg-primary-6 hover:!text-white group-hover:!opacity-100'
              onClick={() => onStartChat(item)}
            >
              {t('settings.knowledgeBaseGoChat', { defaultValue: 'Chat' })}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SharedKnowledgeBaseGrid;
