/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shares, userDirectory } from '@/common/adapter/ipcBridge';
import type { DirectoryUser, SharePermission, ShareRecord, ShareResourceType } from '@/common/types/platform/share';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { Alert, Button, Form, Message, Modal, Select, Space, Table, Tag, Typography } from '@arco-design/web-react';
import { Delete, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isShareFeatureUnavailable, shareDisplayName, shareErrorMessage, sharePermissionLabel } from './shareUi';

export type ShareDialogProps = {
  visible: boolean;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName?: string;
  onClose: () => void;
  /** Called after a successful grant or revoke so parents can refresh lists. */
  onChanged?: () => void;
};

type GrantFormValues = {
  grantee_username: string;
  permission: SharePermission;
};

const ShareDialog: React.FC<ShareDialogProps> = ({
  visible,
  resourceType,
  resourceId,
  resourceName,
  onClose,
  onChanged,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [form] = Form.useForm<GrantFormValues>();
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [existing, setExisting] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [granting, setGranting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const title = useMemo(() => {
    const name = shareDisplayName(resourceName, resourceId);
    return t('settings.account.collaboration.shareDialog.title', { name });
  }, [resourceId, resourceName, t]);

  const load = useCallback(async () => {
    if (!resourceId || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const [dir, list] = await Promise.all([
        userDirectory.list.invoke(),
        shares.listForResource.invoke({ resource_type: resourceType, resource_id: resourceId }),
      ]);
      setDirectory((dir.items ?? []).filter((item) => item.id !== user?.id));
      setExisting(list.items ?? []);
      setUnavailable(false);
      setLoadError(null);
    } catch (error) {
      if (isShareFeatureUnavailable(error)) {
        setUnavailable(true);
        setDirectory([]);
        setExisting([]);
        setLoadError(null);
      } else {
        setLoadError(shareErrorMessage(error, t));
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [resourceId, resourceType, t, user?.id]);

  useEffect(() => {
    if (!visible) return;
    form.setFieldsValue({ permission: 'view' });
    void load();
  }, [form, load, visible]);

  const grant = useCallback(async () => {
    try {
      const values = await form.validate();
      setGranting(true);
      await shares.create.invoke({
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_username: values.grantee_username,
        permission: values.permission,
      });
      Message.success(t('settings.account.collaboration.shareDialog.grantSuccess'));
      form.setFieldsValue({ grantee_username: undefined, permission: 'view' });
      await load();
      onChanged?.();
    } catch (error) {
      if (error && typeof error === 'object' && 'errors' in error) return;
      Message.error(shareErrorMessage(error, t));
    } finally {
      setGranting(false);
    }
  }, [form, load, onChanged, resourceId, resourceType, t]);

  const revoke = useCallback(
    (share: ShareRecord) => {
      Modal.confirm({
        title: t('settings.account.collaboration.revoke'),
        content: t('settings.account.collaboration.revokeConfirm', {
          username: share.grantee_username ?? share.grantee_user_id,
        }),
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          try {
            await shares.revoke.invoke({ id: share.id });
            Message.success(t('settings.account.collaboration.revokeSuccess'));
            await load();
            onChanged?.();
          } catch (error) {
            Message.error(shareErrorMessage(error, t));
            throw error;
          }
        },
      });
    },
    [load, onChanged, t]
  );

  const columns = [
    {
      title: t('settings.account.collaboration.columns.grantee'),
      dataIndex: 'grantee_username',
    },
    {
      title: t('settings.account.collaboration.columns.permission'),
      dataIndex: 'permission',
      width: 110,
      render: (permission: SharePermission) => (
        <Tag color={permission === 'edit' ? 'orangered' : 'arcoblue'}>{sharePermissionLabel(permission, t)}</Tag>
      ),
    },
    {
      title: t('settings.account.collaboration.columns.actions'),
      width: 90,
      render: (_: unknown, share: ShareRecord) => (
        <Button
          type='text'
          status='danger'
          size='mini'
          icon={<Delete theme='outline' size={14} />}
          onClick={() => revoke(share)}
        >
          {t('settings.account.collaboration.revoke')}
        </Button>
      ),
    },
  ];

  return (
    <Modal title={title} visible={visible} onCancel={onClose} footer={null} style={{ width: 560 }} unmountOnExit>
      <Typography.Paragraph type='secondary' className='!mt-0'>
        {t('settings.account.collaboration.shareDialog.description')}
      </Typography.Paragraph>

      {unavailable ? (
        <Alert type='info' content={t('settings.account.collaboration.errors.featureUnavailable')} />
      ) : null}
      {loadError ? <Alert type='error' className='mb-12px' content={loadError} /> : null}

      {!unavailable ? (
        <div className='flex flex-col gap-16px'>
          <Form form={form} layout='vertical' initialValues={{ permission: 'view' as SharePermission }}>
            <Form.Item
              field='grantee_username'
              label={t('settings.account.collaboration.shareDialog.user')}
              rules={[{ required: true, message: t('settings.account.collaboration.shareDialog.userRequired') }]}
            >
              <Select
                showSearch
                placeholder={
                  directory.length === 0
                    ? t('settings.account.collaboration.shareDialog.noUsers')
                    : t('settings.account.collaboration.shareDialog.userPlaceholder')
                }
                disabled={directory.length === 0}
                filterOption={(inputValue, option) => {
                  const label = String((option as { children?: unknown } | undefined)?.children ?? '');
                  return label.toLowerCase().includes(inputValue.toLowerCase());
                }}
              >
                {directory.map((item) => (
                  <Select.Option key={item.id} value={item.username}>
                    {item.username}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item field='permission' label={t('settings.account.collaboration.shareDialog.permission')}>
              <Select>
                <Select.Option value='view'>{t('settings.account.collaboration.permissions.view')}</Select.Option>
                <Select.Option value='edit'>{t('settings.account.collaboration.permissions.edit')}</Select.Option>
              </Select>
            </Form.Item>
            <Space>
              <Button type='primary' loading={granting} onClick={() => void grant()}>
                {t('settings.account.collaboration.shareDialog.grant')}
              </Button>
              <Button icon={<Refresh theme='outline' size={14} />} onClick={() => void load()} disabled={loading}>
                {t('common.refresh')}
              </Button>
            </Space>
          </Form>

          <div>
            <div className='mb-8px text-13px font-500 text-t-primary'>
              {t('settings.account.collaboration.shareDialog.existing')}
            </div>
            <Table
              rowKey='id'
              size='small'
              loading={loading}
              pagination={false}
              data={existing}
              columns={columns}
              noDataElement={
                <div className='py-16px text-center text-t-secondary'>
                  {t('settings.account.collaboration.shareDialog.existingEmpty')}
                </div>
              }
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

export default ShareDialog;
