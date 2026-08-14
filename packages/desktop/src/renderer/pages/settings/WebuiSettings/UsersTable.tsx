/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AdminUser, AuthAccountStatus, AuthRole } from '@/common/types/platform/auth';
import { Button, Select, Space, Table, Tag } from '@arco-design/web-react';
import { EditTwo } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type UsersTableProps = {
  currentUserId?: string;
  loading: boolean;
  users: AdminUser[];
  onRename: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onRevokeSessions: (user: AdminUser) => void;
  onRoleChange: (user: AdminUser, role: AuthRole) => void;
  onStatusChange: (user: AdminUser, status: AuthAccountStatus) => void;
};

const UsersTable: React.FC<UsersTableProps> = ({
  currentUserId,
  loading,
  users,
  onRename,
  onResetPassword,
  onRevokeSessions,
  onRoleChange,
  onStatusChange,
}) => {
  const { t } = useTranslation();
  const columns = useMemo(
    () => [
      {
        title: t('settings.account.users.username'),
        dataIndex: 'username',
        render: (_value: unknown, record: AdminUser) => (
          <div className='min-w-140px'>
            <div className='font-500 text-t-primary'>{record.username}</div>
            <div className='text-11px text-t-tertiary'>{t(`settings.account.userTypes.${record.user_type}`)}</div>
          </div>
        ),
      },
      {
        title: t('settings.account.users.role'),
        dataIndex: 'role',
        render: (_value: unknown, record: AdminUser) => (
          <Select
            size='small'
            value={record.role}
            className='w-110px'
            disabled={record.id === currentUserId}
            onChange={(role) => onRoleChange(record, role as AuthRole)}
          >
            <Select.Option value='admin'>{t('settings.account.roles.admin')}</Select.Option>
            <Select.Option value='member'>{t('settings.account.roles.member')}</Select.Option>
          </Select>
        ),
      },
      {
        title: t('common.status'),
        dataIndex: 'status',
        render: (_value: unknown, record: AdminUser) => (
          <Select
            size='small'
            value={record.status}
            className='w-110px'
            disabled={record.id === currentUserId}
            onChange={(status) => onStatusChange(record, status as AuthAccountStatus)}
          >
            <Select.Option value='active'>{t('settings.account.statuses.active')}</Select.Option>
            <Select.Option value='disabled'>{t('settings.account.statuses.disabled')}</Select.Option>
          </Select>
        ),
      },
      {
        title: t('settings.account.users.passwordState'),
        dataIndex: 'must_change_password',
        render: (_value: unknown, record: AdminUser) => (
          <Tag color={record.must_change_password ? 'orange' : 'green'}>
            {record.must_change_password
              ? t('settings.account.users.changeRequired')
              : t('settings.account.users.passwordSet')}
          </Tag>
        ),
      },
      {
        title: t('settings.account.users.actions'),
        render: (_value: unknown, record: AdminUser) => (
          <Space wrap size={4}>
            <Button
              type='text'
              size='mini'
              icon={<EditTwo theme='outline' size={14} />}
              disabled={record.id === currentUserId}
              onClick={() => onRename(record)}
            >
              {t('common.edit')}
            </Button>
            <Button
              type='text'
              size='mini'
              disabled={record.id === currentUserId}
              onClick={() => onResetPassword(record)}
            >
              {t('settings.account.users.resetPassword')}
            </Button>
            <Button
              type='text'
              size='mini'
              disabled={record.id === currentUserId}
              onClick={() => onRevokeSessions(record)}
            >
              {t('settings.account.users.revokeSessions')}
            </Button>
          </Space>
        ),
      },
    ],
    [currentUserId, onRename, onResetPassword, onRevokeSessions, onRoleChange, onStatusChange, t]
  );

  return (
    <Table
      rowKey='id'
      loading={loading}
      columns={columns}
      data={users}
      pagination={false}
      scroll={{ x: 850 }}
      noDataElement={<div className='py-32px text-t-secondary'>{t('settings.account.users.empty')}</div>}
    />
  );
};

export default UsersTable;
