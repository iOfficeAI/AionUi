/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { buildProviderCatalogView } from '@/common/types/opencode/opencodeProviderCatalog';
import type { RemoteAgentConfig } from '@/common/types/agent/remoteAgentTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { Button, Input, Spin, Tag, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import ProviderAuthCard from './ProviderAuthCard';

type FilterMode = 'all' | 'connected' | 'disconnected';

async function fetchProviderBundle(agentId: string) {
  const [catalog, authMethods] = await Promise.all([
    ipcBridge.remoteAgent.listProviders.invoke({ id: agentId }),
    ipcBridge.remoteAgent.listProviderAuthMethods.invoke({ id: agentId }),
  ]);
  return buildProviderCatalogView(catalog, authMethods);
}

const RemoteProviderAuthModal: React.FC<{
  visible: boolean;
  agent?: RemoteAgentConfig;
  onClose: () => void;
}> = ({ visible, agent, onClose }) => {
  const { t } = useTranslation();
  const agentId = agent?.id;
  const swrKey = visible && agentId ? `remote-agent-providers-full:${agentId}` : null;
  const { data, error, isLoading, mutate } = useSWR(swrKey, () => fetchProviderBundle(agentId!));

  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  const filteredProviders = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.providers.filter((p) => {
      if (filter === 'connected' && !p.connected) return false;
      if (filter === 'disconnected' && p.connected) return false;
      if (!q) return true;
      return (
        p.provider.name.toLowerCase().includes(q) ||
        p.provider.id.toLowerCase().includes(q) ||
        p.models.some((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      );
    });
  }, [data, filter, search]);

  return (
    <AionModal
      visible={visible}
      onCancel={onClose}
      header={{
        title: t('settings.remoteAgent.providers.title', { name: agent?.name ?? '' }),
        showClose: true,
      }}
      style={{ maxWidth: '860px', width: '94vw', borderRadius: 'var(--radius-panel)' }}
      contentStyle={{
        background: 'var(--dialog-fill-0)',
        borderRadius: 'var(--radius-panel)',
        padding: '16px 20px 12px',
        overflow: 'auto',
        maxHeight: 'min(82vh, 820px)',
      }}
      footer={{
        render: () => (
          <div className='flex w-full items-center justify-between gap-8px'>
            <Button
              type='text'
              icon={<Refresh size={14} />}
              onClick={() => void mutate()}
              disabled={isLoading || !agentId}
            >
              {t('settings.remoteAgent.providers.refresh')}
            </Button>
            <Button onClick={onClose}>{t('settings.remoteAgent.cancel')}</Button>
          </div>
        ),
      }}
      afterClose={() => {
        setFilter('all');
        setSearch('');
        setBusyProvider(null);
      }}
    >
      <div className='flex flex-col gap-12px'>
        <div className='rounded-12px border border-solid border-[rgba(var(--primary-6),0.12)] bg-[rgba(var(--primary-6),0.06)] px-14px py-12px'>
          <Typography.Text className='text-13px leading-20px text-t-secondary'>
            {t('settings.remoteAgent.providers.description')}
          </Typography.Text>
          <Typography.Paragraph type='secondary' className='!mb-0 mt-6px text-12px leading-18px'>
            {t('settings.remoteAgent.providers.apiRefHint')}
          </Typography.Paragraph>
          {agent?.url ? (
            <Typography.Text type='secondary' className='mt-6px block truncate text-12px'>
              {agent.url}
            </Typography.Text>
          ) : null}
        </div>

        {data ? (
          <div className='flex flex-wrap items-center gap-8px rounded-10px border border-solid border-[var(--color-border-2)] px-12px py-10px'>
            <Tag color='green'>
              {t('settings.remoteAgent.providers.summaryConnected', { count: data.connectedCount })}
            </Tag>
            <Tag>{t('settings.remoteAgent.providers.summaryTotal', { count: data.providers.length })}</Tag>
            {data.defaultProviderId ? (
              <Tag color='arcoblue'>
                {t('settings.remoteAgent.providers.summaryDefault', {
                  provider: data.defaultProviderId,
                  model: data.defaultModelId ?? '—',
                })}
              </Tag>
            ) : null}
          </div>
        ) : null}

        <div className='flex flex-col gap-8px sm:flex-row sm:items-center'>
          <Input
            size='small'
            allowClear
            value={search}
            placeholder={t('settings.remoteAgent.providers.searchPlaceholder')}
            onChange={setSearch}
            className='flex-1'
          />
          <div className='flex flex-wrap gap-6px'>
            {(['all', 'connected', 'disconnected'] as const).map((mode) => (
              <Button
                key={mode}
                size='mini'
                type={filter === mode ? 'primary' : 'secondary'}
                onClick={() => setFilter(mode)}
              >
                {t(`settings.remoteAgent.providers.filter.${mode}`)}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className='flex justify-center py-40px'>
            <Spin />
          </div>
        ) : error ? (
          <div className='rounded-12px border border-solid border-[rgba(var(--danger-6),0.18)] bg-[rgba(var(--danger-6),0.06)] px-14px py-16px text-center'>
            <Typography.Text type='error' className='text-13px'>
              {t('settings.remoteAgent.providers.loadFailed', { error: String(error) })}
            </Typography.Text>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className='rounded-12px border border-dashed border-[var(--color-border-2)] px-14px py-28px text-center'>
            <Typography.Text type='secondary'>{t('settings.remoteAgent.providers.empty')}</Typography.Text>
          </div>
        ) : (
          <div className='flex flex-col gap-10px'>
            {filteredProviders.map((view) => (
              <ProviderAuthCard
                key={view.provider.id}
                agentId={agentId!}
                view={view}
                busy={busyProvider === view.provider.id}
                onBusy={setBusyProvider}
                onRefresh={mutate}
              />
            ))}
          </div>
        )}
      </div>
    </AionModal>
  );
};

export default RemoteProviderAuthModal;
