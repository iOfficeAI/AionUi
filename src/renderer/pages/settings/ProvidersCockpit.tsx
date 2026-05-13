/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Checkbox, Input, Message, Tag } from '@arco-design/web-react';
import { IconCopy, IconDelete, IconLink, IconRefresh, IconSave, IconSearch } from '@arco-design/web-react/icon';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { shell, systemSettings } from '@/common/adapter/ipcBridge';
import { INTEGRATION_KEYS, type IntegrationDefinition } from '@/common/config/integrationKeys';

type IntegrationState = {
  configured: boolean;
  hasEnvironmentValue: boolean;
  placeholder: boolean;
};

type ProviderRoute = {
  name: string;
  mode: 'local' | 'cloud' | 'review' | 'swarm' | 'ops';
  command: string;
  description: string;
  requiredKeys: string[];
};

const GROUP_LABELS: Record<IntegrationDefinition['group'], string> = {
  core: 'Core models',
  cloud: 'Cloud providers',
  media: 'Media factory',
  ops: 'Ops connectors',
  developer: 'Developer tools',
};

const GROUP_ORDER: IntegrationDefinition['group'][] = ['core', 'cloud', 'media', 'ops', 'developer'];

const ROUTES: ProviderRoute[] = [
  {
    name: 'Local Fast',
    mode: 'local',
    command: 'nova-prompt-dispatch --profile local-fast "summarize current blocker"',
    description: 'Fast local Ollama path for short analysis and cleanup planning.',
    requiredKeys: [],
  },
  {
    name: 'Cloud Smart',
    mode: 'cloud',
    command: 'nova-prompt-dispatch --profile cloud-smart "review this plan"',
    description: 'Balanced cloud route through the existing NovaMaster dispatch layer.',
    requiredKeys: [],
  },
  {
    name: 'Qwen Free',
    mode: 'cloud',
    command: 'nova-prompt-dispatch --profile qwen-free "inspect this patch"',
    description: 'OpenRouter Qwen free route for cheap side reviews when an OpenRouter key is present.',
    requiredKeys: ['OPENROUTER_API_KEY'],
  },
  {
    name: 'Gemini Review',
    mode: 'review',
    command: 'nova-prompt-dispatch --profile gemini-review "find risks only"',
    description: 'Gemini as a focused reviewer for risk, missing tests and implementation drift.',
    requiredKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  },
  {
    name: 'Gemini + Qwen',
    mode: 'swarm',
    command: 'nova-prompt-dispatch --profile gemini-qwen "compare these implementation options"',
    description: 'Parallel Gemini and Qwen review lane for broad design or PR cleanup work.',
    requiredKeys: ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  },
  {
    name: 'Agent Swarm',
    mode: 'swarm',
    command: 'nova-prompt-dispatch --profile agent-swarm "triage the current stack"',
    description: 'Hermes, Gemini, Qwen and Ollama in one dispatch for heavy diagnosis.',
    requiredKeys: ['OPENROUTER_API_KEY'],
  },
  {
    name: 'Harness',
    mode: 'ops',
    command: 'nova-harness all',
    description: 'One command to check providers, GitHub, voice, receipts and operator readiness.',
    requiredKeys: [],
  },
  {
    name: 'Token Saver',
    mode: 'ops',
    command: 'nova-token-saver /home/faramix/AionUi',
    description: 'Create a compact context pack before sending work to cloud models.',
    requiredKeys: [],
  },
];

const MODE_COLOR: Record<ProviderRoute['mode'], string> = {
  local: 'green',
  cloud: 'arcoblue',
  review: 'orange',
  swarm: 'purple',
  ops: 'gray',
};

const API_KEY_EMPTY_LABEL = '********';

const isConfigured = (state?: IntegrationState) => {
  if (!state) return false;
  return !state.placeholder && (state.configured || state.hasEnvironmentValue);
};

const keyStatusLabel = (state?: IntegrationState) => {
  if (state?.placeholder) return 'placeholder';
  if (state?.configured) return 'stored';
  if (state?.hasEnvironmentValue) return 'runtime';
  return 'missing';
};

const keyStatusText = (state?: IntegrationState) => {
  if (state?.placeholder) return 'Placeholder found - replace it';
  if (state?.configured) return 'Stored in AionUi settings';
  if (state?.hasEnvironmentValue) return 'Available in runtime environment';
  return 'Missing';
};

const routeReady = (route: ProviderRoute, statusMap: Record<string, IntegrationState>) => {
  if (route.requiredKeys.length === 0) return true;
  return route.requiredKeys.some((key) => isConfigured(statusMap[key]));
};

const ProvidersCockpit: React.FC = () => {
  const [statusMap, setStatusMap] = useState<Record<string, IntegrationState>>({});
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [clearingMap, setClearingMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [query, setQuery] = useState('');

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

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const summary = useMemo(() => {
    return INTEGRATION_KEYS.reduce(
      (acc, item) => {
        const state = statusMap[item.envKey];
        if (state?.placeholder) {
          acc.placeholder += 1;
        } else if (isConfigured(state)) {
          acc.ready += 1;
        } else {
          acc.missing += 1;
        }
        return acc;
      },
      { ready: 0, missing: 0, placeholder: 0 }
    );
  }, [statusMap]);

  const readyPercent = useMemo(() => {
    if (INTEGRATION_KEYS.length === 0) return 0;
    return Math.round((summary.ready / INTEGRATION_KEYS.length) * 100);
  }, [summary.ready]);

  const visibleKeys = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return INTEGRATION_KEYS.filter((item) => {
      const state = statusMap[item.envKey];
      const matchesQuery =
        !normalizedQuery ||
        item.envKey.toLowerCase().includes(normalizedQuery) ||
        item.label.toLowerCase().includes(normalizedQuery) ||
        item.group.toLowerCase().includes(normalizedQuery);
      const matchesMissing = !showMissingOnly || !isConfigured(state);
      return matchesQuery && matchesMissing;
    });
  }, [query, showMissingOnly, statusMap]);

  const groupedKeys = useMemo(() => {
    return visibleKeys.reduce((acc, item) => {
      acc[item.group] = acc[item.group] || [];
      acc[item.group].push(item);
      return acc;
    }, {} as Record<IntegrationDefinition['group'], IntegrationDefinition[]>);
  }, [visibleKeys]);

  const handleOpenDocs = (url: string) => {
    void shell.openExternal.invoke(url).catch((error) => {
      console.error('[ProvidersCockpit] failed to open docs:', error);
      Message.error('Failed to open documentation link.');
    });
  };

  const handleCopy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      Message.success('Command copied.');
    } catch (error) {
      console.error('[ProvidersCockpit] failed to copy command:', error);
      Message.error('Failed to copy command.');
    }
  };

  const setDraft = (key: string, value: string) => {
    setDraftMap((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (envKey: string) => {
    const raw = (draftMap[envKey] || '').trim();
    if (!raw) {
      Message.warning('Paste a value before saving.');
      return;
    }

    setSavingMap((prev) => ({ ...prev, [envKey]: true }));
    try {
      await systemSettings.setIntegrationKey.invoke({ key: envKey, value: raw });
      Message.success(`${envKey} saved.`);
      setDraftMap((prev) => ({ ...prev, [envKey]: '' }));
      await loadStatus();
    } catch (error) {
      console.error('[ProvidersCockpit] failed to save key:', envKey, error);
      Message.error(`Failed to save ${envKey}.`);
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
          <div className='flex flex-wrap items-end justify-between gap-14px px-16px py-14px'>
            <div className='min-w-0'>
              <div className='text-20px font-semibold text-t-primary'>Provider Cockpit</div>
              <div className='mt-4px text-12px text-t-secondary'>
                NovaMaster routes, API-key readiness and token-saving commands in one operator page.
              </div>
            </div>
            <div className='flex flex-wrap gap-8px text-12px'>
              <Tag color='green'>ready {summary.ready}</Tag>
              <Tag color='orange'>missing {summary.missing}</Tag>
              <Tag color='red'>placeholder {summary.placeholder}</Tag>
              <Tag color='arcoblue'>num_ctx 8192</Tag>
            </div>
          </div>
          <div className='border-t border-line px-16px py-12px'>
            <div className='mb-6px flex items-center justify-between gap-12px text-12px'>
              <span className='font-medium text-t-primary'>Provider readiness</span>
              <span className='font-mono text-t-secondary'>{readyPercent}%</span>
            </div>
            <div className='h-6px overflow-hidden rd-999px bg-fill-2'>
              <div className='h-full rd-999px bg-success transition-all' style={{ width: `${readyPercent}%` }} />
            </div>
          </div>
        </div>

        <section className='mb-18px'>
          <div className='mb-8px text-12px font-semibold uppercase text-t-secondary'>Routes</div>
          <div className='grid gap-10px md:grid-cols-2'>
            {ROUTES.map((route) => {
              const ready = routeReady(route, statusMap);
              const requiredText = route.requiredKeys.length ? route.requiredKeys.join(' or ') : 'no key required';
              return (
                <div key={route.name} className='border border-line bg-fill-1 rd-8px p-12px transition-colors hover:bg-fill-2'>
                  <div className='flex items-start justify-between gap-10px'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-8px'>
                        <span className='text-13px font-medium text-t-primary'>{route.name}</span>
                        <Tag color={MODE_COLOR[route.mode]}>{route.mode}</Tag>
                        <Tag color={ready ? 'green' : 'orange'}>{ready ? 'ready' : 'needs key'}</Tag>
                      </div>
                      <div className='mt-4px text-12px text-t-secondary'>{route.description}</div>
                    </div>
                    <Button size='mini' type='outline' icon={<IconCopy />} onClick={() => void handleCopy(route.command)}>
                      Copy
                    </Button>
                  </div>
                  <div className='mt-8px break-all rd-6px bg-fill-2 px-8px py-6px font-mono text-12px text-t-secondary'>
                    {route.command}
                  </div>
                  <div className='mt-6px text-11px text-t-secondary'>Requires: {requiredText}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className='mb-12px flex flex-wrap items-center justify-between gap-10px'>
            <div>
              <div className='text-12px font-semibold uppercase text-t-secondary'>Keys</div>
              <div className='mt-2px text-12px text-t-secondary'>Values are write-only and never rendered back.</div>
            </div>
            <div className='flex flex-wrap items-center gap-8px'>
              <Input
                value={query}
                onChange={setQuery}
                allowClear
                prefix={<IconSearch className='text-14px text-t-secondary' />}
                placeholder='Search keys or groups'
                className='w-240px'
              />
              <Checkbox checked={showMissingOnly} onChange={setShowMissingOnly}>
                Missing only
              </Checkbox>
              <Button size='small' type='outline' icon={<IconRefresh />} loading={loading} onClick={() => void loadStatus()}>
                Refresh
              </Button>
            </div>
          </div>

          <div className='grid gap-14px'>
            {GROUP_ORDER.map((group) => {
              const items = groupedKeys[group] || [];
              if (items.length === 0) return null;

              return (
                <div key={group}>
                  <div className='mb-8px text-12px font-semibold text-t-secondary'>{GROUP_LABELS[group]}</div>
                  <div className='grid gap-10px'>
                    {items.map((item) => {
                      const state = statusMap[item.envKey];
                      const configured = isConfigured(state);
                      const hasValueDraft = (draftMap[item.envKey] || '').trim().length > 0;
                      const isSaving = !!savingMap[item.envKey];
                      const isClearing = !!clearingMap[item.envKey];
                      const canClear = (!!state?.configured || !!state?.placeholder) && !isClearing;
                      const tagColor = configured ? 'green' : state?.placeholder ? 'red' : 'orange';

                      return (
                        <div key={item.envKey} className='border border-line bg-fill-1 rd-8px p-12px transition-colors hover:bg-fill-2'>
                          <div className='flex flex-wrap items-start justify-between gap-10px'>
                            <div className='min-w-0'>
                              <div className='flex flex-wrap items-center gap-8px'>
                                <span className='text-13px font-medium text-t-primary'>{item.label}</span>
                                <Tag color={tagColor}>{keyStatusLabel(state)}</Tag>
                              </div>
                              <div className='mt-2px font-mono text-12px text-t-secondary'>{item.envKey}</div>
                              <div className={`mt-2px text-12px ${configured ? 'text-success' : state?.placeholder ? 'text-danger' : 'text-warning'}`}>
                                {keyStatusText(state)}
                              </div>
                            </div>
                            <Button size='mini' type='text' icon={<IconLink />} onClick={() => handleOpenDocs(item.link)}>
                              {item.docsLabel}
                            </Button>
                          </div>

                          <div className='mt-8px'>
                            <Input.TextArea
                              value={draftMap[item.envKey] || ''}
                              onChange={(value) => setDraft(item.envKey, value)}
                              autoSize={{ minRows: 1, maxRows: 3 }}
                              placeholder={configured ? `${API_KEY_EMPTY_LABEL} configured` : 'Paste value'}
                              disabled={loading}
                            />
                          </div>
                          <div className='mt-8px flex justify-end gap-8px'>
                            <Button
                              size='small'
                              type='outline'
                              icon={<IconSave />}
                              disabled={loading || !hasValueDraft}
                              loading={isSaving}
                              onClick={() => void handleSave(item.envKey)}
                            >
                              Save
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
                  </div>
                </div>
              );
            })}

            {!loading && visibleKeys.length === 0 ? <div className='text-12px text-t-secondary'>No matching keys.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProvidersCockpit;
