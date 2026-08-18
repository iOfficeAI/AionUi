/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeBaseItem, KnowledgeBaseTab } from './types';
import PersonalKnowledgeBaseList from './PersonalKnowledgeBaseList';
import SharedKnowledgeBaseGrid from './SharedKnowledgeBaseGrid';
import { Button } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

type KnowledgeBaseHomeTabsProps = {
  personalItems: KnowledgeBaseItem[];
  sharedItems: KnowledgeBaseItem[];
  sharedLoading?: boolean;
  sharedError?: string | null;
  onRetryLoadShared?: () => void;
  onEdit: (item: KnowledgeBaseItem) => void;
  onDelete: (item: KnowledgeBaseItem) => void;
  onOpen: (item: KnowledgeBaseItem) => void;
  onCreate: () => void;
  onStartChat: (item: KnowledgeBaseItem) => void;
  initialTab?: KnowledgeBaseTab;
  onTabChange?: (tab: KnowledgeBaseTab) => void;
  onRefresh?: (tab: KnowledgeBaseTab) => void;
};

const KnowledgeBaseHomeTabs: React.FC<KnowledgeBaseHomeTabsProps> = ({
  personalItems,
  sharedItems,
  sharedLoading = false,
  sharedError = null,
  onRetryLoadShared,
  onEdit,
  onDelete,
  onOpen,
  onCreate,
  onStartChat,
  initialTab = 'personal',
  onTabChange,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [tab, setTab] = useState<KnowledgeBaseTab>(initialTab);

  const selectTab = (next: KnowledgeBaseTab) => {
    if (next === tab) return;
    setTab(next);
    onTabChange?.(next);
    onRefresh?.(next);
  };

  const counts = {
    personal: personalItems.length,
    shared: sharedItems.length,
  };

  const tabButton = (key: KnowledgeBaseTab, label: string, count: number) => (
    <button
      type='button'
      data-testid={`kb-tab-${key}`}
      onClick={() => selectTab(key)}
      className={`relative inline-flex cursor-pointer items-center border-none bg-transparent px-2px pb-12px text-14px leading-none transition-colors ${
        tab === key ? 'font-600 text-t-primary' : 'font-500 text-t-tertiary hover:text-t-secondary'
      }`}
    >
      <span>{label}</span>
      <span
        className={`ml-6px inline-flex h-16px min-w-16px items-center justify-center rounded-999px px-5px text-10px font-500 leading-none ${
          tab === key ? 'bg-primary-1 text-primary-6' : 'bg-fill-2 text-t-quaternary'
        }`}
      >
        {count}
      </span>
      {tab === key ? <span className='absolute inset-x-0 -bottom-1px h-2px rounded-2px bg-primary-6' /> : null}
    </button>
  );

  return (
    <div data-testid='kb-home-shell' className='flex h-full min-h-0 flex-col overflow-hidden bg-transparent'>
      <div
        className={`border-b border-border-2 bg-bg-0 ${isMobile ? 'px-16px pt-14px' : 'px-12px pt-24px md:px-40px md:pt-32px'}`}
      >
        <div className='mx-auto w-full max-w-800px'>
          <div className='flex w-full items-center justify-between gap-12px sm:gap-16px'>
            <h1
              className={classNames(
                'm-0 min-w-0 flex-1 font-bold text-t-primary',
                isMobile ? 'text-22px leading-[1.2]' : 'text-28px leading-[1.15]'
              )}
            >
              {t('settings.knowledgeBase', { defaultValue: 'Knowledge Base' })}
            </h1>
            <Button
              type='primary'
              size='default'
              icon={<Plus theme='outline' size={14} fill='currentColor' />}
              className='!shrink-0 !rounded-8px'
              onClick={onCreate}
              data-testid='btn-create-knowledge-base'
            >
              {t('settings.knowledgeBaseCreate', { defaultValue: 'Create knowledge base' })}
            </Button>
          </div>
          <p
            className={classNames(
              'm-0 mt-8px w-full text-t-secondary',
              isMobile ? 'text-13px leading-20px' : 'text-14px leading-22px'
            )}
          >
            {t('settings.knowledgeBaseLeadShort', {
              defaultValue:
                'Organize documents into knowledge bases. Personal bases are private; shared bases are available to your team.',
            })}
          </p>
          <div className='mt-18px flex gap-26px'>
            {tabButton(
              'personal',
              t('settings.knowledgeBaseTabPersonal', { defaultValue: 'Personal' }),
              counts.personal
            )}
            {tabButton('shared', t('settings.knowledgeBaseTabShared', { defaultValue: 'Shared' }), counts.shared)}
          </div>
        </div>
      </div>

      <div
        data-testid='kb-home-body'
        className={`min-h-0 flex-1 overflow-auto ${isMobile ? 'px-16px pb-14px pt-14px' : 'px-12px pb-24px pt-18px md:px-40px'}`}
      >
        <div className='mx-auto w-full max-w-800px'>
          {tab === 'personal' ? (
            <PersonalKnowledgeBaseList
              items={personalItems}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpen={onOpen}
              onCreate={onCreate}
              onStartChat={onStartChat}
            />
          ) : (
            <SharedKnowledgeBaseGrid
              items={sharedItems}
              loading={sharedLoading}
              error={sharedError}
              onRetry={onRetryLoadShared}
              onOpen={onOpen}
              onStartChat={onStartChat}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseHomeTabs;
