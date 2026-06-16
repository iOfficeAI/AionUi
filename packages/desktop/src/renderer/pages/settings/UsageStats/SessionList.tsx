/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Table, Button } from '@arco-design/web-react';
import type { TableColumnProps } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { SessionRow } from '@/common/types/agentUsage';
import { formatTokens } from './chartMath';

const SessionList: React.FC<{
  rows: SessionRow[];
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
}> = ({ rows, total, hasMore, onLoadMore }) => {
  const { t } = useTranslation();
  // 显式 width 固定 4 列，project 列 ellipsis 自适应剩余宽度
  const columns: TableColumnProps<SessionRow>[] = [
    {
      title: t('usageStats.sessions.time'),
      dataIndex: 'lastActiveAt',
      width: 180,
      render: (v: string) => v.replace('T', ' ').slice(0, 16),
    },
    { title: t('usageStats.sessions.agent'), dataIndex: 'agent', width: 90 },
    { title: t('usageStats.sessions.model'), dataIndex: 'model', width: 170 },
    { title: t('usageStats.sessions.project'), dataIndex: 'project', ellipsis: true },
    {
      title: t('usageStats.sessions.tokens'),
      dataIndex: 'totalTokens',
      width: 120,
      align: 'right',
      render: (v: number) => formatTokens(v),
    },
  ];
  return (
    <div className='usage-cell'>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className='usage-cell-label'>{t('usageStats.sessions.title')}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary, #86909c)' }}>
          {t('usageStats.sessions.total', { count: total })}
        </span>
      </div>
      <Table rowKey='sessionId' columns={columns} data={rows} pagination={false} scroll={{ y: 360 }} />
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button onClick={onLoadMore}>{t('usageStats.sessions.loadMore')}</Button>
        </div>
      )}
    </div>
  );
};

export default SessionList;
