/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { Empty, Spin, Table, Tag, Typography } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ITaskCenterRow } from '@/common/adapter/ipcBridge';
import { isOverdue, statusToColor, urgencyToColor } from './types';

const { Text } = Typography;

export interface TaskCenterTableProps {
  items: ITaskCenterRow[];
  total: number;
  pageNo: number;
  perPageSize: number;
  loading: boolean;
  onPageChange: (pageNo: number) => void;
  onPerPageSizeChange: (perPageSize: number) => void;
  onView: (item: ITaskCenterRow) => void;
}

const TaskCenterTable: React.FC<TaskCenterTableProps> = ({
  items,
  total,
  pageNo,
  perPageSize,
  loading,
  onPageChange,
  onPerPageSizeChange,
  onView,
}) => {
  const { t } = useTranslation();

  const columns = useMemo(
    () => [
      {
        title: String(t('taskCenter.table.columns.index')),
        dataIndex: 'index',
        width: 60,
        render: (_: unknown, __: ITaskCenterRow, idx: number) => (pageNo - 1) * perPageSize + idx + 1,
      },
      {
        title: String(t('taskCenter.table.columns.name')),
        dataIndex: 'name',
        render: (name: string, item: ITaskCenterRow) => (
          <Text className='cursor-pointer text-primary-6 hover:underline' onClick={() => onView(item)}>
            {name || '-'}
          </Text>
        ),
      },
      {
        title: String(t('taskCenter.table.columns.mark')),
        dataIndex: 'mark',
        render: (mark: string) => (mark ? <Tag color='arcoblue'>{mark}</Tag> : <Text type='secondary'>-</Text>),
      },
      {
        title: String(t('taskCenter.table.columns.type')),
        dataIndex: 'typeDesc',
        width: 100,
      },
      {
        title: String(t('taskCenter.table.columns.priority')),
        dataIndex: 'urgency',
        width: 80,
        render: (urgency: number, item: ITaskCenterRow) => (
          <Tag color={urgencyToColor(urgency)}>{item.urgencyDesc}</Tag>
        ),
      },
      {
        title: String(t('taskCenter.table.columns.status')),
        dataIndex: 'status',
        width: 80,
        render: (status: number, item: ITaskCenterRow) => (
          <Tag color={statusToColor(status, item.statusDesc)}>{item.statusDesc}</Tag>
        ),
      },
      {
        title: String(t('taskCenter.table.columns.deadline')),
        dataIndex: 'deadlineTime',
        width: 120,
        render: (d: string | null, item: ITaskCenterRow) =>
          d ? (
            <span className={isOverdue(item) ? 'text-red-500 font-500' : ''}>{d}</span>
          ) : (
            <Text type='secondary'>-</Text>
          ),
      },
      {
        title: String(t('taskCenter.table.columns.project')),
        dataIndex: 'projectName',
      },
      {
        title: String(t('taskCenter.table.columns.updator')),
        dataIndex: 'updatorName',
        width: 100,
      },
      {
        title: String(t('taskCenter.table.columns.creator')),
        dataIndex: 'creatorName',
        width: 100,
      },
      {
        title: String(t('taskCenter.table.columns.createdAt')),
        dataIndex: 'createTime',
        width: 160,
      },
      {
        title: String(t('taskCenter.table.columns.actions')),
        dataIndex: 'actions',
        width: 80,
        render: (_: unknown, item: ITaskCenterRow) => (
          <Text className='cursor-pointer text-primary-6 hover:underline' onClick={() => onView(item)}>
            {String(t('taskCenter.actions.view'))}
          </Text>
        ),
      },
    ],
    [t, pageNo, perPageSize, onView]
  );

  if (!loading && items.length === 0) {
    return <Empty description={String(t('taskCenter.empty'))} />;
  }

  return (
    <Spin loading={loading}>
      <Table
        rowKey='id'
        columns={columns}
        data={items}
        pagination={{
          current: pageNo,
          pageSize: perPageSize,
          total,
          showTotal: true,
          onChange: onPageChange,
          onPageSizeChange: onPerPageSizeChange,
        }}
        size='small'
      />
    </Spin>
  );
};

export default TaskCenterTable;
