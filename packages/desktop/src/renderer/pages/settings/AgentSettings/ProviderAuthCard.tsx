/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { OpenCodeAuthPrompt, OpenCodeProviderView } from '@/common/types/opencode/opencodeProviderTypes';
import {
  apiMethodPresent,
  formatContextTokens,
  oauthMethodIndex,
  promptVisible,
} from '@/common/types/opencode/opencodeProviderCatalog';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Button, Collapse, Input, Message, Select, Tag, Typography } from '@arco-design/web-react';
import { Key, LinkOne } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const CollapseItem = Collapse.Item;

type OAuthSession = {
  methodIndex: number;
  oauthMethod: 'auto' | 'code';
  instructions?: string;
};

const ProviderAuthCard: React.FC<{
  agentId: string;
  view: OpenCodeProviderView;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onRefresh: () => Promise<unknown>;
}> = ({ agentId, view, busy, onBusy, onRefresh }) => {
  const { t } = useTranslation();
  const { provider, connected, authMethods, models, isDefaultProvider } = view;

  const [apiKey, setApiKey] = useState('');
  const [wellknownKey, setWellknownKey] = useState('');
  const [wellknownToken, setWellknownToken] = useState('');
  const [oauthCode, setOauthCode] = useState('');
  const [oauthInputs, setOauthInputs] = useState<Record<string, string>>({});
  const [oauthSession, setOauthSession] = useState<OAuthSession | null>(null);

  const oauthIdx = useMemo(() => oauthMethodIndex(authMethods), [authMethods]);
  const hasApiMethod = apiMethodPresent(authMethods);
  const oauthMethod = authMethods.find((m) => m.type === 'oauth');
  const visibleOAuthPrompts = useMemo(
    () => (oauthMethod?.prompts ?? []).filter((p) => promptVisible(p, oauthInputs)),
    [oauthMethod?.prompts, oauthInputs]
  );

  const sourceLabel = provider.source
    ? t(`settings.remoteAgent.providers.source.${provider.source}`, { defaultValue: provider.source })
    : undefined;

  const handleSaveApiKey = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      Message.warning(t('settings.remoteAgent.providers.apiKeyRequired'));
      return;
    }
    onBusy(provider.id);
    try {
      await ipcBridge.remoteAgent.setProviderAuth.invoke({ id: agentId, providerId: provider.id, api_key: key });
      Message.success(t('settings.remoteAgent.providers.saved', { name: provider.name }));
      setApiKey('');
      await onRefresh();
    } catch (e) {
      Message.error(t('settings.remoteAgent.providers.saveFailed', { error: String(e) }));
    } finally {
      onBusy(null);
    }
  }, [agentId, apiKey, onBusy, onRefresh, provider.id, provider.name, t]);

  const handleSaveWellknown = useCallback(async () => {
    const key = wellknownKey.trim();
    const token = wellknownToken.trim();
    if (!key || !token) {
      Message.warning(t('settings.remoteAgent.providers.wellknownRequired'));
      return;
    }
    onBusy(provider.id);
    try {
      await ipcBridge.remoteAgent.setProviderAuth.invoke({
        id: agentId,
        providerId: provider.id,
        wellknown_key: key,
        wellknown_token: token,
      });
      Message.success(t('settings.remoteAgent.providers.saved', { name: provider.name }));
      setWellknownKey('');
      setWellknownToken('');
      await onRefresh();
    } catch (e) {
      Message.error(t('settings.remoteAgent.providers.saveFailed', { error: String(e) }));
    } finally {
      onBusy(null);
    }
  }, [agentId, onBusy, onRefresh, provider.id, provider.name, t, wellknownKey, wellknownToken]);

  const handleClearAuth = useCallback(async () => {
    onBusy(provider.id);
    try {
      await ipcBridge.remoteAgent.deleteProviderAuth.invoke({ id: agentId, providerId: provider.id });
      Message.success(t('settings.remoteAgent.providers.cleared', { name: provider.name }));
      setOauthSession(null);
      await onRefresh();
    } catch (e) {
      Message.error(t('settings.remoteAgent.providers.clearFailed', { error: String(e) }));
    } finally {
      onBusy(null);
    }
  }, [agentId, onBusy, onRefresh, provider.id, provider.name, t]);

  const handleStartOAuth = useCallback(async () => {
    if (oauthIdx < 0) return;
    onBusy(provider.id);
    try {
      const payload = await ipcBridge.remoteAgent.startProviderOAuth.invoke({
        id: agentId,
        providerId: provider.id,
        method: oauthIdx,
        inputs: Object.keys(oauthInputs).length > 0 ? oauthInputs : undefined,
      });
      const rec = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const url = typeof rec.url === 'string' ? rec.url : null;
      const oauthMethodKind = rec.method === 'code' || rec.method === 'auto' ? rec.method : 'code';
      const instructions = typeof rec.instructions === 'string' ? rec.instructions : undefined;
      if (!url) {
        Message.error(t('settings.remoteAgent.providers.oauthUrlMissing'));
        return;
      }
      setOauthSession({ methodIndex: oauthIdx, oauthMethod: oauthMethodKind, instructions });
      await openExternalUrl(url);
      Message.info(instructions ?? t('settings.remoteAgent.providers.oauthOpened'));
    } catch (e) {
      Message.error(t('settings.remoteAgent.providers.oauthStartFailed', { error: String(e) }));
    } finally {
      onBusy(null);
    }
  }, [agentId, oauthIdx, oauthInputs, onBusy, provider.id, t]);

  const handleCompleteOAuth = useCallback(async () => {
    if (!oauthSession) return;
    const code = oauthCode.trim();
    if (oauthSession.oauthMethod === 'code' && !code) {
      Message.warning(t('settings.remoteAgent.providers.oauthCodeRequired'));
      return;
    }
    onBusy(provider.id);
    try {
      await ipcBridge.remoteAgent.completeProviderOAuth.invoke({
        id: agentId,
        providerId: provider.id,
        method: oauthSession.methodIndex,
        code: code || undefined,
      });
      Message.success(t('settings.remoteAgent.providers.oauthComplete', { name: provider.name }));
      setOauthCode('');
      setOauthSession(null);
      await onRefresh();
    } catch (e) {
      Message.error(t('settings.remoteAgent.providers.oauthCompleteFailed', { error: String(e) }));
    } finally {
      onBusy(null);
    }
  }, [agentId, oauthCode, oauthSession, onBusy, onRefresh, provider.id, provider.name, t]);

  const renderPrompt = (prompt: OpenCodeAuthPrompt, idx: number) => {
    const value = oauthInputs[prompt.key] ?? '';
    if (prompt.type === 'select') {
      return (
        <div key={`${prompt.key}-${idx}`} className='flex flex-col gap-4px'>
          <Typography.Text className='text-12px text-t-secondary'>{prompt.message}</Typography.Text>
          <Select
            size='small'
            value={value || undefined}
            placeholder={prompt.message}
            onChange={(v) => setOauthInputs((prev) => ({ ...prev, [prompt.key]: v }))}
            disabled={busy}
          >
            {prompt.options.map((opt) => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select>
        </div>
      );
    }
    return (
      <div key={`${prompt.key}-${idx}`} className='flex flex-col gap-4px'>
        <Typography.Text className='text-12px text-t-secondary'>{prompt.message}</Typography.Text>
        <Input
          size='small'
          value={value}
          placeholder={prompt.placeholder ?? prompt.message}
          onChange={(v) => setOauthInputs((prev) => ({ ...prev, [prompt.key]: v }))}
          disabled={busy}
        />
      </div>
    );
  };

  return (
    <div className='rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-14px'>
      <div className='mb-10px flex flex-wrap items-start justify-between gap-8px'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-6px'>
            <Typography.Text className='text-14px font-medium leading-20px'>{provider.name}</Typography.Text>
            {isDefaultProvider ? (
              <Tag size='small' color='arcoblue'>
                {t('settings.remoteAgent.providers.defaultProvider')}
              </Tag>
            ) : null}
          </div>
          <Typography.Text type='secondary' className='text-12px'>
            {provider.id}
          </Typography.Text>
          <div className='mt-6px flex flex-wrap gap-6px'>
            {sourceLabel ? (
              <Tag size='small' color='gray'>
                {sourceLabel}
              </Tag>
            ) : null}
            {provider.env?.map((envVar) => (
              <Tag key={envVar} size='small'>
                {envVar}
              </Tag>
            ))}
            <Tag size='small' color='purple'>
              {t('settings.remoteAgent.providers.modelCount', { count: models.length })}
            </Tag>
          </div>
        </div>
        <Tag size='small' color={connected ? 'green' : 'gray'}>
          {connected ? t('settings.remoteAgent.providers.connected') : t('settings.remoteAgent.providers.notConnected')}
        </Tag>
      </div>

      {authMethods.length > 0 ? (
        <div className='mb-10px flex flex-wrap gap-6px'>
          {authMethods.map((m, i) => (
            <Tag key={`${m.type}-${i}`} size='small' color={m.type === 'oauth' ? 'orangered' : 'cyan'}>
              {m.label || m.type}
            </Tag>
          ))}
        </div>
      ) : (
        <Typography.Text type='secondary' className='mb-10px block text-12px'>
          {t('settings.remoteAgent.providers.noAuthMethods')}
        </Typography.Text>
      )}

      {hasApiMethod ? (
        <div className='mb-10px flex flex-col gap-6px rounded-10px bg-[var(--color-fill-1)] p-10px'>
          <Typography.Text className='text-12px font-medium'>
            {t('settings.remoteAgent.providers.apiKeySection')}
          </Typography.Text>
          <div className='flex flex-col gap-6px sm:flex-row sm:items-center'>
            <Input.Password
              size='small'
              value={apiKey}
              placeholder={t('settings.remoteAgent.providers.apiKeyPlaceholder')}
              onChange={setApiKey}
              disabled={busy}
              className='flex-1'
            />
            <Button
              size='small'
              type='primary'
              icon={<Key theme='outline' size={14} />}
              loading={busy}
              onClick={() => void handleSaveApiKey()}
            >
              {t('settings.remoteAgent.providers.saveKey')}
            </Button>
          </div>
        </div>
      ) : null}

      {oauthIdx >= 0 ? (
        <div className='mb-10px flex flex-col gap-8px rounded-10px bg-[var(--color-fill-1)] p-10px'>
          <Typography.Text className='text-12px font-medium'>
            {oauthMethod?.label ?? t('settings.remoteAgent.providers.oauthSection')}
          </Typography.Text>
          {visibleOAuthPrompts.length > 0 ? (
            <div className='flex flex-col gap-8px'>{visibleOAuthPrompts.map(renderPrompt)}</div>
          ) : null}
          <div className='flex flex-wrap gap-8px'>
            <Button
              size='small'
              type='outline'
              icon={<LinkOne theme='outline' size={14} />}
              loading={busy}
              onClick={() => void handleStartOAuth()}
            >
              {t('settings.remoteAgent.providers.startOAuth')}
            </Button>
            {oauthSession ? (
              <>
                {oauthSession.oauthMethod === 'code' ? (
                  <Input
                    size='small'
                    value={oauthCode}
                    placeholder={t('settings.remoteAgent.providers.oauthCodePlaceholder')}
                    onChange={setOauthCode}
                    disabled={busy}
                    className='min-w-[180px] flex-1'
                  />
                ) : null}
                <Button size='small' loading={busy} onClick={() => void handleCompleteOAuth()}>
                  {t('settings.remoteAgent.providers.completeOAuth')}
                </Button>
              </>
            ) : null}
          </div>
          {oauthSession?.instructions ? (
            <Typography.Text type='secondary' className='text-12px leading-18px'>
              {oauthSession.instructions}
            </Typography.Text>
          ) : null}
        </div>
      ) : null}

      {!hasApiMethod && oauthIdx < 0 ? (
        <div className='mb-10px flex flex-col gap-6px rounded-10px bg-[var(--color-fill-1)] p-10px'>
          <Typography.Text className='text-12px font-medium'>
            {t('settings.remoteAgent.providers.wellknownSection')}
          </Typography.Text>
          <Input
            size='small'
            value={wellknownKey}
            placeholder={t('settings.remoteAgent.providers.wellknownKeyPlaceholder')}
            onChange={setWellknownKey}
            disabled={busy}
          />
          <Input.Password
            size='small'
            value={wellknownToken}
            placeholder={t('settings.remoteAgent.providers.wellknownTokenPlaceholder')}
            onChange={setWellknownToken}
            disabled={busy}
          />
          <Button size='small' loading={busy} onClick={() => void handleSaveWellknown()}>
            {t('settings.remoteAgent.providers.saveWellknown')}
          </Button>
        </div>
      ) : null}

      {models.length > 0 ? (
        <Collapse bordered={false} className='provider-models-collapse'>
          <CollapseItem
            header={t('settings.remoteAgent.providers.modelsHeader', { count: models.length })}
            name='models'
          >
            <div className='flex flex-col gap-6px max-h-[220px] overflow-y-auto pr-4px'>
              {models.map((model) => (
                <div
                  key={model.id}
                  className='flex flex-wrap items-center justify-between gap-6px rounded-8px border border-solid border-[var(--color-border-2)] px-10px py-8px'
                >
                  <div className='min-w-0'>
                    <Typography.Text className='block text-13px leading-18px'>{model.name}</Typography.Text>
                    <Typography.Text type='secondary' className='text-11px'>
                      {model.id}
                    </Typography.Text>
                  </div>
                  <div className='flex flex-wrap gap-4px'>
                    {model.status ? (
                      <Tag size='small' color={model.status === 'deprecated' ? 'red' : 'gray'}>
                        {model.status}
                      </Tag>
                    ) : null}
                    {model.limit?.context ? (
                      <Tag size='small'>{formatContextTokens(model.limit.context)} ctx</Tag>
                    ) : null}
                    {(model.capabilities?.toolcall ?? model.tool_call) ? (
                      <Tag size='small' color='green'>
                        tools
                      </Tag>
                    ) : null}
                    {(model.capabilities?.reasoning ?? model.reasoning) ? (
                      <Tag size='small' color='purple'>
                        reasoning
                      </Tag>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CollapseItem>
        </Collapse>
      ) : null}

      {connected ? (
        <Button
          size='small'
          type='text'
          status='danger'
          loading={busy}
          onClick={() => void handleClearAuth()}
          className='mt-8px !px-0'
        >
          {t('settings.remoteAgent.providers.disconnect')}
        </Button>
      ) : null}
    </div>
  );
};

export default ProviderAuthCard;
