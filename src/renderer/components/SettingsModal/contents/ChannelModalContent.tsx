/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPluginStatus } from '@/channels/types';
import { ipcBridge } from '@/common';
import { channel } from '@/common/ipcBridge';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useGeminiGoogleAuthModels } from '@/renderer/hooks/useGeminiGoogleAuthModels';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';
import { Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { useSettingsViewMode } from '../settingsViewContext';
import ChannelItem from './channels/ChannelItem';
import type { ChannelConfig } from './channels/types';
import TelegramConfigForm from './TelegramConfigForm';

/**
 * Get available primary models for a provider (supports function calling)
 */
const getAvailableModels = (provider: IProvider): string[] => {
  const result: string[] = [];
  for (const modelName of provider.model || []) {
    const functionCalling = hasSpecificModelCapability(provider, modelName, 'function_calling');
    const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');

    if ((functionCalling === true || functionCalling === undefined) && excluded !== true) {
      result.push(modelName);
    }
  }
  return result;
};

/**
 * Check if provider has available models
 */
const hasAvailableModels = (provider: IProvider): boolean => {
  return getAvailableModels(provider).length > 0;
};

/**
 * Hook to get available model list for Telegram channel
 * Matches the implementation in guid/index.tsx
 */
const useChannelModelList = () => {
  const { geminiModeOptions, isGoogleAuth } = useGeminiGoogleAuthModels();
  const { data: modelConfig } = useSWR('model.config.assistant', () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data: IProvider[]) => {
      return (data || []).filter((platform: IProvider) => !!platform.model.length);
    });
  });

  const geminiModelValues = useMemo(() => geminiModeOptions.map((option) => option.value), [geminiModeOptions]);

  const modelList = useMemo(() => {
    let allProviders: IProvider[] = [];

    if (isGoogleAuth) {
      // Add Google Auth provider with available models
      const geminiProvider: IProvider = {
        id: uuid(),
        name: 'Gemini Google Auth',
        platform: 'gemini-with-google-auth',
        baseUrl: '',
        apiKey: '',
        model: geminiModelValues,
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
      };
      allProviders = [geminiProvider, ...(modelConfig || [])];
    } else {
      allProviders = modelConfig || [];
    }

    // Filter providers with available primary models
    return allProviders.filter(hasAvailableModels);
  }, [geminiModelValues, isGoogleAuth, modelConfig]);

  return { modelList };
};

/**
 * Assistant Settings Content Component
 */
const ChannelModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  // Plugin state
  const [pluginStatus, setPluginStatus] = useState<IChannelPluginStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [enableLoading, setEnableLoading] = useState(false);

  // Collapse state - true means collapsed (closed), false means expanded (open)
  const [collapseKeys, setCollapseKeys] = useState<Record<string, boolean>>({
    telegram: true, // Default to collapsed
    slack: true,
    discord: true,
    lark: true,
  });

  // Model selection state
  const { modelList } = useChannelModelList();
  const [selectedModel, setSelectedModel] = useState<TProviderWithModel | null>(null);

  // Load plugin status
  const loadPluginStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await channel.getPluginStatus.invoke();
      if (result.success && result.data) {
        const telegramPlugin = result.data.find((p) => p.type === 'telegram');
        setPluginStatus(telegramPlugin || null);
      }
    } catch (error) {
      console.error('[ChannelSettings] Failed to load plugin status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadPluginStatus();
  }, [loadPluginStatus]);

  // Load saved model selection
  useEffect(() => {
    if (!modelList || modelList.length === 0) return;

    const loadSavedModel = async () => {
      try {
        const savedModel = await ConfigStorage.get('assistant.telegram.defaultModel');
        if (savedModel && savedModel.id && savedModel.useModel) {
          // Verify the saved model still exists in the provider list
          const provider = modelList.find((p) => p.id === savedModel.id);
          if (provider && provider.model?.includes(savedModel.useModel)) {
            setSelectedModel({ ...provider, useModel: savedModel.useModel });
            return;
          }
        }
        // Default to first available model if no saved selection
        const firstProvider = modelList[0];
        if (firstProvider) {
          const availableModels = getAvailableModels(firstProvider);
          if (availableModels.length > 0) {
            setSelectedModel({ ...firstProvider, useModel: availableModels[0] });
          }
        }
      } catch (error) {
        console.error('[ChannelSettings] Failed to load saved model:', error);
      }
    };

    void loadSavedModel();
  }, [modelList]);

  // Listen for plugin status changes
  useEffect(() => {
    const unsubscribe = channel.pluginStatusChanged.on(({ status }) => {
      if (status.type === 'telegram') {
        setPluginStatus(status);
      }
    });
    return () => unsubscribe();
  }, []);

  // Toggle collapse
  const handleToggleCollapse = (channelId: string) => {
    setCollapseKeys((prev) => ({
      ...prev,
      [channelId]: !prev[channelId],
    }));
  };

  // Enable/Disable plugin
  const handleTogglePlugin = async (enabled: boolean) => {
    setEnableLoading(true);
    try {
      if (enabled) {
        // Check if we have a token - already saved in database
        if (!pluginStatus?.hasToken) {
          Message.warning(t('settings.assistant.tokenRequired', 'Please enter a bot token first'));
          setEnableLoading(false);
          return;
        }

        const result = await channel.enablePlugin.invoke({
          pluginId: 'telegram_default',
          config: {},
        });

        if (result.success) {
          Message.success(t('settings.assistant.pluginEnabled', 'Telegram bot enabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.assistant.enableFailed', 'Failed to enable plugin'));
        }
      } else {
        const result = await channel.disablePlugin.invoke({ pluginId: 'telegram_default' });

        if (result.success) {
          Message.success(t('settings.assistant.pluginDisabled', 'Telegram bot disabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.assistant.disableFailed', 'Failed to disable plugin'));
        }
      }
    } catch (error: any) {
      Message.error(error.message);
    } finally {
      setEnableLoading(false);
    }
  };

  // Build channel configurations
  const channels: ChannelConfig[] = useMemo(() => {
    const telegramChannel: ChannelConfig = {
      id: 'telegram',
      title: t('channels.telegramTitle', 'Telegram'),
      description: t('channels.telegramDesc', 'Chat with AionUi assistant via Telegram'),
      status: 'active',
      enabled: pluginStatus?.enabled || false,
      disabled: enableLoading,
      isConnected: pluginStatus?.connected || false,
      botUsername: pluginStatus?.botUsername,
      defaultModel: selectedModel?.useModel,
      content: <TelegramConfigForm pluginStatus={pluginStatus} modelList={modelList || []} selectedModel={selectedModel} onStatusChange={setPluginStatus} onModelChange={setSelectedModel} />,
    };

    const comingSoonChannels: ChannelConfig[] = [
      {
        id: 'slack',
        title: t('channels.slackTitle', 'Slack'),
        description: t('channels.slackDesc', 'Chat with AionUi assistant via Slack'),
        status: 'coming_soon',
        enabled: false,
        disabled: true,
        content: <div className='text-14px text-t-secondary py-12px'>{t('channels.comingSoonDesc', 'Support for {{channel}} is coming soon', { channel: t('channels.slackTitle', 'Slack') })}</div>,
      },
      {
        id: 'discord',
        title: t('channels.discordTitle', 'Discord'),
        description: t('channels.discordDesc', 'Chat with AionUi assistant via Discord'),
        status: 'coming_soon',
        enabled: false,
        disabled: true,
        content: <div className='text-14px text-t-secondary py-12px'>{t('channels.comingSoonDesc', 'Support for {{channel}} is coming soon', { channel: t('channels.discordTitle', 'Discord') })}</div>,
      },
      {
        id: 'lark',
        title: t('channels.larkTitle', 'Lark'),
        description: t('channels.larkDesc', 'Chat with AionUi assistant via Lark'),
        status: 'coming_soon',
        enabled: false,
        disabled: true,
        content: <div className='text-14px text-t-secondary py-12px'>{t('channels.comingSoonDesc', 'Support for {{channel}} is coming soon', { channel: t('channels.larkTitle', 'Lark') })}</div>,
      },
    ];

    return [telegramChannel, ...comingSoonChannels];
  }, [pluginStatus, selectedModel, modelList, enableLoading, t]);

  return (
    <AionScrollArea className={isPageMode ? 'h-full' : ''}>
      <div className='flex flex-col gap-12px'>
        {channels.map((channel) => (
          <ChannelItem key={channel.id} channel={channel} isCollapsed={collapseKeys[channel.id] || false} onToggleCollapse={() => handleToggleCollapse(channel.id)} onToggleEnabled={channel.id === 'telegram' ? handleTogglePlugin : undefined} />
        ))}
      </div>
    </AionScrollArea>
  );
};

export default ChannelModalContent;
