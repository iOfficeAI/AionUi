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
  onEdit: (item: KnowledgeBaseItem) => void;
  onDelete: (item: KnowledgeBaseItem) => void;
  onOpen: (item: KnowledgeBaseItem) => void;
  onCreate: () => void;
  onStartChat: (item: KnowledgeBaseItem) => void;
};

const PersonalKnowledgeBaseList: React.FC<PersonalKnowledgeBaseListProps> = ({
  items,
  onEdit,
  onDelete,
  onOpen,
  onCreate,
  onStartChat,
}) => {
  const { t } = useTranslation();

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
