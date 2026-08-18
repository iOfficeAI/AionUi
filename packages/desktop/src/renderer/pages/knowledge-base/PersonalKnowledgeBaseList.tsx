/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeBaseItem } from './types';
import KnowledgeBaseRow from './KnowledgeBaseRow';
import { Button } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type PersonalKnowledgeBaseListProps = {
  items: KnowledgeBaseItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onEdit: (item: KnowledgeBaseItem) => void;
  onDelete: (item: KnowledgeBaseItem) => void;
  onOpen: (item: KnowledgeBaseItem) => void;
  onCreate: () => void;
  onStartChat: (item: KnowledgeBaseItem) => void;
};

const PersonalKnowledgeBaseList: React.FC<PersonalKnowledgeBaseListProps> = ({
  items,
  loading = false,
  error = null,
  onRetry,
  onEdit,
  onDelete,
  onOpen,
  onCreate,
  onStartChat,
}) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div
        className='flex items-center justify-center rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-28px text-center'
        data-testid='personal-kb-loading'
      >
        <div className='text-13px text-t-tertiary'>
          {t('settings.knowledgeBasePersonalLoading', { defaultValue: 'Loading personal knowledge bases…' })}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className='flex flex-col items-center rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-20px text-center'
        data-testid='personal-kb-error'
      >
        <div className='mb-6px text-13px font-600 text-t-primary'>
          {t('settings.knowledgeBasePersonalLoadFailed', { defaultValue: 'Failed to load personal knowledge bases' })}
        </div>
        <div className='mb-10px text-12px text-t-tertiary'>{error}</div>
        {onRetry ? (
          <Button
            type='primary'
            size='small'
            className='!h-28px !rounded-9px'
            onClick={onRetry}
            data-testid='personal-kb-retry'
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
        data-testid='personal-kb-empty'
      >
        <div className='mb-6px text-13px font-600 text-t-primary'>
          {t('settings.knowledgeBaseEmptyTitle', { defaultValue: 'No personal knowledge base yet' })}
        </div>
        <p className='mb-16px max-w-360px text-12px leading-[1.6] text-t-secondary'>
          {t('settings.knowledgeBaseEmptyBody', {
            defaultValue: 'Create your first knowledge base to start organizing documents.',
          })}
        </p>
        <Button
          type='primary'
          size='small'
          icon={<Plus theme='outline' size={14} fill='currentColor' />}
          className='!rounded-8px'
          onClick={onCreate}
          data-testid='btn-personal-kb-create'
        >
          {t('settings.knowledgeBaseCreate', { defaultValue: 'Create knowledge base' })}
        </Button>
      </div>
    );
  }

  return (
    <div data-testid='personal-kb-list' className='space-y-8px'>
      {items.map((item) => (
        <KnowledgeBaseRow
          key={item.id}
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          onOpen={onOpen}
          onStartChat={onStartChat}
        />
      ))}
    </div>
  );
};

export default PersonalKnowledgeBaseList;
