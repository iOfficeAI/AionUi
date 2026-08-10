/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { adminUsers } from '@/common/adapter/ipcBridge';
import type { AdminUser, AuthAccountStatus, AuthRole } from '@/common/types/platform/auth';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { Alert, Button, Form, Input, Message, Modal, Select, Space, Typography } from '@arco-design/web-react';
import { Copy, Plus, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { accountErrorMessage, isAccountFeatureUnavailable, isAccountRateLimited } from './accountUi';
import UsersTable from './UsersTable';

type CreateUserValues = {
  username: string;
  role: AuthRole;
};

type RenameUserValues = {
  username: string;
};

type TemporaryCredential = {
  username: string;
  password: string;
};

const UsersPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [createForm] = Form.useForm<CreateUserValues>();
  const [renameForm] = Form.useForm<RenameUserValues>();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [renameUser, setRenameUser] = useState<AdminUser | null>(null);
  const [temporaryCredential, setTemporaryCredential] = useState<TemporaryCredential | null>(null);
  const loadingRef = useRef(false);

  const loadUsers = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await adminUsers.list.invoke();
      setUsers(page.items ?? []);
      setUnavailable(false);
      setLoadError(null);
    } catch (error) {
      if (isAccountFeatureUnavailable(error)) {
        setUnavailable(true);
        setLoadError(null);
      } else {
        setUnavailable(false);
        setLoadError(accountErrorMessage(error, t));
        // One toast max per manual refresh; never toast on rate-limit spam loops.
        if (!isAccountRateLimited(error)) {
          Message.error(accountErrorMessage(error, t));
        }
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [t]);

  useEffect(() => {
    void loadUsers();
    // Mount-only: do not depend on unstable Message helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, []);

  const replaceUser = useCallback((updated: AdminUser) => {
    setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  const createUser = useCallback(async () => {
    try {
      const values = await createForm.validate();
      const result = await adminUsers.create.invoke({ username: values.username.trim(), role: values.role });
      setCreateVisible(false);
      createForm.resetFields();
      await loadUsers();
      setTemporaryCredential({
        username: result.user?.username ?? values.username.trim(),
        password: result.temporary_password,
      });
      Message.success(t('settings.account.users.createSuccess'));
    } catch (error) {
      if (error && typeof error === 'object' && 'errors' in error) return;
      Message.error(accountErrorMessage(error, t));
    }
  }, [createForm, loadUsers, t]);

  const submitRename = useCallback(async () => {
    if (!renameUser) return;
    try {
      const values = await renameForm.validate();
      const updated = await adminUsers.updateUsername.invoke({ id: renameUser.id, username: values.username.trim() });
      replaceUser(updated);
      setRenameUser(null);
      renameForm.resetFields();
      Message.success(t('settings.account.users.renameSuccess'));
    } catch (error) {
      if (error && typeof error === 'object' && 'errors' in error) return;
      Message.error(accountErrorMessage(error, t));
    }
  }, [renameForm, renameUser, replaceUser, t]);

  const updateRole = useCallback(
    async (target: AdminUser, role: AuthRole) => {
      try {
        replaceUser(await adminUsers.updateRole.invoke({ id: target.id, role }));
        Message.success(t('settings.account.users.updateSuccess'));
      } catch (error) {
        Message.error(accountErrorMessage(error, t));
      }
    },
    [replaceUser, t]
  );

  const updateStatus = useCallback(
    async (target: AdminUser, status: AuthAccountStatus) => {
      try {
        replaceUser(await adminUsers.updateStatus.invoke({ id: target.id, status }));
        Message.success(t('settings.account.users.updateSuccess'));
      } catch (error) {
        Message.error(accountErrorMessage(error, t));
      }
    },
    [replaceUser, t]
  );

  const resetPassword = useCallback(
    (target: AdminUser) => {
      Modal.confirm({
        title: t('settings.account.users.resetPassword'),
        content: t('settings.account.users.resetConfirm', { username: target.username }),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            const result = await adminUsers.resetPassword.invoke({ id: target.id });
            if (result.user) replaceUser(result.user);
            setTemporaryCredential({ username: target.username, password: result.temporary_password });
            Message.success(t('settings.account.users.resetSuccess'));
          } catch (error) {
            Message.error(accountErrorMessage(error, t));
            throw error;
          }
        },
      });
    },
    [replaceUser, t]
  );

  const revokeSessions = useCallback(
    (target: AdminUser) => {
      Modal.confirm({
        title: t('settings.account.users.revokeSessions'),
        content: t('settings.account.users.revokeConfirm', { username: target.username }),
        onOk: async () => {
          try {
            replaceUser(await adminUsers.revokeSessions.invoke({ id: target.id }));
            Message.success(t('settings.account.users.revokeSuccess'));
          } catch (error) {
            Message.error(accountErrorMessage(error, t));
            throw error;
          }
        },
      });
    },
    [replaceUser, t]
  );

  const startRename = useCallback(
    (target: AdminUser) => {
      renameForm.setFieldsValue({ username: target.username });
      setRenameUser(target);
    },
    [renameForm]
  );

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex flex-wrap items-start justify-between gap-12px'>
        <div className='min-w-0'>
          <Typography.Text className='text-16px font-500 text-t-primary'>
            {t('settings.account.users.title')}
          </Typography.Text>
          <div className='mt-4px text-13px text-t-secondary'>{t('settings.account.users.description')}</div>
        </div>
        <Space>
          <Button icon={<Refresh theme='outline' size={15} />} onClick={() => void loadUsers()} disabled={loading}>
            {t('common.refresh')}
          </Button>
          <Button
            type='primary'
            icon={<Plus theme='outline' size={15} />}
            disabled={unavailable}
            onClick={() => setCreateVisible(true)}
          >
            {t('settings.account.users.add')}
          </Button>
        </Space>
      </div>

      {unavailable ? <Alert type='info' content={t('settings.account.errors.featureUnavailable')} /> : null}
      {loadError ? <Alert type='error' content={loadError} closable onClose={() => setLoadError(null)} /> : null}

      {!unavailable ? (
        <div className='overflow-hidden rd-12px border border-border-2 bg-bg-2'>
          <UsersTable
            currentUserId={currentUser?.id}
            loading={loading}
            users={users}
            onRename={startRename}
            onResetPassword={resetPassword}
            onRevokeSessions={revokeSessions}
            onRoleChange={(target, role) => void updateRole(target, role)}
            onStatusChange={(target, status) => void updateStatus(target, status)}
          />
        </div>
      ) : null}

      <Modal
        title={t('settings.account.users.createTitle')}
        visible={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={() => void createUser()}
        unmountOnExit
      >
        <Form form={createForm} layout='vertical' initialValues={{ role: 'member' }}>
          <Form.Item
            field='username'
            label={t('settings.account.users.username')}
            rules={[
              { required: true, message: t('settings.account.users.usernameRequired') },
              { minLength: 3, message: t('settings.account.users.usernameLength') },
              { maxLength: 32, message: t('settings.account.users.usernameLength') },
              { match: /^[a-zA-Z0-9_-]+$/, message: t('settings.account.users.usernameFormat') },
            ]}
          >
            <Input placeholder={t('settings.account.users.usernamePlaceholder')} autoComplete='off' />
          </Form.Item>
          <Form.Item field='role' label={t('settings.account.users.role')} rules={[{ required: true }]}>
            <Select>
              <Select.Option value='admin'>{t('settings.account.roles.admin')}</Select.Option>
              <Select.Option value='member'>{t('settings.account.roles.member')}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('settings.account.users.renameTitle')}
        visible={Boolean(renameUser)}
        onCancel={() => setRenameUser(null)}
        onOk={() => void submitRename()}
        unmountOnExit
      >
        <Form form={renameForm} layout='vertical'>
          <Form.Item
            field='username'
            label={t('settings.account.users.username')}
            rules={[
              { required: true, message: t('settings.account.users.usernameRequired') },
              { minLength: 3, message: t('settings.account.users.usernameLength') },
              { maxLength: 32, message: t('settings.account.users.usernameLength') },
              { match: /^[a-zA-Z0-9_-]+$/, message: t('settings.account.users.usernameFormat') },
            ]}
          >
            <Input autoComplete='off' />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('settings.account.users.temporaryPasswordTitle')}
        visible={Boolean(temporaryCredential)}
        footer={
          <Button type='primary' long onClick={() => setTemporaryCredential(null)}>
            {t('common.confirm')}
          </Button>
        }
        onCancel={() => setTemporaryCredential(null)}
        unmountOnExit
      >
        <Alert type='warning' className='mb-16px' content={t('settings.account.users.temporaryPasswordNotice')} />
        <div className='mb-8px text-13px text-t-secondary'>{temporaryCredential?.username}</div>
        <div className='flex items-center gap-8px rd-8px border border-border-2 bg-fill-1 px-12px py-10px'>
          <code className='min-w-0 flex-1 break-all text-t-primary'>{temporaryCredential?.password}</code>
          <Button
            type='text'
            icon={<Copy theme='outline' size={16} />}
            onClick={() => {
              if (!temporaryCredential) return;
              void navigator.clipboard.writeText(temporaryCredential.password);
              Message.success(t('common.copySuccess'));
            }}
          >
            {t('common.copy')}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPanel;
