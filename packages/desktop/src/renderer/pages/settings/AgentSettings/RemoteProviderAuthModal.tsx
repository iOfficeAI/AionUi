/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { RemoteAgentConfig } from '@/common/types/agent/remoteAgentTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Button, Input, Message, Spin, Tag, Typography } from '@arco-design/web-react';
import { Key, LinkOne, Refresh } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

type ProviderRow = {
  id: string;
  name: string;
  connected: boolean;
};

type ProviderCatalog = {
  all?: Array<{ id?: string; name?: string }>;
  connected?: string[];
};

function parseProviderCatalog(raw: unknown): ProviderRow[] {
  if (!raw || typeof raw !== 'object') return [];
  const catalog = raw as ProviderCatalog;
  const connected = new Set((catalog.connected ?? []).filter(Boolean));
  const all = catalog.all ?? [];
  return all
    .map((p) => {
      const id = p.id?.trim();
      if (!id) return null;
      return {
        id,
        name: p.name?.trim() || id,
        connected: connected.has(id),
      };
    })
    .filter((p): p is ProviderRow => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function extractOAuthUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const candidates = [obj.url, obj.authorizeUrl, obj.authorize_url, obj.redirect];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  const nested = obj.authorize;
  if (nested && typeof nested === 'object') {
    const url = (nested as Record<string, unknown>).url;
    if (typeof url === 'string' && url.startsWith('http')) return url;
  }
  return null;
}

const RemoteProviderAuthModal: React.FC<{
  visible: boolean;
  agent?: RemoteAgentConfig;
  onClose: () => void;
}> = ({ visible, agent, onClose }) => {
  const { t } = useTranslation();
  const agentId = agent?.id;
  const swrKey = visible && agentId ? `remote-agent-providers:${agentId}` : null;
  const { data, error, isLoading, mutate } = useSWR(swrKey, () =>
    ipcBridge.remoteAgent.listProviders.invoke({ id: agentId! })
  );

  const providers = useMemo(() => parseProviderCatalog(data), [data]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [oauthCodes, setOauthCodes] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  const setProviderBusy = useCallback((id: string | null) => setBusyProvider(id), []);

  const handleSaveApiKey = useCallback(
    async (providerId: string) => {
      if (!agentId) return;
      const api_key = apiKeys[providerId]?.trim();
      if (!api_key) {
        Message.warning(t('settings.remoteAgent.providers.apiKeyRequired'));
        return;
      }
      setProviderBusy(providerId);
      try {
        await ipcBridge.remoteAgent.setProviderAuth.invoke({ id: agentId, providerId, api_key });
        Message.success(t('settings.remoteAgent.providers.saved', { name: providerId }));
        setApiKeys((prev) => ({ ...prev, [providerId]: '' }));
        await mutate();
      } catch (e) {
        Message.error(t('settings.remoteAgent.providers.saveFailed', { error: String(e) }));
      } finally {
        setProviderBusy(null);
      }
    },
    [agentId, apiKeys, mutate, t]
  );

  const handleClearAuth = useCallback(
    async (providerId: string) => {
      if (!agentId) return;
      setProviderBusy(providerId);
      try {
        await ipcBridge.remoteAgent.deleteProviderAuth.invoke({ id: agentId, providerId });
        Message.success(t('settings.remoteAgent.providers.cleared', { name: providerId }));
        await mutate();
      } catch (e) {
        Message.error(t('settings.remoteAgent.providers.clearFailed', { error: String(e) }));
      } finally {
        setProviderBusy(null);
      }
    },
    [agentId, mutate, t]
  );

  const handleStartOAuth = useCallback(
    async (providerId: string) => {
      if (!agentId) return;
      setProviderBusy(providerId);
      try {
        const payload = await ipcBridge.remoteAgent.startProviderOAuth.invoke({ id: agentId, providerId });
        const url = extractOAuthUrl(payload);
        if (!url) {
          Message.error(t('settings.remoteAgent.providers.oauthUrlMissing'));
          return;
        }
        await openExternalUrl(url);
        Message.info(t('settings.remoteAgent.providers.oauthOpened'));
      } catch (e) {
        Message.error(t('settings.remoteAgent.providers.oauthStartFailed', { error: String(e) }));
      } finally {
        setProviderBusy(null);
      }
    },
    [agentId, t]
  );

  const handleCompleteOAuth = useCallback(
    async (providerId: string) => {
      if (!agentId) return;
      const code = oauthCodes[providerId]?.trim();
      if (!code) {
        Message.warning(t('settings.remoteAgent.providers.oauthCodeRequired'));
        return;
      }
      setProviderBusy(providerId);
      try {
        await ipcBridge.remoteAgent.completeProviderOAuth.invoke({ id: agentId, providerId, code });
        Message.success(t('settings.remoteAgent.providers.oauthComplete', { name: providerId }));
        setOauthCodes((prev) => ({ ...prev, [providerId]: '' }));
        await mutate();
      } catch (e) {
        Message.error(t('settings.remoteAgent.providers.oauthCompleteFailed', { error: String(e) }));
      } finally {
        setProviderBusy(null);
      }
    },
    [agentId, mutate, oauthCodes, t]
  );

  return (
    <AionModal
      visible={visible}
      onCancel={onClose}
      header={{
        title: t('settings.remoteAgent.providers.title', { name: agent?.name ?? '' }),
        showClose: true,
      }}
      style={{ maxWidth: '720px', width: '92vw', borderRadius: 'var(--radius-panel)' }}
      contentStyle={{
        background: 'var(--dialog-fill-0)',
        borderRadius: 'var(--radius-panel)',
        padding: '16px 20px 12px',
        overflow: 'auto',
        maxHeight: 'min(78vh, 720px)',
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
        setApiKeys({});
        setOauthCodes({});
        setBusyProvider(null);
      }}
    >
      <div className='flex flex-col gap-12px'>
        <div className='rounded-12px border border-solid border-[rgba(var(--primary-6),0.12)] bg-[rgba(var(--primary-6),0.06)] px-14px py-12px'>
          <Typography.Text className='text-13px leading-20px text-t-secondary'>
            {t('settings.remoteAgent.providers.description')}
          </Typography.Text>
          {agent?.url ? (
            <Typography.Text type='secondary' className='mt-6px block text-12px truncate'>
              {agent.url}
            </Typography.Text>
          ) : null}
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
        ) : providers.length === 0 ? (
          <div className='rounded-12px border border-dashed border-[var(--color-border-2)] px-14px py-28px text-center'>
            <Typography.Text type='secondary'>{t('settings.remoteAgent.providers.empty')}</Typography.Text>
          </div>
        ) : (
          <div className='flex flex-col gap-10px'>
            {providers.map((provider) => {
              const busy = busyProvider === provider.id;
              return (
                <div
                  key={provider.id}
                  className='rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-14px'
                >
                  <div className='mb-10px flex flex-wrap items-center justify-between gap-8px'>
                    <div className='min-w-0'>
                      <Typography.Text className='block text-14px font-medium leading-20px'>
                        {provider.name}
                      </Typography.Text>
                      <Typography.Text type='secondary' className='text-12px'>
                        {provider.id}
                      </Typography.Text>
                    </div>
                    <Tag size='small' color={provider.connected ? 'green' : 'gray'}>
                      {provider.connected
                        ? t('settings.remoteAgent.providers.connected')
                        : t('settings.remoteAgent.providers.notConnected')}
                    </Tag>
                  </div>

                  <div className='flex flex-col gap-8px'>
                    <div className='flex flex-col gap-6px sm:flex-row sm:items-center'>
                      <Input.Password
                        size='small'
                        value={apiKeys[provider.id] ?? ''}
                        placeholder={t('settings.remoteAgent.providers.apiKeyPlaceholder')}
                        onChange={(v) => setApiKeys((prev) => ({ ...prev, [provider.id]: v }))}
                        disabled={busy}
                        className='flex-1'
                      />
                      <Button
                        size='small'
                        type='primary'
                        icon={<Key theme='outline' size={14} />}
                        loading={busy}
                        onClick={() => void handleSaveApiKey(provider.id)}
                      >
                        {t('settings.remoteAgent.providers.saveKey')}
                      </Button>
                    </div>

                    <div className='flex flex-col gap-6px sm:flex-row sm:items-center'>
                      <Button
                        size='small'
                        type='outline'
                        icon={<LinkOne theme='outline' size={14} />}
                        loading={busy}
                        onClick={() => void handleStartOAuth(provider.id)}
                      >
                        {t('settings.remoteAgent.providers.startOAuth')}
                      </Button>
                      <Input
                        size='small'
                        value={oauthCodes[provider.id] ?? ''}
                        placeholder={t('settings.remoteAgent.providers.oauthCodePlaceholder')}
                        onChange={(v) => setOauthCodes((prev) => ({ ...prev, [provider.id]: v }))}
                        disabled={busy}
                        className='flex-1'
                      />
                      <Button size='small' loading={busy} onClick={() => void handleCompleteOAuth(provider.id)}>
                        {t('settings.remoteAgent.providers.completeOAuth')}
                      </Button>
                    </div>

                    {provider.connected ? (
                      <Button
                        size='small'
                        type='text'
                        status='danger'
                        loading={busy}
                        onClick={() => void handleClearAuth(provider.id)}
                        className='self-start !px-0'
                      >
                        {t('settings.remoteAgent.providers.disconnect')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AionModal>
  );
};

export default RemoteProviderAuthModal;
