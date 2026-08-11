/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend, AcpModelInfo, AcpSessionConfigOption } from '@/common/types/acpTypes';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import GuidAcpConfigSelector from '@/renderer/pages/guid/components/GuidAcpConfigSelector';
import { Button, Input, Select } from '@arco-design/web-react';
import { Copy } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CliModelOption, CliOption, ProviderModelOption } from '../types';

type ConversationCreateGeneratorTabProps = {
  cliOptions: CliOption[];
  providerModelOptions: ProviderModelOption[];
  selectedCli: string;
  selectedCliOption?: CliOption;
  selectedProviderModel: string;
  selectedCliInitialModelId?: string;
  selectedCliLocalModelInfo: AcpModelInfo | null;
  cliModelOptions: CliModelOption[];
  usingAcpModelSource: boolean;
  requiresProviderModel: boolean;
  modeOptions: Array<{ value: string; label: string }>;
  modeBackend?: AcpBackend | 'gemini' | 'codex';
  canUseModeSelector: boolean;
  selectedMode: string;
  currentCliBackend?: AcpBackend;
  currentCliConfigOptions: AcpSessionConfigOption[];
  selectedCliConfigOptions: Record<string, string>;
  workspace: string;
  message: string;
  generatedPayloadText: string;
  onCliChange: (value: string) => void;
  onProviderModelChange: (value: string) => void;
  onCliModelChange: (value: string) => void;
  onModeChange: (value: string) => void;
  onCliConfigOptionChange: (configId: string, value: string) => void;
  onWorkspaceChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onRefreshSources: () => void;
  onCopyGeneratedPayload: () => void;
};

const ConversationCreateGeneratorTab: React.FC<ConversationCreateGeneratorTabProps> = ({
  cliOptions,
  providerModelOptions,
  selectedCli,
  selectedCliOption,
  selectedProviderModel,
  selectedCliInitialModelId,
  selectedCliLocalModelInfo,
  cliModelOptions,
  usingAcpModelSource,
  requiresProviderModel,
  modeOptions,
  modeBackend,
  canUseModeSelector,
  selectedMode,
  currentCliBackend,
  currentCliConfigOptions,
  selectedCliConfigOptions,
  workspace,
  message,
  generatedPayloadText,
  onCliChange,
  onProviderModelChange,
  onCliModelChange,
  onModeChange,
  onCliConfigOptionChange,
  onWorkspaceChange,
  onMessageChange,
  onRefreshSources,
  onCopyGeneratedPayload,
}) => {
  const { t } = useTranslation();

  return (
    <div className='grid gap-16px'>
      <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
        <h4 className='mb-4px text-14px font-600 text-t-primary'>{t('settings.apiPage.generator.title')}</h4>
        <p className='text-12px text-t-tertiary'>{t('settings.apiPage.generator.description')}</p>
      </section>

      <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
        <div className='grid gap-16px md:grid-cols-2'>
          <div>
            <label className='mb-6px block text-13px text-t-primary'>{t('settings.apiPage.generator.cliLabel')}</label>
            <Select
              value={selectedCli}
              onChange={onCliChange}
              options={cliOptions.map((item) => ({ label: item.label, value: item.value }))}
              placeholder={t('settings.apiPage.generator.cliPlaceholder')}
            />
          </div>

          {usingAcpModelSource ? (
            <div>
              <label className='mb-6px block text-13px text-t-primary'>
                {t('settings.apiPage.generator.cliModelLabel')}
              </label>
              <div className='min-h-32px flex items-center gap-8px'>
                <AcpModelSelector
                  backend={selectedCliOption?.backend}
                  initialModelId={selectedCliInitialModelId}
                  localModelInfo={selectedCliLocalModelInfo}
                  onSelectModel={onCliModelChange}
                />
              </div>
              {cliModelOptions.length === 0 ? (
                <p className='mt-4px text-12px text-t-tertiary'>{t('settings.apiPage.generator.noCachedModels')}</p>
              ) : null}
            </div>
          ) : requiresProviderModel ? (
            <div>
              <label className='mb-6px block text-13px text-t-primary'>
                {t('settings.apiPage.generator.modelLabel')}
              </label>
              <Select
                value={selectedProviderModel || providerModelOptions[0]?.value}
                onChange={onProviderModelChange}
                options={providerModelOptions.map((item) => ({ label: item.label, value: item.value }))}
                placeholder={
                  providerModelOptions.length > 0
                    ? t('settings.apiPage.generator.modelPlaceholder')
                    : t('settings.apiPage.generator.modelFallbackPlaceholder')
                }
                allowClear={false}
              />
            </div>
          ) : (
            <div>
              <label className='mb-6px block text-13px text-t-primary'>
                {t('settings.apiPage.generator.modelLabel')}
              </label>
              <div className='min-h-32px flex items-center text-12px text-t-tertiary'>
                {t('settings.apiPage.generator.modelNotRequired')}
              </div>
            </div>
          )}

          <div>
            <label className='mb-6px block text-13px text-t-primary'>{t('settings.apiPage.generator.modeLabel')}</label>
            <div className='min-h-32px flex items-center gap-8px'>
              {canUseModeSelector ? (
                <AgentModeSelector
                  backend={modeBackend}
                  compact
                  initialMode={selectedMode}
                  onModeSelect={onModeChange}
                  modeLabelFormatter={(mode) => mode.label}
                  compactLabelPrefix='Mode'
                />
              ) : (
                <Select
                  value={selectedMode}
                  onChange={onModeChange}
                  options={modeOptions.map((item) => ({ label: item.label, value: item.value }))}
                  allowClear={false}
                />
              )}
            </div>
          </div>

          <div>
            <label className='mb-6px block text-13px text-t-primary'>
              {t('settings.apiPage.generator.configOptionsLabel')}
            </label>
            <div className='min-h-32px flex flex-wrap items-center gap-8px'>
              <GuidAcpConfigSelector
                backend={currentCliBackend}
                configOptions={currentCliConfigOptions}
                selectedValues={selectedCliConfigOptions}
                onSelectOption={onCliConfigOptionChange}
              />
              {currentCliBackend && currentCliConfigOptions.length === 0 ? (
                <span className='text-12px text-t-tertiary'>{t('settings.apiPage.generator.noExtraOptions')}</span>
              ) : null}
              {!currentCliBackend ? (
                <span className='text-12px text-t-tertiary'>{t('settings.apiPage.generator.configOptionsHint')}</span>
              ) : null}
            </div>
          </div>

          <div className='md:col-span-2'>
            <label className='mb-6px block text-13px text-t-primary'>
              {t('settings.apiPage.generator.workspaceLabel')}
            </label>
            <Input
              value={workspace}
              onChange={onWorkspaceChange}
              allowClear
              placeholder={t('settings.apiPage.generator.workspacePlaceholder')}
            />
          </div>

          <div className='md:col-span-2'>
            <label className='mb-6px block text-13px text-t-primary'>
              {t('settings.apiPage.generator.messageLabel')}
            </label>
            <Input
              value={message}
              onChange={onMessageChange}
              placeholder={t('settings.apiPage.generator.messagePlaceholder')}
            />
          </div>
        </div>
      </section>

      <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
        <div className='mb-8px flex flex-wrap items-center justify-between gap-12px'>
          <div>
            <h4 className='mb-4px text-14px font-600 text-t-primary'>{t('settings.apiPage.generator.resultTitle')}</h4>
            <p className='text-12px text-t-tertiary'>{t('settings.apiPage.generator.resultDescription')}</p>
          </div>
          <div className='flex flex-wrap gap-8px'>
            <Button size='small' onClick={onRefreshSources}>
              {t('common.refresh')}
            </Button>
            <Button size='small' icon={<Copy />} onClick={onCopyGeneratedPayload}>
              {t('settings.apiPage.generator.copyJson')}
            </Button>
          </div>
        </div>
        <Input.TextArea
          value={generatedPayloadText}
          readOnly
          className='font-mono'
          autoSize={{ minRows: 10, maxRows: 22 }}
        />
      </section>
    </div>
  );
};

export default ConversationCreateGeneratorTab;
