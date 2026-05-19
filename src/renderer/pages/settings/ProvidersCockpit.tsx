/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Checkbox, Input, Message, Select, Tag } from '@arco-design/web-react';
import { IconDelete, IconLink, IconRefresh, IconSave, IconSearch } from '@arco-design/web-react/icon';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { shell, systemSettings } from '@/common/adapter/ipcBridge';
import { INTEGRATION_KEYS, type IntegrationDefinition } from '@/common/config/integrationKeys';

type IntegrationState = {
  configured: boolean;
  hasEnvironmentValue: boolean;
  placeholder: boolean;
};

type PriorityFilter = 'must' | 'recommended' | 'optional' | 'all';
type AuthFilter = 'auth0' | 'oauth' | 'api-key' | 'local' | 'all';

type QuickStep = {
  title: string;
  body: string;
  docs: string;
  docsLabel: string;
};

const API_KEY_EMPTY_LABEL = '********';

const AUTH_MODE_LABELS: Record<NonNullable<IntegrationDefinition['authMode']>, string> = {
  auth0: 'Auth0',
  oauth: 'OAuth / browser login',
  'api-key': 'API key',
  local: 'Local value',
};

const PRIORITY_LABELS: Record<NonNullable<IntegrationDefinition['priority']>, string> = {
  must: 'Must fill',
  recommended: 'Recommended',
  optional: 'Optional later',
};

const PRIORITY_COLOR: Record<NonNullable<IntegrationDefinition['priority']>, string> = {
  must: 'red',
  recommended: 'orange',
  optional: 'gray',
};

const AUTH_COLOR: Record<NonNullable<IntegrationDefinition['authMode']>, string> = {
  auth0: 'purple',
  oauth: 'arcoblue',
  'api-key': 'orange',
  local: 'green',
};

const QUICK_STEPS: QuickStep[] = [
  {
    title: '1. Start with Auth0',
    body: 'Fill AUTH0_DOMAIN, AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET first. Use this as the central login layer for dashboards and client portals.',
    docs: 'https://manage.auth0.com/dashboard/',
    docsLabel: 'Open Auth0',
  },
  {
    title: '2. Browser-login where possible',
    body: 'Use browser/OAuth routes for Ollama Cloud, Claude and xAI/Grok when available. Only paste API keys for providers that cannot be connected by browser login.',
    docs: 'https://ollama.com/signin',
    docsLabel: 'Open Ollama login',
  },
  {
    title: '3. Fill fallback API keys',
    body: 'Add Gemini, OpenRouter, DeepSeek, Hugging Face, GitHub, Resend, Hostinger and LiveKit keys so NovaMaster can keep working when one provider is limited.',
    docs: 'https://github.com/settings/tokens',
    docsLabel: 'Open GitHub tokens',
  },
];

const getAuthMode = (item: IntegrationDefinition): NonNullable<IntegrationDefinition['authMode']> => item.authMode ?? 'api-key';
const getPriority = (item: IntegrationDefinition): NonNullable<IntegrationDefinition['priority']> => item.priority ?? 'optional';

const isConfigured = (state?: IntegrationState) => {
  if (!state) return false;
  return !state.placeholder && (state.configured || state.hasEnvironmentValue);
};

const keyStatusLabel = (state?: IntegrationState) => {
  if (state?.placeholder) return 'replace placeholder';
  if (state?.configured) return 'saved';
  if (state?.hasEnvironmentValue) return 'runtime env';
  return 'missing';
};

const keyStatusColor = (state?: IntegrationState) => {
  if (state?.placeholder) return 'red';
  if (isConfigured(state)) return 'green';
  return 'orange';
};

const keyStatusText = (state?: IntegrationState) => {
  if (state?.placeholder) return 'Placeholder detected. Replace it before using this provider.';
  if (state?.configured) return 'Stored in AionUi settings. Value is hidden.';
  if (state?.hasEnvironmentValue) return 'Available from process environment. Value is hidden.';
  return 'Not configured yet.';
};

const sortKeys = (items: IntegrationDefinition[]) => {
  const priorityRank: Record<NonNullable<IntegrationDefinition['priority']>, number> = { must: 0, recommended: 1, optional: 2 };
  const authRank: Record<NonNullable<IntegrationDefinition['authMode']>, number> = { auth0: 0, oauth: 1, 'api-key': 2, local: 3 };
  return items.toSorted((left, right) => {
    const priorityDelta = priorityRank[getPriority(left)] - priorityRank[getPriority(right)];
    if (priorityDelta !== 0) return priorityDelta;
    const authDelta = authRank[getAuthMode(left)] - authRank[getAuthMode(right)];
    if (authDelta !== 0) return authDelta;
    return left.label.localeCompare(right.label);
  });
};

const ProvidersCockpit: React.FC = () => {
  const [statusMap, setStatusMap] = useState<Record<string, IntegrationState>>({});
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [clearingMap, setClearingMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showMissingOnly, setShowMissingOnly] = useState(true);
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('must');
  const [authFilter, setAuthFilter] = useState<AuthFilter>('all');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = await systemSettings.getIntegrationKeysStatus.invoke();
      setStatusMap(statuses ?? {});
    } catch (error) {
      console.error('[ProvidersCockpit] failed to load integration key status:', error);
      Message.error('Failed to load provider key status.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    loadStatus().catch((error) => {
      console.error('[ProvidersCockpit] failed to refresh provider key status:', error);
    });
  }, [loadStatus]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const summary = useMemo(() => {
    return INTEGRATION_KEYS.reduce(
      (acc, item) => {
        const state = statusMap[item.envKey];
        const priority = getPriority(item);
        if (state?.placeholder) acc.placeholder += 1;
        else if (isConfigured(state)) acc.ready += 1;
        else {
          acc.missing += 1;
          acc.missingByPriority[priority] += 1;
        }
        return acc;
      },
      { ready: 0, missing: 0, placeholder: 0, missingByPriority: { must: 0, recommended: 0, optional: 0 } }
    );
  }, [statusMap]);

  const visibleKeys = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sortKeys(
      INTEGRATION_KEYS.filter((item) => {
        const state = statusMap[item.envKey];
        const authMode = getAuthMode(item);
        const priority = getPriority(item);
        const matchesQuery =
          !normalizedQuery ||
          item.envKey.toLowerCase().includes(normalizedQuery) ||
          item.label.toLowerCase().includes(normalizedQuery) ||
          item.group.toLowerCase().includes(normalizedQuery) ||
          authMode.includes(normalizedQuery);
        const matchesMissing = !showMissingOnly || !isConfigured(state);
        const matchesPriority = priorityFilter === 'all' || priority === priorityFilter;
        const matchesAuth = authFilter === 'all' || authMode === authFilter;
        return matchesQuery && matchesMissing && matchesPriority && matchesAuth;
      })
    );
  }, [authFilter, priorityFilter, query, showMissingOnly, statusMap]);

  const handleOpenDocs = (url: string) => {
    shell.openExternal.invoke(url).catch((error) => {
      console.error('[ProvidersCockpit] failed to open docs:', error);
      Message.error('Failed to open documentation link.');
    });
  };

  const setDraft = (key: string, value: string) => {
    setDraftMap((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (envKey: string) => {
    const raw = (draftMap[envKey] || '').trim();
    if (!raw) {
      Message.warning('Paste a value before committing.');
      return;
    }

    setSavingMap((prev) => ({ ...prev, [envKey]: true }));
    try {
      await systemSettings.setIntegrationKey.invoke({ key: envKey, value: raw });
      Message.success(`${envKey} committed.`);
      setDraftMap((prev) => ({ ...prev, [envKey]: '' }));
      await loadStatus();
    } catch (error) {
      console.error('[ProvidersCockpit] failed to commit key:', envKey, error);
      Message.error(`Failed to commit ${envKey}.`);
    } finally {
      setSavingMap((prev) => ({ ...prev, [envKey]: false }));
    }
  };

  const handleClear = async (envKey: string) => {
    setClearingMap((prev) => ({ ...prev, [envKey]: true }));
    try {
      await systemSettings.clearIntegrationKey.invoke({ key: envKey });
      Message.success(`${envKey} cleared.`);
      setDraftMap((prev) => ({ ...prev, [envKey]: '' }));
      await loadStatus();
    } catch (error) {
      console.error('[ProvidersCockpit] failed to clear key:', envKey, error);
      Message.error(`Failed to clear ${envKey}.`);
    } finally {
      setClearingMap((prev) => ({ ...prev, [envKey]: false }));
    }
  };

  return (
    <div className='settings-page-wrapper w-full min-h-full box-border overflow-y-auto px-12px md:px-40px py-32px'>
      <div className='settings-page-content mx-auto w-full md:max-w-1180px'>
        <div className='mb-16px overflow-hidden rd-8px border border-line bg-fill-1'>
          <div className='flex flex-wrap items-start justify-between gap-14px px-16px py-14px'>
            <div className='min-w-0'>
              <div className='text-20px font-semibold text-t-primary'>API Setup Cockpit</div>
              <div className='mt-4px text-12px text-t-secondary'>
                Fill Auth0 first, then browser/OAuth logins, then only the API keys that still need a manual value. Secrets are write-only.
              </div>
            </div>
            <div className='flex flex-wrap gap-8px text-12px'>
              <Tag color='green'>ready {summary.ready}</Tag>
              <Tag color='red'>must missing {summary.missingByPriority.must}</Tag>
              <Tag color='orange'>recommended missing {summary.missingByPriority.recommended}</Tag>
              <Tag color='gray'>optional missing {summary.missingByPriority.optional}</Tag>
              <Tag color='red'>placeholder {summary.placeholder}</Tag>
            </div>
          </div>
        </div>

        <section className='mb-18px grid gap-10px md:grid-cols-3'>
          {QUICK_STEPS.map((step) => (
            <div key={step.title} className='border border-line bg-fill-1 rd-8px p-12px'>
              <div className='text-13px font-semibold text-t-primary'>{step.title}</div>
              <div className='mt-6px text-12px text-t-secondary'>{step.body}</div>
              <Button className='mt-10px' size='small' type='outline' icon={<IconLink />} onClick={() => handleOpenDocs(step.docs)}>
                {step.docsLabel}
              </Button>
            </div>
          ))}
        </section>

        <section>
          <div className='mb-12px flex flex-wrap items-center justify-between gap-10px'>
            <div>
              <div className='text-12px font-semibold uppercase text-t-secondary'>Fill list</div>
              <div className='mt-2px text-12px text-t-secondary'>Default view shows only missing must-fill values so you can move fast.</div>
            </div>
            <div className='flex flex-wrap items-center gap-8px'>
              <Input
                value={query}
                onChange={setQuery}
                allowClear
                prefix={<IconSearch className='text-14px text-t-secondary' />}
                placeholder='Search key or provider'
                className='w-220px'
              />
              <Select value={priorityFilter} onChange={setPriorityFilter} className='w-150px'>
                <Select.Option value='must'>Must fill</Select.Option>
                <Select.Option value='recommended'>Recommended</Select.Option>
                <Select.Option value='optional'>Optional</Select.Option>
                <Select.Option value='all'>All priorities</Select.Option>
              </Select>
              <Select value={authFilter} onChange={setAuthFilter} className='w-160px'>
                <Select.Option value='all'>All auth</Select.Option>
                <Select.Option value='auth0'>Auth0 first</Select.Option>
                <Select.Option value='oauth'>OAuth/browser</Select.Option>
                <Select.Option value='api-key'>API key</Select.Option>
                <Select.Option value='local'>Local</Select.Option>
              </Select>
              <Checkbox checked={showMissingOnly} onChange={setShowMissingOnly}>
                Missing only
              </Checkbox>
              <Button size='small' type='outline' icon={<IconRefresh />} loading={loading} onClick={handleRefresh}>
                Refresh
              </Button>
            </div>
          </div>

          <div className='grid gap-10px'>
            {visibleKeys.map((item) => {
              const state = statusMap[item.envKey];
              const configured = isConfigured(state);
              const hasValueDraft = (draftMap[item.envKey] || '').trim().length > 0;
              const isSaving = !!savingMap[item.envKey];
              const isClearing = !!clearingMap[item.envKey];
              const canClear = (!!state?.configured || !!state?.placeholder) && !isClearing;
              const authMode = getAuthMode(item);
              const priority = getPriority(item);

              return (
                <div key={item.envKey} className='border border-line bg-fill-1 rd-8px p-12px transition-colors hover:bg-fill-2'>
                  <div className='flex flex-wrap items-start justify-between gap-10px'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-8px'>
                        <span className='text-13px font-medium text-t-primary'>{item.label}</span>
                        <Tag color={keyStatusColor(state)}>{keyStatusLabel(state)}</Tag>
                        <Tag color={AUTH_COLOR[authMode]}>{AUTH_MODE_LABELS[authMode]}</Tag>
                        <Tag color={PRIORITY_COLOR[priority]}>{PRIORITY_LABELS[priority]}</Tag>
                      </div>
                      <div className='mt-2px font-mono text-12px text-t-secondary'>{item.envKey}</div>
                      <div className={`mt-2px text-12px ${configured ? 'text-success' : state?.placeholder ? 'text-danger' : 'text-warning'}`}>
                        {keyStatusText(state)}
                      </div>
                      {item.setupHint ? <div className='mt-2px text-12px text-t-secondary'>{item.setupHint}</div> : null}
                    </div>
                    <div className='flex flex-wrap justify-end gap-8px'>
                      {item.helperLink ? (
                        <Button size='mini' type='outline' icon={<IconLink />} onClick={() => handleOpenDocs(item.helperLink!)}>
                          {item.helperLabel ?? 'Setup'}
                        </Button>
                      ) : null}
                      <Button size='mini' type='text' icon={<IconLink />} onClick={() => handleOpenDocs(item.link)}>
                        {item.docsLabel}
                      </Button>
                    </div>
                  </div>

                  <div className='mt-8px'>
                    <Input.TextArea
                      value={draftMap[item.envKey] || ''}
                      onChange={(value) => setDraft(item.envKey, value)}
                      autoSize={{ minRows: 1, maxRows: 3 }}
                      placeholder={configured ? `${API_KEY_EMPTY_LABEL} configured` : authMode === 'auth0' ? 'Paste Auth0 value' : 'Paste value'}
                      disabled={loading}
                    />
                  </div>
                  <div className='mt-8px flex justify-end gap-8px'>
                    <Button
                      size='small'
                      type='primary'
                      icon={<IconSave />}
                      disabled={loading || !hasValueDraft}
                      loading={isSaving}
                      onClick={() => void handleSave(item.envKey)}
                    >
                      Commit value
                    </Button>
                    <Button
                      size='small'
                      type='outline'
                      status='danger'
                      icon={<IconDelete />}
                      disabled={!canClear}
                      loading={isClearing}
                      onClick={() => void handleClear(item.envKey)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              );
            })}

            {!loading && visibleKeys.length === 0 ? <div className='text-12px text-t-secondary'>No matching missing keys. Switch filters to All.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProvidersCockpit;
