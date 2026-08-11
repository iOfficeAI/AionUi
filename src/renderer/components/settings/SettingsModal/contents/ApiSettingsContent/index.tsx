/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_CALLBACK_BODY, DEFAULT_JS_FILTER_SCRIPT } from '@/common/apiCallback';
import { ipcBridge } from '@/common';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { ConfigStorage, type IApiConfig } from '@/common/config/storage';
import type { IWebUIStatus } from '@/common/adapter/ipcBridge';
import type { AcpBackend, AcpModelInfo, AcpSessionConfigOption } from '@/common/types/acpTypes';
import { getDefaultAcpConfigOptions } from '@/common/types/codex/codexConfigOptions';
import ExtensionSettingsTabContent from '@/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { Button, Message, Tabs } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ApiAuthTab from './tabs/ApiAuthTab';
import CallbackTab from './tabs/CallbackTab';
import ConversationCreateGeneratorTab from './tabs/ConversationCreateGeneratorTab';
import type { ApiTabKey, CliModelOption, CliOption, HeaderItem, ProviderModelOption } from './types';
import {
  DEFAULT_MESSAGE,
  buildCliOptions,
  createProviderModelOptions,
  generateApiToken,
  getFallbackModel,
  parseHeaders,
  parseOptionalString,
} from './utils';

const API_DIAGNOSTICS_EXTENSION_NAME = 'api-diagnostics-devtools';

const ApiSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const isDesktopRuntime = isElectronDesktop();
  const [activeTab, setActiveTab] = useState<ApiTabKey>('auth');
  const [diagnosticsTab, setDiagnosticsTab] = useState<IExtensionSettingsTab | null>(null);
  const [config, setConfig] = useState<Partial<IApiConfig>>({
    enabled: false,
    callbackEnabled: false,
    callbackMethod: 'POST',
    callbackHeaders: {},
    callbackBody: DEFAULT_CALLBACK_BODY,
    jsFilterEnabled: false,
    jsFilterScript: DEFAULT_JS_FILTER_SCRIPT,
  });
  const [headers, setHeaders] = useState<HeaderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [webuiStatus, setWebuiStatus] = useState<IWebUIStatus | null>(null);

  const [cliOptions, setCliOptions] = useState<CliOption[]>([]);
  const [providerModelOptions, setProviderModelOptions] = useState<ProviderModelOption[]>([]);
  const [acpCachedModels, setAcpCachedModels] = useState<Record<string, AcpModelInfo>>({});
  const [acpPreferredModelIds, setAcpPreferredModelIds] = useState<Record<string, string | undefined>>({});
  const [acpCachedConfigOptions, setAcpCachedConfigOptions] = useState<Record<string, AcpSessionConfigOption[]>>({});
  const [acpPreferredConfigOptions, setAcpPreferredConfigOptions] = useState<Record<string, Record<string, string>>>(
    {}
  );

  const [selectedCli, setSelectedCli] = useState('');
  const [selectedProviderModel, setSelectedProviderModel] = useState('');
  const [selectedCliModel, setSelectedCliModel] = useState('');
  const [selectedCliConfigOptions, setSelectedCliConfigOptions] = useState<Record<string, string>>({});
  const [selectedMode, setSelectedMode] = useState('default');
  const [workspace, setWorkspace] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const { resolveExtTabName } = useExtI18n();

  const loadApiConfig = useCallback(async () => {
    setLoading(true);

    try {
      const result = await ipcBridge.database.getApiConfig.invoke();
      if (result) {
        setConfig({
          ...result,
          callbackEnabled: result.callbackEnabled ?? !!result.callbackUrl,
          callbackBody: result.callbackBody || DEFAULT_CALLBACK_BODY,
          jsFilterEnabled: result.jsFilterEnabled ?? false,
          jsFilterScript: result.jsFilterScript || DEFAULT_JS_FILTER_SCRIPT,
        });
        setHeaders(parseHeaders(result.callbackHeaders));
      } else {
        setConfig((previous) => ({
          ...previous,
          callbackEnabled: false,
          callbackBody: DEFAULT_CALLBACK_BODY,
          jsFilterEnabled: false,
          jsFilterScript: DEFAULT_JS_FILTER_SCRIPT,
        }));
        setHeaders([]);
      }
    } catch (error) {
      console.error('[ApiSettings] Failed to load config:', error);
      Message.error(t('settings.apiPage.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadGeneratorOptions = useCallback(
    async (notifyOnError = false) => {
      try {
        const [providers, agentsResult, cachedModels, cachedConfigOptions, acpConfig] = await Promise.all([
          ipcBridge.mode.getModelConfig.invoke(),
          ipcBridge.acpConversation.getAvailableAgents.invoke(),
          ConfigStorage.get('acp.cachedModels'),
          ConfigStorage.get('acp.cachedConfigOptions'),
          ConfigStorage.get('acp.config'),
        ]);

        const nextProviderOptions = createProviderModelOptions(providers);
        setProviderModelOptions(nextProviderOptions);
        if (nextProviderOptions.length > 0) {
          setSelectedProviderModel((previous) => previous || nextProviderOptions[0].value);
        }

        setAcpCachedModels(cachedModels || {});
        setAcpCachedConfigOptions(cachedConfigOptions || {});

        const preferredModelMap: Record<string, string | undefined> = {};
        const preferredConfigMap: Record<string, Record<string, string>> = {};
        for (const [backend, backendConfig] of Object.entries(acpConfig || {})) {
          preferredModelMap[backend] = parseOptionalString(
            (backendConfig as { preferredModelId?: unknown } | undefined)?.preferredModelId
          );
          preferredConfigMap[backend] = {
            ...(((backendConfig as { preferredConfigOptions?: Record<string, string> } | undefined)
              ?.preferredConfigOptions || {}) as Record<string, string>),
          };
        }
        setAcpPreferredModelIds(preferredModelMap);
        setAcpPreferredConfigOptions(preferredConfigMap);

        const agents = agentsResult?.success && Array.isArray(agentsResult.data) ? agentsResult.data : [];
        const nextCliOptions = buildCliOptions(
          agents as Array<{
            backend?: AcpBackend;
            name?: string;
            cliPath?: string;
            customAgentId?: string;
          }>
        );

        setCliOptions(nextCliOptions);
        setSelectedCli((previous) =>
          nextCliOptions.some((item) => item.value === previous) ? previous : nextCliOptions[0]?.value || ''
        );
      } catch (error) {
        console.error('[ApiSettings] Failed to load generator options:', error);
        if (notifyOnError) {
          Message.error(t('settings.apiPage.generator.refreshFailed'));
        }
      }
    },
    [t]
  );

  const loadWebuiStatus = useCallback(async () => {
    if (!isDesktopRuntime) {
      setWebuiStatus(null);
      return;
    }

    try {
      const result = await ipcBridge.webui.getStatus.invoke();
      if (result?.success && result.data) {
        setWebuiStatus(result.data);
        return;
      }

      setWebuiStatus(null);
    } catch (error) {
      console.error('[ApiSettings] Failed to load WebUI status:', error);
      setWebuiStatus(null);
    }
  }, [isDesktopRuntime]);

  const loadDiagnosticsTab = useCallback(async () => {
    try {
      const tabs = (await extensionsIpc.getSettingsTabs.invoke()) ?? [];
      const nextDiagnosticsTab = tabs.find((tab) => tab._extensionName === API_DIAGNOSTICS_EXTENSION_NAME) ?? null;
      setDiagnosticsTab(nextDiagnosticsTab);
    } catch (error) {
      console.error('[ApiSettings] Failed to load diagnostics settings tab:', error);
      setDiagnosticsTab(null);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      loadApiConfig(),
      loadGeneratorOptions(),
      loadDiagnosticsTab(),
      isDesktopRuntime ? loadWebuiStatus() : Promise.resolve(),
    ]);
  }, [isDesktopRuntime, loadApiConfig, loadGeneratorOptions, loadWebuiStatus, loadDiagnosticsTab]);

  useEffect(() => {
    if (!isDesktopRuntime) {
      return;
    }

    const unsubscribe = ipcBridge.webui.statusChanged.on(() => {
      void loadWebuiStatus();
    });
    return () => unsubscribe();
  }, [isDesktopRuntime, loadWebuiStatus]);

  useEffect(() => {
    const unsubscribe = extensionsIpc.stateChanged.on(() => {
      void loadDiagnosticsTab();
    });
    return () => unsubscribe();
  }, [loadDiagnosticsTab]);

  const selectedCliOption = useMemo(
    () => cliOptions.find((item) => item.value === selectedCli) || cliOptions[0],
    [cliOptions, selectedCli]
  );
  const usingAcpModelSource = selectedCliOption?.conversationType === 'acp' && !!selectedCliOption.backend;
  const requiresProviderModel = selectedCliOption?.conversationType === 'gemini';
  const currentCliBackend = selectedCliOption?.conversationType === 'acp' ? selectedCliOption.backend : undefined;

  const cliModelOptions = useMemo<CliModelOption[]>(() => {
    if (!usingAcpModelSource || !selectedCliOption?.backend) {
      return [];
    }

    const modelInfo = acpCachedModels[selectedCliOption.backend];
    if (!modelInfo?.availableModels?.length) {
      return [];
    }

    return modelInfo.availableModels.map((item) => ({
      value: item.id,
      label: item.label || item.id,
    }));
  }, [usingAcpModelSource, selectedCliOption, acpCachedModels]);

  const selectedCliLocalModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!usingAcpModelSource || !selectedCliOption?.backend) {
      return null;
    }

    const modelInfo = acpCachedModels[selectedCliOption.backend];
    if (!modelInfo?.availableModels?.length) {
      return null;
    }

    const effectiveModelId = selectedCliModel || modelInfo.currentModelId || modelInfo.availableModels[0]?.id || null;
    const matchedModel = effectiveModelId
      ? modelInfo.availableModels.find((item) => item.id === effectiveModelId)
      : undefined;

    return {
      ...modelInfo,
      canSwitch: true,
      currentModelId: effectiveModelId,
      currentModelLabel: matchedModel?.label || modelInfo.currentModelLabel || effectiveModelId || '',
    };
  }, [usingAcpModelSource, selectedCliOption, acpCachedModels, selectedCliModel]);

  const selectedCliInitialModelId = selectedCliModel || selectedCliLocalModelInfo?.currentModelId || undefined;

  useEffect(() => {
    if (!usingAcpModelSource || !selectedCliOption?.backend) {
      setSelectedCliModel('');
      return;
    }

    const backend = selectedCliOption.backend;
    const preferred = acpPreferredModelIds[backend];
    const cachedCurrent = acpCachedModels[backend]?.currentModelId || undefined;
    const fallback = cliModelOptions[0]?.value;
    const candidate = preferred || cachedCurrent || fallback || '';

    setSelectedCliModel((previous) => {
      if (previous && cliModelOptions.some((item) => item.value === previous)) {
        return previous;
      }

      return candidate;
    });
  }, [usingAcpModelSource, selectedCliOption, acpPreferredModelIds, acpCachedModels, cliModelOptions]);

  const currentCliConfigOptions = useMemo<AcpSessionConfigOption[]>(() => {
    if (!currentCliBackend) {
      return [];
    }

    const cachedOptions = acpCachedConfigOptions[currentCliBackend] || [];
    return cachedOptions.length > 0 ? cachedOptions : getDefaultAcpConfigOptions(currentCliBackend);
  }, [currentCliBackend, acpCachedConfigOptions]);

  useEffect(() => {
    if (!currentCliBackend) {
      setSelectedCliConfigOptions({});
      return;
    }

    const preferredOptions = acpPreferredConfigOptions[currentCliBackend] || {};
    const nextSelectedOptions = currentCliConfigOptions.reduce<Record<string, string>>((result, option) => {
      const preferredValue = preferredOptions[option.id];
      if (!preferredValue) {
        return result;
      }

      const isValueAvailable = option.options?.some((choice) => choice.value === preferredValue) ?? true;
      if (isValueAvailable) {
        result[option.id] = preferredValue;
      }

      return result;
    }, {});

    setSelectedCliConfigOptions(nextSelectedOptions);
  }, [currentCliBackend, currentCliConfigOptions, acpPreferredConfigOptions]);

  const modeBackend = useMemo(() => {
    if (!selectedCliOption) {
      return undefined;
    }
    if (selectedCliOption.conversationType === 'acp') {
      return selectedCliOption.backend;
    }
    if (selectedCliOption.conversationType === 'gemini') {
      return 'gemini';
    }
    if (selectedCliOption.conversationType === 'codex') {
      return 'codex';
    }
    return undefined;
  }, [selectedCliOption]);

  const modeOptions = useMemo(() => {
    const options = getAgentModes(modeBackend);
    if (options.length > 0) {
      return options;
    }

    return [{ value: 'default', label: 'Default' }];
  }, [modeBackend]);
  const canUseModeSelector = Boolean(modeBackend && getAgentModes(modeBackend).length > 0);

  useEffect(() => {
    if (!modeOptions.some((item) => item.value === selectedMode)) {
      setSelectedMode(modeOptions[0]?.value || 'default');
    }
  }, [modeOptions, selectedMode]);

  const selectedProviderModelOption = useMemo(() => {
    if (!selectedProviderModel) {
      return providerModelOptions[0];
    }

    return providerModelOptions.find((item) => item.value === selectedProviderModel) || providerModelOptions[0];
  }, [providerModelOptions, selectedProviderModel]);

  const generatedPayload = useMemo(() => {
    const conversationType = selectedCliOption?.conversationType || 'gemini';
    const payload: Record<string, unknown> = {
      type: conversationType,
      cli: selectedCliOption?.backend || conversationType,
      message: message.trim() || DEFAULT_MESSAGE,
    };

    if (requiresProviderModel) {
      payload.model = selectedProviderModelOption
        ? (() => {
            const { model: _modelList, ...base } = selectedProviderModelOption.provider;
            return {
              ...base,
              useModel: selectedProviderModelOption.modelId,
            };
          })()
        : getFallbackModel();
    }

    if (workspace.trim()) {
      payload.workspace = workspace.trim();
    }

    if (conversationType === 'acp') {
      if (selectedCliOption?.backend) {
        payload.backend = selectedCliOption.backend;
      }
      if (selectedCliOption?.cliPath) {
        payload.cliPath = selectedCliOption.cliPath;
      }
      if (selectedCliOption?.customAgentId) {
        payload.customAgentId = selectedCliOption.customAgentId;
      }
      if (selectedMode) {
        payload.mode = selectedMode;
      }

      const effectiveCliModel =
        selectedCliModel ||
        (selectedCliOption?.backend ? acpCachedModels[selectedCliOption.backend]?.currentModelId : undefined);
      if (effectiveCliModel) {
        payload.currentModelId = effectiveCliModel;
      }
      if (Object.keys(selectedCliConfigOptions).length > 0) {
        payload.configOptionValues = selectedCliConfigOptions;
      }
    } else if (conversationType === 'gemini' || conversationType === 'codex') {
      if (selectedMode) {
        payload.mode = selectedMode;
      }
      if (conversationType === 'codex' && selectedCliModel) {
        payload.codexModel = selectedCliModel;
      }
    }

    return payload;
  }, [
    requiresProviderModel,
    selectedProviderModelOption,
    selectedCliOption,
    message,
    workspace,
    selectedMode,
    selectedCliModel,
    selectedCliConfigOptions,
    acpCachedModels,
  ]);

  const generatedPayloadText = useMemo(() => JSON.stringify(generatedPayload, null, 2), [generatedPayload]);
  const docsUrl = useMemo(() => {
    if (!isDesktopRuntime) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:25808';
      return `${origin}/api/docs`;
    }

    const base = webuiStatus?.localUrl || 'http://localhost:25808';
    return `${base}/api/docs`;
  }, [isDesktopRuntime, webuiStatus?.localUrl]);
  const canDirectAccessDocs = !isDesktopRuntime || !!webuiStatus?.running;
  const callbackEnabled = !!config.callbackEnabled;
  const jsFilterEnabled = !!config.jsFilterEnabled;

  const handleGenerateToken = useCallback(() => {
    const token = generateApiToken();
    setConfig((previous) => ({ ...previous, authToken: token }));
    Message.success(t('settings.apiPage.messages.generateTokenSuccess'));
  }, [t]);

  const handleCopy = useCallback(
    (text: string, successMessage = t('common.copySuccess')) => {
      void navigator.clipboard
        .writeText(text)
        .then(() => Message.success(successMessage))
        .catch(() => Message.error(t('common.copyFailed')));
    },
    [t]
  );

  const handleAddHeader = useCallback(() => {
    setHeaders((previous) => [...previous, { key: '', value: '' }]);
  }, []);

  const handleDeleteHeader = useCallback((index: number) => {
    setHeaders((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const handleUpdateHeader = useCallback((index: number, field: keyof HeaderItem, value: string) => {
    setHeaders((previous) => {
      const next = [...previous];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaveLoading(true);

    try {
      const callbackHeaders: Record<string, string> = {};
      for (const item of headers) {
        const key = item.key.trim();
        const value = item.value.trim();
        if (key && value) {
          callbackHeaders[key] = value;
        }
      }

      const result = await ipcBridge.database.saveApiConfig.invoke({
        ...config,
        authToken: config.authToken?.trim() || undefined,
        callbackEnabled,
        callbackHeaders: Object.keys(callbackHeaders).length > 0 ? callbackHeaders : undefined,
        callbackBody: config.callbackBody?.trim() ? config.callbackBody : DEFAULT_CALLBACK_BODY,
        jsFilterEnabled,
        jsFilterScript: config.jsFilterScript?.trim() ? config.jsFilterScript : DEFAULT_JS_FILTER_SCRIPT,
      });

      if (result.success) {
        Message.success(t('settings.apiPage.messages.saveSuccess'));
        await loadApiConfig();
        return;
      }

      Message.error(`${t('settings.apiPage.messages.saveFailed')}: ${result.error || t('common.unknownError')}`);
    } catch (error) {
      console.error('[ApiSettings] Save config error:', error);
      Message.error(t('settings.apiPage.messages.saveFailed'));
    } finally {
      setSaveLoading(false);
    }
  }, [callbackEnabled, config, headers, jsFilterEnabled, loadApiConfig, t]);

  const handleEnabledChange = useCallback(
    async (checked: boolean) => {
      const previousEnabled = !!config.enabled;
      setConfig((previous) => ({ ...previous, enabled: checked }));
      setToggleLoading(true);

      try {
        const result = await ipcBridge.database.updateApiEnabled.invoke({ enabled: checked });
        if (result.success) {
          Message.success(checked ? t('settings.apiPage.messages.enabled') : t('settings.apiPage.messages.disabled'));
          await loadApiConfig();
          return;
        }

        setConfig((previous) => ({ ...previous, enabled: previousEnabled }));
        Message.error(`${t('settings.apiPage.messages.toggleFailed')}: ${result.error || t('common.unknownError')}`);
      } catch (error) {
        console.error('[ApiSettings] Toggle API enabled error:', error);
        setConfig((previous) => ({ ...previous, enabled: previousEnabled }));
        Message.error(t('settings.apiPage.messages.toggleFailed'));
      } finally {
        setToggleLoading(false);
      }
    },
    [config.enabled, loadApiConfig, t]
  );

  const handleOpenDocs = useCallback(() => {
    if (!canDirectAccessDocs) {
      Message.warning(t('settings.apiPage.docs.unavailableWarning'));
      return;
    }

    void openExternalUrl(docsUrl);
  }, [canDirectAccessDocs, docsUrl, t]);

  const tabItems = useMemo<Array<{ key: ApiTabKey; label: string }>>(() => {
    const items: Array<{ key: ApiTabKey; label: string }> = [
      { key: 'auth', label: t('settings.apiPage.tabs.auth') },
      { key: 'callback', label: t('settings.apiPage.tabs.callback') },
      { key: 'generator', label: t('settings.apiPage.tabs.generator') },
    ];

    if (diagnosticsTab) {
      items.push({
        key: 'diagnostics',
        label: resolveExtTabName(diagnosticsTab),
      });
    }

    return items;
  }, [diagnosticsTab, resolveExtTabName, t]);

  useEffect(() => {
    if (activeTab !== 'diagnostics') {
      return;
    }

    if (!diagnosticsTab) {
      setActiveTab('auth');
    }
  }, [activeTab, diagnosticsTab]);

  if (loading) {
    return (
      <div className='flex h-400px items-center justify-center'>
        <div className='text-t-tertiary'>{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className='p-20px'>
      <div className='mb-20px rounded-16px border border-border-secondary bg-bg-secondary p-16px'>
        <div className='mb-14px'>
          <h3 className='mb-6px text-16px font-600 text-t-primary'>{t('settings.apiPage.title')}</h3>
          <p className='text-12px leading-6 text-t-tertiary'>{t('settings.apiPage.description')}</p>
        </div>

        <Tabs
          activeTab={activeTab}
          onChange={(value) => setActiveTab((value as ApiTabKey) || 'auth')}
          type='line'
          className='api-settings-tabs'
        >
          {tabItems.map((item) => (
            <Tabs.TabPane
              key={item.key}
              title={
                <span
                  data-api-settings-tab={item.key}
                  className={`inline-flex items-center transition-colors ${
                    activeTab === item.key ? 'font-600 text-t-primary' : 'text-t-secondary'
                  }`}
                >
                  {item.label}
                </span>
              }
            />
          ))}
        </Tabs>
      </div>

      {activeTab === 'auth' ? (
        <ApiAuthTab
          config={config}
          docsUrl={docsUrl}
          canDirectAccessDocs={canDirectAccessDocs}
          toggleLoading={toggleLoading}
          onOpenDocs={handleOpenDocs}
          onCopyDocs={() => handleCopy(docsUrl, t('settings.apiPage.docs.copySuccess'))}
          onEnabledChange={handleEnabledChange}
          onTokenChange={(value) => setConfig((previous) => ({ ...previous, authToken: value }))}
          onGenerateToken={handleGenerateToken}
          onCopyToken={() => handleCopy(config.authToken || '', t('settings.apiPage.auth.copySuccess'))}
        />
      ) : null}

      {activeTab === 'callback' ? (
        <CallbackTab
          config={config}
          headers={headers}
          callbackEnabled={callbackEnabled}
          jsFilterEnabled={jsFilterEnabled}
          onCallbackEnabledChange={(checked) => setConfig((previous) => ({ ...previous, callbackEnabled: checked }))}
          onCallbackUrlChange={(value) => setConfig((previous) => ({ ...previous, callbackUrl: value }))}
          onCallbackMethodChange={(value) => setConfig((previous) => ({ ...previous, callbackMethod: value }))}
          onAddHeader={handleAddHeader}
          onDeleteHeader={handleDeleteHeader}
          onUpdateHeader={handleUpdateHeader}
          onCallbackBodyChange={(value) => setConfig((previous) => ({ ...previous, callbackBody: value }))}
          onJsFilterEnabledChange={(checked) => setConfig((previous) => ({ ...previous, jsFilterEnabled: checked }))}
          onRestoreJsFilterScript={() =>
            setConfig((previous) => ({ ...previous, jsFilterScript: DEFAULT_JS_FILTER_SCRIPT }))
          }
          onJsFilterScriptChange={(value) => setConfig((previous) => ({ ...previous, jsFilterScript: value }))}
        />
      ) : null}

      {activeTab === 'generator' ? (
        <ConversationCreateGeneratorTab
          cliOptions={cliOptions}
          providerModelOptions={providerModelOptions}
          selectedCli={selectedCli}
          selectedCliOption={selectedCliOption}
          selectedProviderModel={selectedProviderModel}
          selectedCliInitialModelId={selectedCliInitialModelId}
          selectedCliLocalModelInfo={selectedCliLocalModelInfo}
          cliModelOptions={cliModelOptions}
          usingAcpModelSource={usingAcpModelSource}
          requiresProviderModel={requiresProviderModel}
          modeOptions={modeOptions}
          modeBackend={modeBackend}
          canUseModeSelector={canUseModeSelector}
          selectedMode={selectedMode}
          currentCliBackend={currentCliBackend}
          currentCliConfigOptions={currentCliConfigOptions}
          selectedCliConfigOptions={selectedCliConfigOptions}
          workspace={workspace}
          message={message}
          generatedPayloadText={generatedPayloadText}
          onCliChange={setSelectedCli}
          onProviderModelChange={setSelectedProviderModel}
          onCliModelChange={setSelectedCliModel}
          onModeChange={setSelectedMode}
          onCliConfigOptionChange={(configId, value) =>
            setSelectedCliConfigOptions((previous) => ({
              ...previous,
              [configId]: value,
            }))
          }
          onWorkspaceChange={setWorkspace}
          onMessageChange={setMessage}
          onRefreshSources={() => void loadGeneratorOptions(true)}
          onCopyGeneratedPayload={() => handleCopy(generatedPayloadText, t('settings.apiPage.generator.copySuccess'))}
        />
      ) : null}

      {activeTab === 'diagnostics' && diagnosticsTab ? (
        <div className='overflow-hidden rounded-12px border border-border-secondary bg-bg-secondary p-8px'>
          <ExtensionSettingsTabContent
            entryUrl={diagnosticsTab.entryUrl}
            tabId={diagnosticsTab.id}
            extensionName={diagnosticsTab._extensionName}
            minHeight={720}
          />
        </div>
      ) : null}

      <div className='mt-20px flex justify-end'>
        <Button type='primary' onClick={handleSave} loading={saveLoading}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
};

export default ApiSettingsContent;
