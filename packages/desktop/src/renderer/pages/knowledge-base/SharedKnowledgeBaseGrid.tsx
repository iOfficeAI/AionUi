/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeBaseItem } from './types';
import KnowledgeBaseRow from './KnowledgeBaseRow';
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
 * Shared knowledge bases rendered as a list — same visual treatment as the
 * personal list. Owners are managed externally so the more menu (edit/delete)
 * is hidden; only the chat entry point is exposed.
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
          <button
            type='button'
            onClick={onRetry}
            data-testid='shared-kb-retry'
            className='inline-flex h-28px cursor-pointer items-center justify-center rounded-9px border-none bg-primary-6 px-14px text-12px font-500 text-white transition-colors hover:bg-primary-7'
          >
            {t('common.retry', { defaultValue: 'Retry' })}
          </button>
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
    <div data-testid='shared-kb-list' className='space-y-8px'>
      {items.map((item) => (
        <KnowledgeBaseRow
          key={item.id}
          item={item}
          readonly
          onEdit={() => undefined}
          onDelete={() => undefined}
          onOpen={() => undefined}
          onStartChat={onStartChat}
        />
      ))}
    </div>
  );
};

export default SharedKnowledgeBaseGrid;
