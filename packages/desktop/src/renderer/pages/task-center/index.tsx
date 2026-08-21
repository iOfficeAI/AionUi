/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import classNames from 'classnames';
import React, { useState } from 'react';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { AionSearchInput } from '@/renderer/components/base';
import SettingsPageHeader from '@/renderer/pages/settings/components/SettingsPageHeader';
import type { ITaskCenterRow } from '@/common/adapter/ipcBridge';
import { useTaskCenterList } from './useTaskCenterList';
import { useTaskCenterT } from './useTaskCenterT';
import TaskCenterList from './TaskCenterList';
import TaskCenterDetailModal from './TaskCenterDetailModal';

const TaskCenterPage: React.FC = () => {
  const t = useTaskCenterT();
  const { user, status } = useAuth();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const token = user?.token ?? '';
  const list = useTaskCenterList(token);
  const [detailItem, setDetailItem] = useState<ITaskCenterRow | null>(null);

  if (status === 'checking') {
    return <div className='flex size-full items-center justify-center' />;
  }

  return (
    <div className='w-full h-full min-h-0 box-border bg-1 flex flex-col overflow-hidden'>
      <div
        className={classNames(
          'shrink-0 bg-1',
          isMobile ? 'px-16px pt-14px pb-14px' : 'px-12px pt-14px pb-14px md:px-40px md:pt-32px md:pb-16px'
        )}
      >
        <div className='mx-auto w-full max-w-800px box-border'>
          <SettingsPageHeader
            sticky={false}
            data-testid='task-center-header'
            title={t('taskCenter.title')}
            description={t('taskCenter.subtitle')}
            actions={
              !isMobile ? (
                <AionSearchInput
                  className='shrink-0 w-[240px] hidden md:flex'
                  data-testid='input-search-task-center'
                  placeholder={String(t('taskCenter.searchPlaceholder'))}
                  value={list.keyword}
                  onChange={list.setKeyword}
                />
              ) : undefined
            }
          />
        </div>
      </div>

      <div
        className={classNames(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          isMobile ? 'px-16px pb-14px' : 'px-12px pb-24px md:px-40px md:pb-32px'
        )}
      >
        <div className='mx-auto w-full max-w-800px box-border'>
          <TaskCenterList
            items={list.items}
            total={list.total}
            loading={list.loading}
            pageNo={list.pageNo}
            pageSize={list.perPageSize}
            error={list.error}
            onView={setDetailItem}
            onLoadMore={list.loadMore}
            onRetry={list.reload}
          />
        </div>
      </div>

      <TaskCenterDetailModal visible={detailItem !== null} item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
};

export default TaskCenterPage;
