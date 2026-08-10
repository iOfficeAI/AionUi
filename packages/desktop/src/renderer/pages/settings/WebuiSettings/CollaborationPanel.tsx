/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import { mode, shares } from '@/common/adapter/ipcBridge';
import type { IProvider } from '@/common/config/storage';
import type { SharePermission, ShareRecord, ShareResourceType } from '@/common/types/platform/share';
import { Alert, Button, Message, Modal, Select, Table, Tabs, Tag, Typography } from '@arco-design/web-react';
import { Refresh, Share } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ShareDialog from './ShareDialog';
import {
  isShareFeatureUnavailable,
  shareDisplayName,
  shareErrorMessage,
  sharePermissionLabel,
  shareResourceLabel,
} from './shareUi';

type CollaborationTab = 'received' | 'granted';

type ShareableItem = {
  id: string;
  name: string;
};

const SHAREABLE_TYPES: ShareResourceType[] = ['conversation', 'provider', 'project'];

const CollaborationPanel: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<CollaborationTab>('received');
  const [received, setReceived] = useState<ShareRecord[]>([]);
  const [granted, setGranted] = useState<ShareRecord[]>([]);
  const [conversations, setConversations] = useState<ShareableItem[]>([]);
  const [providers, setProviders] = useState<ShareableItem[]>([]);
  const [projects, setProjects] = useState<ShareableItem[]>([]);
  const [resourceType, setResourceType] = useState<ShareResourceType>('conversation');
  const [selectedResourceId, setSelectedResourceId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    resourceType: ShareResourceType;
    resourceId: string;
    resourceName?: string;
  } | null>(null);
  const loadingRef = useRef(false);

  const resourceOptions = useMemo(() => {
    switch (resourceType) {
      case 'provider':
        return providers;
      case 'project':
        return projects;
      case 'conversation':
      default:
        return conversations;
    }
  }, [conversations, projects, providers, resourceType]);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const [receivedPage, grantedPage, conversationPage, providerList] = await Promise.all([
        shares.listReceived.invoke(),
        shares.listGranted.invoke(),
        httpRequest<{ items?: Array<{ id?: string; name?: string; project_id?: string | null }> }>(
          'GET',
          '/api/conversations?limit=100'
        ).catch(() => ({ items: [] as Array<{ id?: string; name?: string; project_id?: string | null }> })),
        mode.listProviders.invoke().catch((): IProvider[] => []),
      ]);

      setReceived(receivedPage.items ?? []);
      setGranted(grantedPage.items ?? []);

      const convItems = (conversationPage?.items ?? [])
        .filter(
          (item): item is { id: string; name?: string; project_id?: string | null } => typeof item.id === 'string'
        )
        .map((item) => ({ id: item.id, name: item.name?.trim() || item.id }));
      setConversations(convItems);

      const providerItems = providerList.map((item) => ({
        id: item.id,
        name: (item.name || item.platform || item.id).trim() || item.id,
      }));
      setProviders(providerItems);

      // No dedicated projects list API — collect workspace projects from conversations.
      const projectMap = new Map<string, string>();
      for (const item of conversationPage?.items ?? []) {
        const projectId = typeof item.project_id === 'string' ? item.project_id.trim() : '';
        if (!projectId || projectMap.has(projectId)) continue;
        const label = item.name?.trim()
          ? t('settings.account.collaboration.projectFromChat', { name: item.name.trim() })
          : projectId;
        projectMap.set(projectId, label);
      }
      setProjects([...projectMap.entries()].map(([id, name]) => ({ id, name })));

      setUnavailable(false);
      setLoadError(null);
    } catch (error) {
      if (isShareFeatureUnavailable(error)) {
        setUnavailable(true);
        setReceived([]);
        setGranted([]);
        setLoadError(null);
      } else {
        setUnavailable(false);
        setLoadError(shareErrorMessage(error, t));
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  useEffect(() => {
    // Clear selection when switching resource kind so we never share the wrong type.
    setSelectedResourceId(undefined);
  }, [resourceType]);

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
          } catch (error) {
            Message.error(shareErrorMessage(error, t));
            throw error;
          }
        },
      });
    },
    [load, t]
  );

  const openShareDialog = useCallback(() => {
    if (!selectedResourceId) {
      Message.warning(t('settings.account.collaboration.pickResource'));
      return;
    }
    const selected = resourceOptions.find((item) => item.id === selectedResourceId);
    setShareTarget({
      resourceType,
      resourceId: selectedResourceId,
      resourceName: selected?.name,
    });
  }, [resourceOptions, resourceType, selectedResourceId, t]);

  const receivedColumns = [
    {
      title: t('settings.account.collaboration.columns.resource'),
      dataIndex: 'resource_id',
      render: (_: unknown, share: ShareRecord) => (
        <div className='min-w-0'>
          <div className='truncate text-t-primary'>{shareDisplayName(share.resource_name, share.resource_id)}</div>
          <Typography.Text type='secondary' className='text-12px'>
            {shareResourceLabel(share.resource_type, t)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: t('settings.account.collaboration.columns.permission'),
      dataIndex: 'permission',
      width: 120,
      render: (permission: SharePermission) => (
        <Tag color={permission === 'edit' ? 'orangered' : 'arcoblue'}>{sharePermissionLabel(permission, t)}</Tag>
      ),
    },
    {
      title: t('settings.account.collaboration.columns.owner'),
      dataIndex: 'owner_username',
      width: 140,
    },
  ];

  const grantedColumns = [
    {
      title: t('settings.account.collaboration.columns.resource'),
      dataIndex: 'resource_id',
      render: (_: unknown, share: ShareRecord) => (
        <div className='min-w-0'>
          <div className='truncate text-t-primary'>{shareDisplayName(share.resource_name, share.resource_id)}</div>
          <Typography.Text type='secondary' className='text-12px'>
            {shareResourceLabel(share.resource_type, t)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: t('settings.account.collaboration.columns.permission'),
      dataIndex: 'permission',
      width: 120,
      render: (permission: SharePermission) => (
        <Tag color={permission === 'edit' ? 'orangered' : 'arcoblue'}>{sharePermissionLabel(permission, t)}</Tag>
      ),
    },
    {
      title: t('settings.account.collaboration.columns.grantee'),
      dataIndex: 'grantee_username',
      width: 140,
    },
    {
      title: t('settings.account.collaboration.columns.actions'),
      width: 110,
      render: (_: unknown, share: ShareRecord) => (
        <Button type='text' status='danger' size='mini' onClick={() => revoke(share)}>
          {t('settings.account.collaboration.revoke')}
        </Button>
      ),
    },
  ];

  const emptyPicker =
    resourceOptions.length === 0
      ? t(`settings.account.collaboration.emptyPicker.${resourceType}`)
      : t('settings.account.collaboration.pickResource');

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex flex-wrap items-start justify-between gap-12px'>
        <div className='min-w-0'>
          <Typography.Text className='text-16px font-500 text-t-primary'>
            {t('settings.account.collaboration.title')}
          </Typography.Text>
          <div className='mt-4px text-13px text-t-secondary'>{t('settings.account.collaboration.description')}</div>
        </div>
        <Button icon={<Refresh theme='outline' size={15} />} onClick={() => void load()} disabled={loading}>
          {t('common.refresh')}
        </Button>
      </div>

      {unavailable ? (
        <Alert type='info' content={t('settings.account.collaboration.errors.featureUnavailable')} />
      ) : null}
      {loadError ? <Alert type='error' content={loadError} closable onClose={() => setLoadError(null)} /> : null}

      {!unavailable ? (
        <>
          <div className='rd-12px border border-border-2 bg-fill-1 px-16px py-14px'>
            <div className='mb-8px flex items-center gap-8px text-t-primary'>
              <Share theme='outline' size={16} className='text-t-secondary' />
              <span className='font-500'>{t('settings.account.collaboration.shareResource')}</span>
            </div>
            <div className='mb-12px text-12px text-t-secondary'>
              {t('settings.account.collaboration.shareResourceHint')}
            </div>
            <div className='flex flex-wrap items-center gap-10px'>
              <Select
                className='w-160px'
                value={resourceType}
                onChange={(value) => setResourceType(value as ShareResourceType)}
              >
                {SHAREABLE_TYPES.map((type) => (
                  <Select.Option key={type} value={type}>
                    {shareResourceLabel(type, t)}
                  </Select.Option>
                ))}
              </Select>
              <Select
                className='min-w-240px flex-1'
                placeholder={emptyPicker}
                value={selectedResourceId}
                onChange={(value) => setSelectedResourceId(value as string)}
                showSearch
                allowClear
                disabled={resourceOptions.length === 0}
                filterOption={(inputValue, option) => {
                  const label = String((option as { children?: unknown } | undefined)?.children ?? '');
                  return label.toLowerCase().includes(inputValue.toLowerCase());
                }}
              >
                {resourceOptions.map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    {item.name}
                  </Select.Option>
                ))}
              </Select>
              <Button type='primary' onClick={openShareDialog} disabled={resourceOptions.length === 0}>
                {t('settings.account.collaboration.shareWithUser')}
              </Button>
            </div>
          </div>

          <Tabs activeTab={activeTab} onChange={(key) => setActiveTab(key as CollaborationTab)}>
            <Tabs.TabPane key='received' title={t('settings.account.collaboration.tabs.received')}>
              <div className='overflow-hidden rd-12px border border-border-2 bg-bg-2'>
                <Table
                  rowKey='id'
                  loading={loading}
                  pagination={false}
                  data={received}
                  columns={receivedColumns}
                  noDataElement={
                    <div className='py-28px text-center text-t-secondary'>
                      {t('settings.account.collaboration.emptyReceived')}
                    </div>
                  }
                />
              </div>
            </Tabs.TabPane>
            <Tabs.TabPane key='granted' title={t('settings.account.collaboration.tabs.granted')}>
              <div className='overflow-hidden rd-12px border border-border-2 bg-bg-2'>
                <Table
                  rowKey='id'
                  loading={loading}
                  pagination={false}
                  data={granted}
                  columns={grantedColumns}
                  noDataElement={
                    <div className='py-28px text-center text-t-secondary'>
                      {t('settings.account.collaboration.emptyGranted')}
                    </div>
                  }
                />
              </div>
            </Tabs.TabPane>
          </Tabs>
        </>
      ) : null}

      {shareTarget ? (
        <ShareDialog
          visible
          resourceType={shareTarget.resourceType}
          resourceId={shareTarget.resourceId}
          resourceName={shareTarget.resourceName}
          onClose={() => setShareTarget(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </div>
  );
};

export default CollaborationPanel;
