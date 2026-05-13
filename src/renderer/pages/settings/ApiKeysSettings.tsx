/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Checkbox, Input, Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { shell, systemSettings } from '@/common/adapter/ipcBridge';

type IntegrationState = {
  configured: boolean;
  hasEnvironmentValue: boolean;
};

type IntegrationDefinition = {
  envKey: string;
  label: string;
  link: string;
  docsLabel: string;
};

const INTEGRATION_KEYS: IntegrationDefinition[] = [
  {
    envKey: 'OPENAI_API_BASE',
    label: 'OpenAI API Base',
    link: 'https://platform.openai.com/docs/api-reference',
    docsLabel: 'OpenAI API Reference',
  },
  {
    envKey: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    link: 'https://platform.openai.com/api-keys',
    docsLabel: 'OpenAI API Keys',
  },
  {
    envKey: 'ANTHROPIC_API_BASE',
    label: 'Anthropic API Base',
    link: 'https://docs.anthropic.com/',
    docsLabel: 'Anthropic Docs',
  },
  {
    envKey: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API Key',
    link: 'https://docs.anthropic.com/en/api/api-keys',
    docsLabel: 'Anthropic API keys',
  },
  {
    envKey: 'GOOGLE_APPLICATION_CREDENTIALS_JSON',
    label: 'Google Credentials JSON',
    link: 'https://cloud.google.com/docs/authentication/provide-credentials-adc',
    docsLabel: 'Google auth docs',
  },
  {
    envKey: 'CLAUDE_API_KEY',
    label: 'Claude API Key',
    link: 'https://docs.anthropic.com/en/docs/quickstart',
    docsLabel: 'Claude docs',
  },
  {
    envKey: 'CLAUDE_ACCESS_TOKEN',
    label: 'Claude Access Token',
    link: 'https://claude.ai/settings/tokens',
    docsLabel: 'Claude token settings',
  },
  {
    envKey: 'HUGGINGFACE_API_KEY',
    label: 'Hugging Face API Key',
    link: 'https://huggingface.co/settings/tokens',
    docsLabel: 'HF token settings',
  },
  {
    envKey: 'HF_TOKEN',
    label: 'HF Token',
    link: 'https://huggingface.co/settings/tokens',
    docsLabel: 'HF token settings',
  },
  {
    envKey: 'KRYVAI_API_KEY',
    label: 'Kryvai API Key',
    link: 'https://app.kryvai.com/',
    docsLabel: 'Kryvai Console',
  },
  {
    envKey: 'SUNO_COOKIE',
    label: 'Suno Cookie',
    link: 'https://suno.com/',
    docsLabel: 'Suno',
  },
  {
    envKey: 'LIVEKIT_API_KEY',
    label: 'LiveKit API Key',
    link: 'https://docs.livekit.io/realtime/security/api-keys/',
    docsLabel: 'LiveKit API keys',
  },
  {
    envKey: 'LIVEKIT_API_SECRET',
    label: 'LiveKit API Secret',
    link: 'https://docs.livekit.io/realtime/security/api-keys/',
    docsLabel: 'LiveKit API keys',
  },
  {
    envKey: 'LIVEKIT_URL',
    label: 'LiveKit URL',
    link: 'https://docs.livekit.io/home/self-hosting/docker/',
    docsLabel: 'LiveKit host setup',
  },
  {
    envKey: 'CLICKUP_API_TOKEN',
    label: 'ClickUp API Token',
    link: 'https://help.clickup.com/hc/en-us/articles/6303420891089-API-Token',
    docsLabel: 'ClickUp API token',
  },
  {
    envKey: 'KAGGLE_USERNAME',
    label: 'Kaggle Username',
    link: 'https://www.kaggle.com/settings',
    docsLabel: 'Kaggle settings',
  },
  {
    envKey: 'WOLFRAM_ALPHA_API_KEY',
    label: 'Wolfram Alpha API Key',
    link: 'https://products.wolframalpha.com/api/',
    docsLabel: 'Wolfram Alpha API',
  },
  {
    envKey: 'CLAW3D_API_KEY',
    label: 'Claw3D API Key',
    link: 'https://app.claw3d.ai/',
    docsLabel: 'Claw3D',
  },
  {
    envKey: 'GITLAB_TOKEN',
    label: 'GitLab Token',
    link: 'https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html',
    docsLabel: 'GitLab PAT guide',
  },
];

const API_KEY_EMPTY_LABEL = '********';

const isConfigured = (state?: IntegrationState) => {
  if (!state) return false;
  return state.configured || state.hasEnvironmentValue;
};

const formatSourceText = (state?: IntegrationState) => {
  if (state?.configured) return 'Stored in AionUi (hidden)';
  if (state?.hasEnvironmentValue) return 'Available in process environment';
  return 'Not configured';
};

const ApiKeysSettings: React.FC = () => {
  const { t } = useTranslation();
  const [statusMap, setStatusMap] = useState<Record<string, IntegrationState>>({});
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [clearingMap, setClearingMap] = useState<Record<string, boolean>>({});
  const [showMissingOnly, setShowMissingOnly] = useState<boolean>(false);

  const missingCount = useMemo(() => {
    return INTEGRATION_KEYS.reduce((total, item) => {
      const status = statusMap[item.envKey];
      return total + (isConfigured(status) ? 0 : 1);
    }, 0);
  }, [statusMap]);

  const visibleKeys = useMemo(() => {
    if (!showMissingOnly) {
      return INTEGRATION_KEYS;
    }

    return INTEGRATION_KEYS.filter((item) => {
      const status = statusMap[item.envKey];
      return !isConfigured(status);
    });
  }, [showMissingOnly, statusMap]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = await systemSettings.getIntegrationKeysStatus.invoke();
      setStatusMap(statuses ?? {});
    } catch (error) {
      console.error('[ApiKeysSettings] failed to load integration key status:', error);
      Message.error(t('common.unknownError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const setDraft = (key: string, value: string) => {
    setDraftMap((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (envKey: string) => {
    const raw = (draftMap[envKey] || '').trim();
    if (!raw) {
      Message.warning('Paste the key value before saving.');
      return;
    }

    setSavingMap((prev) => ({ ...prev, [envKey]: true }));
    try {
      await systemSettings.setIntegrationKey.invoke({ key: envKey, value: raw });
      Message.success(`${envKey} ${t('common.saved', { defaultValue: 'saved' })}`);
      await loadStatus();
      setDraftMap((prev) => ({ ...prev, [envKey]: '' }));
    } catch (error) {
      console.error('[ApiKeysSettings] failed to save key:', envKey, error);
      Message.error(`Failed to save ${envKey}`);
    } finally {
      setSavingMap((prev) => ({ ...prev, [envKey]: false }));
    }
  };

  const handleClear = async (envKey: string) => {
    setClearingMap((prev) => ({ ...prev, [envKey]: true }));
    try {
      await systemSettings.clearIntegrationKey.invoke({ key: envKey });
      Message.success(`${envKey} ${t('common.cleared', { defaultValue: 'cleared' })}`);
      await loadStatus();
      setDraftMap((prev) => ({ ...prev, [envKey]: '' }));
    } catch (error) {
      console.error('[ApiKeysSettings] failed to clear key:', envKey, error);
      Message.error(`Failed to clear ${envKey}`);
    } finally {
      setClearingMap((prev) => ({ ...prev, [envKey]: false }));
    }
  };

  const handleOpenDocs = (url: string) => {
    void shell.openExternal.invoke(url).catch((error) => {
      console.error('[ApiKeysSettings] failed to open docs:', error);
      Message.error('Failed to open docs link');
    });
  };

  return (
    <SettingsPageWrapper>
      <div className='mx-auto w-full max-w-1024px'>
        <div className='mb-12px text-13px text-t-secondary'>
          Store service/API keys in AionUi settings so all local launchers inherit them. Existing values are never rendered back.
        </div>

        <div className='mb-12px rounded-8px border border-dashed border-line p-8px flex flex-wrap items-center justify-between gap-8px text-12px text-t-secondary'>
          <span>
            API keys status: <strong>{INTEGRATION_KEYS.length - missingCount} configured</strong>,
            <strong className='ml-4px text-warning'>{missingCount} missing</strong>
          </span>
          <Checkbox checked={showMissingOnly} onChange={setShowMissingOnly}>
            Show missing only
          </Checkbox>
        </div>

        <div className='grid gap-12px'>
          {visibleKeys.map((item) => {
            const status = statusMap[item.envKey];
            const configured = isConfigured(status);
            const hasValueDraft = (draftMap[item.envKey] || '').trim().length > 0;
            const statusText = formatSourceText(status);
            const isSaving = !!savingMap[item.envKey];
            const isClearing = !!clearingMap[item.envKey];
            const canSave = !loading;
            const canClear = !!status?.configured && !isClearing;

            return (
              <div key={item.envKey} className='px-12px py-12px bg-fill-2 rd-12px'>
                <div className='flex items-start justify-between gap-12px'>
                  <div className='min-w-0 flex-1'>
                    <div className='font-medium text-13px text-t-primary'>{item.label}</div>
                    <div className='mt-1 text-12px text-t-secondary font-mono'>{item.envKey}</div>
                    <div
                      className={`mt-2px text-12px ${
                        configured ? 'text-success' : 'text-warning'
                      }`}
                    >
                      {statusText}
                    </div>
                  </div>
                  <button
                    type='button'
                    className='text-12px text-primary bg-transparent border-none px-0 cursor-pointer whitespace-nowrap'
                    onClick={() => handleOpenDocs(item.link)}
                  >
                    {item.docsLabel}
                  </button>
                </div>
                <div className='mt-8px'>
                  <Input.TextArea
                    value={draftMap[item.envKey] || ''}
                    onChange={(value) => setDraft(item.envKey, value)}
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    placeholder={configured ? `${API_KEY_EMPTY_LABEL} ${statusText}` : 'Enter value'}
                    className='w-full'
                    disabled={loading}
                  />
                </div>
                <div className='mt-8px flex items-center justify-end gap-8px'>
                  <Button size='small' type='outline' disabled={!canSave || !hasValueDraft} loading={isSaving} onClick={() => handleSave(item.envKey)}>
                    {t('common.save')}
                  </Button>
                  <Button
                    size='small'
                    type='outline'
                    status='danger'
                    disabled={!canClear}
                    loading={isClearing}
                    onClick={() => handleClear(item.envKey)}
                  >
                    {t('common.clear', { defaultValue: 'Clear' })}
                  </Button>
                </div>
              </div>
            );
          })}

          {!loading && visibleKeys.length === 0 ? <div className='text-12px text-t-secondary'>No matching integration keys.</div> : null}

          {!loading && !showMissingOnly && INTEGRATION_KEYS.length === 0 ? (
            <div className='text-12px text-t-secondary'>No integration keys configured.</div>
          ) : null}
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default ApiKeysSettings;
