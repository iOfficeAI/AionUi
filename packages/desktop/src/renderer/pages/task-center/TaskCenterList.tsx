/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { Button, Spin, Tag } from '@arco-design/web-react';
import { Clipboard } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ITaskCenterRow } from '@/common/adapter/ipcBridge';
import { isOverdue, statusToColor, urgencyToColor } from './types';

export interface TaskCenterListProps {
  items: ITaskCenterRow[];
  total: number;
  loading: boolean;
  pageNo: number;
  pageSize: number;
  onView: (item: ITaskCenterRow) => void;
  onLoadMore: () => void;
}

/** Background color tokens by urgency — matches the urgency Tag accent. */
const urgencyAvatarClass = (urgency: number): string => {
  if (urgency === 0) return 'bg-[rgb(var(--danger-1))] text-[rgb(var(--danger-6))]';
  if (urgency === 1) return 'bg-[rgb(var(--warning-1))] text-[rgb(var(--warning-6))]';
  return 'bg-fill-2 text-t-secondary';
};

const TaskCenterList: React.FC<TaskCenterListProps> = ({
  items,
  total,
  loading,
  pageNo,
  pageSize,
  onView,
  onLoadMore,
}) => {
  const { t } = useTranslation();

  if (loading && items.length === 0) {
    return (
      <div
        className='flex items-center justify-center rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-28px text-center'
        data-testid='task-list-loading'
      >
        <div className='text-13px text-t-tertiary'>{String(t('taskCenter.loading'))}</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className='flex flex-col items-center rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-28px text-center'
        data-testid='task-list-empty'
      >
        <Clipboard theme='outline' size='32' className='mb-8px text-t-quaternary' />
        <div className='mb-6px text-13px font-600 text-t-primary'>{String(t('taskCenter.empty'))}</div>
      </div>
    );
  }

  const loaded = items.length;
  const hasMore = loaded < total;

  return (
    <Spin loading={loading}>
      <div data-testid='task-list' className='space-y-8px'>
        {items.map((item) => (
          <div
            key={item.id}
            data-testid={`task-card-${item.id}`}
            className='group flex cursor-pointer items-center justify-between gap-12px rounded-12px border border-solid border-transparent bg-base px-14px py-12px transition-all duration-180 hover:border-border-2'
            onClick={() => onView(item)}
          >
            <div className='flex min-w-0 flex-1 items-center gap-12px'>
              <div
                className={`flex h-36px w-36px shrink-0 items-center justify-center rounded-8px text-14px font-600 ${urgencyAvatarClass(item.urgency)}`}
              >
                {item.name ? item.name.slice(0, 1) : '?'}
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex min-w-0 items-center gap-8px'>
                  <span className='truncate text-14px font-medium text-t-primary'>{item.name || '-'}</span>
                  {item.mark ? (
                    <span className='shrink-0 rounded-999px bg-fill-2 px-6px py-1px text-10px font-500 text-t-tertiary'>
                      {item.mark}
                    </span>
                  ) : null}
                  <Tag color={urgencyToColor(item.urgency)} size='small' className='shrink-0'>
                    {item.urgencyDesc}
                  </Tag>
                </div>
                <div className='mt-2px flex min-w-0 items-center gap-8px text-12px text-t-secondary'>
                  <span className='truncate'>{item.projectName || '-'}</span>
                  <span className='shrink-0 text-t-quaternary'>·</span>
                  <span className='shrink-0'>{item.typeDesc || '-'}</span>
                </div>
              </div>
            </div>
            <div className='ml-10px flex shrink-0 items-center gap-12px' onClick={(e) => e.stopPropagation()}>
              <div className='flex flex-col items-end gap-4px'>
                <div
                  className={`text-12px ${isOverdue(item) ? 'font-600 text-[rgb(var(--danger-6))]' : 'text-t-secondary'}`}
                >
                  {isOverdue(item) ? String(t('taskCenter.list.overdue')) : ''}
                  {item.deadlineTime ? (isOverdue(item) ? ` · ${item.deadlineTime}` : item.deadlineTime) : '-'}
                </div>
                <Tag color={statusToColor(item.status, item.statusDesc)} size='small'>
                  {item.statusDesc}
                </Tag>
              </div>
              <Button
                type='text'
                size='small'
                data-testid={`btn-task-view-${item.id}`}
                className='!hidden !h-28px !items-center !justify-center !rounded-8px !bg-fill-2 !px-12px !leading-none !text-t-secondary !opacity-0 transition-all hover:!bg-primary-6 hover:!text-white group-hover:!opacity-100 sm:!inline-flex'
                onClick={() => onView(item)}
              >
                {String(t('taskCenter.actions.view'))}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {hasMore ? (
        <div className='mt-16px flex items-center justify-center'>
          <Button
            type='secondary'
            size='small'
            data-testid='task-list-load-more'
            loading={loading}
            className='!h-32px !rounded-8px'
            onClick={onLoadMore}
          >
            {String(t('taskCenter.list.loadMore'))}
            <span className='ml-6px text-t-tertiary'>
              ({String(t('taskCenter.list.loadMoreHint', { loaded, total }))})
            </span>
          </Button>
        </div>
      ) : null}
    </Spin>
  );
};

export default TaskCenterList;
