/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import type { IProvider } from '@/common/config/storage';
import type { ManagedRuntimeCliTarget } from '@/common/types/newApiAccount';
import {
  getManagedRuntimeCliBackendAliases,
  MANAGED_RUNTIME_CLI_TARGETS,
} from '@/common/types/agent/managedRuntimeCli';
import DesktopLoginGate from '@/renderer/components/layout/DesktopLoginGate';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { useAgents } from '@/renderer/hooks/agent/useAgents';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import { useNewApiAccount } from '@/renderer/hooks/context/NewApiAccountContext';
import { Button, Message, Select, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type AionrsAgentInfo = {
  available: boolean;
  version?: string;
};

type CliTargetOption = {
  key: ManagedRuntimeCliTarget;
  label: string;
  backendAliases: string[];
};

const NEW_API_MANAGED_PROVIDER_ID = 'desktop-newapi-managed-provider';
const NEW_API_CLI_MODEL_PREFS_KEY = 'newApi.desktop.cliModelPrefs';

const CLI_TARGETS: CliTargetOption[] = MANAGED_RUNTIME_CLI_TARGETS.map((key) => ({
  key,
  label: key === 'claude' ? 'Claude' : key === 'hermes' ? 'Hermes' : key === 'opencode' ? 'OpenCode' : 'OpenClaw',
  backendAliases: getManagedRuntimeCliBackendAliases(key),
}));

const AionrsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { agents } = useAgents();
  const { data: providers } = useProvidersQuery();
  const { status, isLoggedIn, refresh } = useNewApiAccount();
  const [savingTarget, setSavingTarget] = useState<ManagedRuntimeCliTarget | null>(null);

  const agentInfo = useMemo<AionrsAgentInfo | null>(() => {
    const agent = agents.find((a) => a.agent_type === 'aionrs' || a.backend === 'aionrs');
    return agent ? { available: agent.available } : { available: false };
  }, [agents]);

  const managedProvider = useMemo<IProvider | undefined>(
    () => providers?.find((provider) => provider.id === NEW_API_MANAGED_PROVIDER_ID),
    [providers]
  );

  const managedModels = managedProvider?.models ?? status.models ?? [];
  const cliModelPrefs =
    configService.get(NEW_API_CLI_MODEL_PREFS_KEY) ?? ({} as Partial<Record<ManagedRuntimeCliTarget, string>>);

  const handleCliModelChange = async (cliTarget: ManagedRuntimeCliTarget, modelId: string) => {
    setSavingTarget(cliTarget);
    const nextPrefs = {
      ...configService.get(NEW_API_CLI_MODEL_PREFS_KEY),
      [cliTarget]: modelId,
    };
    try {
      await configService.set(NEW_API_CLI_MODEL_PREFS_KEY, nextPrefs);
      const result = await ipcBridge.newApiAccount.reconcileModel.invoke({ cliTarget, modelId });
      if (!result.success) {
        throw new Error(result.msg || 'Failed to sync managed CLI model');
      }
      await refresh();
      Message.success(t('settings.saveSuccess', { defaultValue: 'Saved' }));
    } catch (error) {
      console.error('Failed to update managed CLI model preference:', error);
      Message.error(t('settings.saveModelConfigFailed'));
    } finally {
      setSavingTarget(null);
    }
  };

  if (!isLoggedIn) {
    return (
      <SettingsPageWrapper>
        <DesktopLoginGate />
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper>
      <div className='flex flex-col gap-16px'>
        <Typography.Title heading={5} className='!mb-0'>
          POUNDING CLI
        </Typography.Title>

        <div className='flex flex-col gap-8px p-16px rd-12px bg-aou-1'>
          <div className='flex items-center gap-8px'>
            <Typography.Text className='text-14px font-medium'>
              {t('common.status', { defaultValue: 'Status' })}
            </Typography.Text>
            <Tag color={agentInfo?.available ? 'green' : 'red'} size='small'>
              {agentInfo?.available
                ? t('settings.aionrs.available', { defaultValue: 'Available' })
                : t('settings.aionrs.notFound', { defaultValue: 'Not Found' })}
            </Tag>
          </div>
          {agentInfo?.version && (
            <Typography.Text type='secondary' className='text-12px'>
              {t('settings.aionrs.version', { defaultValue: 'Version' })}: {agentInfo.version}
            </Typography.Text>
          )}
          <Typography.Text type='secondary' className='text-12px'>
            {t('settings.aionrs.providerNote', {
              defaultValue:
                'Provider and API key settings are managed in the Models page. POUNDING CLI supports: Anthropic, OpenAI, AWS Bedrock.',
            })}
          </Typography.Text>
        </div>

        <div className='flex flex-col gap-12px p-16px rd-12px bg-aou-1'>
          <div className='flex items-start justify-between gap-12px flex-wrap'>
            <div className='flex flex-col gap-4px'>
              <Typography.Text className='text-14px font-medium'>
                {t('settings.aionrs.managedCliModelsTitle', { defaultValue: 'Managed CLI model mapping' })}
              </Typography.Text>
              <Typography.Text type='secondary' className='text-12px'>
                {t('settings.aionrs.managedCliModelsDesc', {
                  defaultValue:
                    'All local CLIs share the same POUNDING API base URL and API key. You can choose a different model for each CLI.',
                })}
              </Typography.Text>
            </div>
            <Tag color='arcoblue'>{managedProvider?.base_url || status.baseUrl}</Tag>
          </div>

          {managedModels.length > 0 ? (
            <div className='grid grid-cols-1 gap-12px'>
              {CLI_TARGETS.map((target) => {
                const matchedAgent = agents.find((agent) =>
                  target.backendAliases.includes((agent.backend || agent.agent_type || '').toLowerCase())
                );
                const selectedValue = cliModelPrefs[target.key] || managedModels[0];
                return (
                  <div
                    key={target.key}
                    className='flex flex-col gap-8px p-12px rd-10px bg-[var(--color-fill-2)] border border-solid border-[var(--color-border-2)]'
                  >
                    <div className='flex items-center justify-between gap-8px flex-wrap'>
                      <div className='flex items-center gap-8px'>
                        <Typography.Text className='text-14px font-medium'>{target.label}</Typography.Text>
                        <Tag color={matchedAgent?.available ? 'green' : 'orange'} size='small'>
                          {matchedAgent?.available
                            ? t('settings.aionrs.available', { defaultValue: 'Available' })
                            : t('settings.aionrs.notFound', { defaultValue: 'Not Found' })}
                        </Tag>
                      </div>
                      <Typography.Text type='secondary' className='text-12px'>
                        {t('settings.model', { defaultValue: 'Model' })}
                      </Typography.Text>
                    </div>

                    <Select
                      value={selectedValue}
                      placeholder={t('settings.model', { defaultValue: 'Model' })}
                      onChange={(value) => {
                        void handleCliModelChange(target.key, String(value));
                      }}
                      loading={savingTarget === target.key}
                    >
                      {managedModels.map((modelId) => (
                        <Select.Option key={modelId} value={modelId}>
                          {modelId}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                );
              })}
            </div>
          ) : (
            <Typography.Text type='secondary' className='text-12px'>
              {t('settings.aionrs.noManagedModels', {
                defaultValue: 'No managed models available yet. Please sign in again to refresh the model list.',
              })}
            </Typography.Text>
          )}

          <div className='flex justify-end'>
            <Button size='small' onClick={() => void refresh()}>
              {t('common.refresh', { defaultValue: 'Refresh' })}
            </Button>
          </div>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default AionrsSettings;
