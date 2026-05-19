/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Checkbox, Input, Message, Select, Tag } from '@arco-design/web-react';
import { IconDelete, IconLink, IconRefresh, IconSave, IconSearch } from '@arco-design/web-react/icon';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import { shell, systemSettings } from '@/common/adapter/ipcBridge';
import { INTEGRATION_KEYS, type IntegrationDefinition } from '@/common/config/integrationKeys';

type IntegrationState = {
  configured: boolean;
  hasEnvironmentValue: boolean;
  placeholder: boolean;
};

type ProviderCredit = {
  id: string;
  label: string;
  kind: string;
  configured: boolean;
  configured_keys?: string[];
  billing_url: string;
  usage_url: string;
  notes: string;
  probe_status: string;
  probe_ok?: boolean;
  status_code?: number;
  credit_total_usd?: number;
  credit_used_usd?: number;
  credit_remaining_usd?: number;
  character_count?: number;
  character_limit?: number;
  characters_remaining?: number;
};

type ProviderCreditsPayload = {
  generated_at: string;
  live_probes: boolean;
  summary: {
    total: number;
    configured: number;
    missing: number;
    checked_live: number;
    live_ok: number;
    live_failed: number;
  };
  providers: ProviderCredit[];
};

type PriorityFilter = 'must' | 'recommended' | 'optional' | 'all';
type AuthFilter = 'auth0' | 'oauth' | 'api-key' | 'local' | 'all';

type QuickStep = {
  title: string;
  body: string;
  docs: string;
  docsLabel: string;
};

type QuickKey = {
  envKey: string;
  title: string;
  hint: string;
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
    title: '1. Noiz.ai nu',
    body: 'Plak NOIZ_API_KEY bovenaan. Geen filters, geen zoeken, meteen committen.',
    docs: 'https://noiz.ai/',
    docsLabel: 'Open Noiz.ai',
  },
  {
    title: '2. Auth0 daarna',
    body: 'Vul Auth0 pas daarna in voor centrale login: domain, client id en client secret.',
    docs: 'https://manage.auth0.com/dashboard/',
    docsLabel: 'Open Auth0',
  },
  {
    title: '3. Provider fallbacks',
    body: 'Daarna Gemini, OpenRouter, DeepSeek, GitHub, Resend, Hostinger en LiveKit.',
    docs: 'https://github.com/settings/tokens',
    docsLabel: 'Open GitHub tokens',
  },
];

const QUICK_KEYS: QuickKey[] = [
  { envKey: 'NOIZ_API_KEY', title: 'Noiz.ai API Key', hint: 'Plak hier je Noiz.ai key en klik Commit value.' },
  { envKey: 'STITCH_API_KEY', title: 'Google Stitch API Key', hint: 'Voor Stitch MCP design-to-code: key uit Stitch settings, nooit in chat plakken.' },
  { envKey: 'AUTH0_DOMAIN', title: 'Auth0 Domain', hint: 'Bijvoorbeeld jouw-tenant.eu.auth0.com' },
  { envKey: 'AUTH0_CLIENT_ID', title: 'Auth0 Client ID', hint: 'Auth0 application client id.' },
  { envKey: 'AUTH0_CLIENT_SECRET', title: 'Auth0 Client Secret', hint: 'Auth0 application secret. Niet delen buiten deze vault.' },
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

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const storeIntegrationKeyFallback = async (key: string, value: string) => {
  const response = await fetch('/api/novamaster/integration-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(withCsrfToken({ key, value })),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
};

const loadProviderCredits = async (): Promise<ProviderCreditsPayload | null> => {
  const response = await fetch('/api/novamaster/provider-credits', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!response.ok) return null;
  return (await response.json()) as ProviderCreditsPayload;
};

const formatCreditValue = (provider: ProviderCredit) => {
  if (typeof provider.credit_remaining_usd === 'number') {
    const used = typeof provider.credit_used_usd === 'number' ? ` · used $${provider.credit_used_usd.toFixed(2)}` : '';
    return `$${provider.credit_remaining_usd.toFixed(2)} remaining${used}`;
  }
  if (typeof provider.credit_used_usd === 'number') {
    return `$${provider.credit_used_usd.toFixed(2)} used`;
  }
  if (typeof provider.characters_remaining === 'number') {
    return `${provider.characters_remaining.toLocaleString()} chars remaining`;
  }
  if (provider.probe_ok === false) {
    return `live check failed${provider.status_code ? ` · HTTP ${provider.status_code}` : ''}`;
  }
  return provider.configured ? 'configured · manual/dashboard check' : 'missing key or login';
};

const creditStatusColor = (provider: ProviderCredit) => {
  if (!provider.configured) return 'gray';
  if (provider.probe_ok === false) return 'red';
  if (typeof provider.credit_remaining_usd === 'number' || typeof provider.characters_remaining === 'number') return 'green';
  return 'arcoblue';
};

const ProvidersCockpit: React.FC = () => {
  const [statusMap, setStatusMap] = useState<Record<string, IntegrationState>>({});
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [clearingMap, setClearingMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<ProviderCreditsPayload | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [showMissingOnly, setShowMissingOnly] = useState(true);
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('must');
  const [authFilter, setAuthFilter] = useState<AuthFilter>('all');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = await withTimeout(systemSettings.getIntegrationKeysStatus.invoke(), 3500, 'Provider key status');
      setStatusMap(statuses ?? {});
    } catch (error) {
      console.error('[ProvidersCockpit] failed to load integration key status:', error);
      Message.warning('Provider key status is slow. You can still paste and commit values.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCredits = useCallback(async () => {
    setCreditsLoading(true);
    try {
      setCredits(await withTimeout(loadProviderCredits(), 3500, 'Provider credits'));
    } catch (error) {
      console.error('[ProvidersCockpit] failed to load provider credits:', error);
      setCredits(null);
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    loadStatus().catch((error) => {
      console.error('[ProvidersCockpit] failed to refresh provider key status:', error);
    });
    loadCredits().catch((error) => {
      console.error('[ProvidersCockpit] failed to refresh provider credits:', error);
    });
  }, [loadCredits, loadStatus]);

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

  const quickItems = useMemo(() => {
    return QUICK_KEYS.map((quick) => {
      const definition = INTEGRATION_KEYS.find((item) => item.envKey === quick.envKey);
      if (!definition) return null;
      return { envKey: quick.envKey, title: quick.title, hint: quick.hint, definition };
    }).filter((item): item is QuickKey & { definition: IntegrationDefinition } => item !== null);
  }, []);

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
      try {
        await withTimeout(systemSettings.setIntegrationKey.invoke({ key: envKey, value: raw }), 5000, `Commit ${envKey}`);
      } catch (bridgeError) {
        console.warn('[ProvidersCockpit] bridge commit failed, using HTTP fallback:', envKey, bridgeError);
        await withTimeout(storeIntegrationKeyFallback(envKey, raw), 10000, `HTTP commit ${envKey}`);
      }

      Message.success(`${envKey} committed.`);
      setDraftMap((prev) => ({ ...prev, [envKey]: '' }));
      setStatusMap((prev) => ({
        ...prev,
        [envKey]: { configured: true, hasEnvironmentValue: !!prev[envKey]?.hasEnvironmentValue, placeholder: false },
      }));
      void loadStatus();
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
      await withTimeout(systemSettings.clearIntegrationKey.invoke({ key: envKey }), 10000, `Clear ${envKey}`);
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

        <section className='mb-18px'>
          <div className='mb-8px text-12px font-semibold uppercase text-t-secondary'>Direct invullen</div>
          <div className='grid gap-10px'>
            {quickItems.map(({ definition, envKey, hint, title }) => {
              const state = statusMap[envKey];
              const configured = isConfigured(state);
              const hasValueDraft = (draftMap[envKey] || '').trim().length > 0;
              const isSaving = !!savingMap[envKey];
              const isClearing = !!clearingMap[envKey];
              const canClear = (!!state?.configured || !!state?.placeholder) && !isClearing;

              return (
                <div key={envKey} className='border-2 border-primary bg-fill-1 rd-10px p-14px'>
                  <div className='flex flex-wrap items-start justify-between gap-10px'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-8px'>
                        <span className='text-15px font-semibold text-t-primary'>{title}</span>
                        <Tag color={keyStatusColor(state)}>{keyStatusLabel(state)}</Tag>
                      </div>
                      <div className='mt-2px font-mono text-12px text-t-secondary'>{envKey}</div>
                      <div className='mt-4px text-12px text-t-secondary'>{hint}</div>
                    </div>
                    <Button size='small' type='outline' icon={<IconLink />} onClick={() => handleOpenDocs(definition.link)}>
                      Open link
                    </Button>
                  </div>
                  <Input.TextArea
                    className='mt-10px'
                    value={draftMap[envKey] || ''}
                    onChange={(value) => setDraft(envKey, value)}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    placeholder={configured ? `${API_KEY_EMPTY_LABEL} configured - paste new value to replace` : 'Paste key/value here'}
                  />
                  <div className='mt-10px flex flex-wrap justify-end gap-8px'>
                    <Button size='large' type='primary' icon={<IconSave />} disabled={!hasValueDraft} loading={isSaving} onClick={() => void handleSave(envKey)}>
                      Commit value
                    </Button>
                    <Button size='large' type='outline' status='danger' icon={<IconDelete />} disabled={!canClear} loading={isClearing} onClick={() => void handleClear(envKey)}>
                      Clear
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className='mb-18px border border-line bg-fill-1 rd-8px p-14px'>
          <div className='mb-10px flex flex-wrap items-start justify-between gap-10px'>
            <div>
              <div className='text-14px font-semibold text-t-primary'>Credits & abonnementen</div>
              <div className='mt-2px text-12px text-t-secondary'>
                Samenvatting uit <span className='font-mono'>nova-provider-credits refresh</span>. Secrets blijven verborgen; sommige providers vereisen browser/login voor exact tegoed.
              </div>
            </div>
            <div className='flex flex-wrap gap-8px text-12px'>
              {credits ? (
                <>
                  <Tag color='green'>configured {credits.summary.configured}/{credits.summary.total}</Tag>
                  <Tag color='arcoblue'>live checked {credits.summary.checked_live}</Tag>
                  <Tag color={credits.summary.live_failed > 0 ? 'red' : 'green'}>live failed {credits.summary.live_failed}</Tag>
                </>
              ) : (
                <Tag color={creditsLoading ? 'arcoblue' : 'orange'}>{creditsLoading ? 'loading credits' : 'run nova-provider-credits refresh'}</Tag>
              )}
            </div>
          </div>
          <div className='grid gap-8px md:grid-cols-2'>
            {(credits?.providers ?? []).slice(0, 16).map((provider) => (
              <div key={provider.id} className='border border-line bg-fill-2 rd-8px p-10px'>
                <div className='flex items-start justify-between gap-8px'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-6px'>
                      <span className='text-13px font-medium text-t-primary'>{provider.label}</span>
                      <Tag color={creditStatusColor(provider)}>{provider.configured ? provider.probe_status : 'missing'}</Tag>
                    </div>
                    <div className='mt-3px text-12px text-t-secondary'>{formatCreditValue(provider)}</div>
                    <div className='mt-2px text-11px text-t-tertiary'>{provider.notes}</div>
                  </div>
                  <div className='flex shrink-0 gap-4px'>
                    <Button size='mini' type='text' icon={<IconLink />} onClick={() => handleOpenDocs(provider.usage_url)}>
                      Usage
                    </Button>
                    <Button size='mini' type='text' icon={<IconLink />} onClick={() => handleOpenDocs(provider.billing_url)}>
                      Billing
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!creditsLoading && !credits ? (
              <div className='text-12px text-t-secondary'>Geen cache gevonden. Run: <span className='font-mono'>nova-provider-credits refresh</span></div>
            ) : null}
          </div>
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
                    />
                  </div>
                  <div className='mt-8px flex justify-end gap-8px'>
                    <Button
                      size='small'
                      type='primary'
                      icon={<IconSave />}
                      disabled={!hasValueDraft}
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
