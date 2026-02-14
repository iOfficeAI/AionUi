/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPluginStatus } from '@/channels/types';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { channel } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useModelProviderList } from '@/renderer/hooks/useModelProviderList';
import type { GeminiModelSelection } from '@/renderer/pages/conversation/gemini/useGeminiModelSelection';
import { useGeminiModelSelection } from '@/renderer/pages/conversation/gemini/useGeminiModelSelection';
import { Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../settingsViewContext';
import ChannelItem from './channels/ChannelItem';
import type { ChannelConfig } from './channels/types';
import DingTalkConfigForm from './DingTalkConfigForm';
import LarkConfigForm from './LarkConfigForm';
import TelegramConfigForm from './TelegramConfigForm';

type ChannelModelConfigKey = 'assistant.telegram.defaultModel' | 'assistant.lark.defaultModel' | 'assistant.dingtalk.defaultModel';

/**
 * Internal hook: wraps useGeminiModelSelection with ConfigStorage persistence
 * for a specific channel config key (e.g. 'assistant.telegram.defaultModel').
 *
 * Restoration is done by resolving the saved model reference into a full
 * TProviderWithModel and passing it as `initialModel` — this avoids triggering
 * the onSelectModel callback (and its toast) on mount.
 */
const useChannelModelSelection = (configKey: ChannelModelConfigKey): GeminiModelSelection => {
  const { t } = useTranslation();

  // Resolve persisted model into a full TProviderWithModel for initialModel.
  // useModelProviderList is SWR-backed so the duplicate call inside
  // useGeminiModelSelection is deduplicated automatically.
  const { providers } = useModelProviderList();
  const [resolvedInitialModel, setResolvedInitialModel] = useState<TProviderWithModel | undefined>(undefined);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (restored || providers.length === 0) return;

    const restore = async () => {
      try {
        const saved = (await ConfigStorage.get(configKey)) as { id: string; useModel: string } | undefined;
        if (saved?.id && saved?.useModel) {
          const provider = providers.find((p) => p.id === saved.id);
          if (provider) {
            // Google Auth provider's model array only contains top-level modes
            // ('auto', 'auto-gemini-2.5', 'manual'), but sub-model values like
            // 'gemini-2.5-flash' are also valid — skip strict membership check.
            const isGoogleAuth = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
            if (isGoogleAuth || provider.model?.includes(saved.useModel)) {
              setResolvedInitialModel({
                ...provider,
                useModel: saved.useModel,
              } as TProviderWithModel);
            }
          }
        }
      } catch (error) {
        console.error(`[ChannelSettings] Failed to restore model for ${configKey}:`, error);
      } finally {
        setRestored(true);
      }
    };

    void restore();
  }, [configKey, providers, restored]);

  // Only called on explicit user selection — not during restoration
  const onSelectModel = useCallback(
    async (provider: IProvider, modelName: string) => {
      try {
        const modelRef = { id: provider.id, useModel: modelName };
        await ConfigStorage.set(configKey, modelRef);

        // Derive platform from configKey and sync to channel system
        const platform = configKey.replace('assistant.', '').replace('.defaultModel', '') as 'telegram' | 'lark' | 'dingtalk';
        const agentKey = `assistant.${platform}.agent` as const;
        const currentAgent = await ConfigStorage.get(agentKey);
        await channel.syncChannelSettings
          .invoke({
            platform,
            agent: (currentAgent as { backend: string; customAgentId?: string; name?: string }) || { backend: 'gemini' },
            model: modelRef,
          })
          .catch(() => {});

        Message.success(t('settings.assistant.modelSwitched', 'Model switched successfully'));
        return true;
      } catch (error) {
        console.error(`[ChannelSettings] Failed to save model for ${configKey}:`, error);
        Message.error(t('settings.assistant.modelSaveFailed', 'Failed to save model'));
        return false;
      }
    },
    [configKey, t]
  );

  return useGeminiModelSelection({ initialModel: resolvedInitialModel, onSelectModel });
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
  const [larkPluginStatus, setLarkPluginStatus] = useState<IChannelPluginStatus | null>(null);
  const [dingtalkPluginStatus, setDingtalkPluginStatus] = useState<IChannelPluginStatus | null>(null);
  const [enableLoading, setEnableLoading] = useState(false);
  const [larkEnableLoading, setLarkEnableLoading] = useState(false);
  const [dingtalkEnableLoading, setDingtalkEnableLoading] = useState(false);

  // Collapse state - true means collapsed (closed), false means expanded (open)
  const [collapseKeys, setCollapseKeys] = useState<Record<string, boolean>>({
    telegram: true, // Default to collapsed
    slack: true,
    discord: true,
    lark: true,
    dingtalk: true,
  });

  // Model selection state — uses unified hook with ConfigStorage persistence
  const telegramModelSelection = useChannelModelSelection('assistant.telegram.defaultModel');
  const larkModelSelection = useChannelModelSelection('assistant.lark.defaultModel');
  const dingtalkModelSelection = useChannelModelSelection('assistant.dingtalk.defaultModel');

  // Load plugin status
  const loadPluginStatus = useCallback(async () => {
    try {
      const result = await channel.getPluginStatus.invoke();
      if (result.success && result.data) {
        const telegramPlugin = result.data.find((p) => p.type === 'telegram');
        const larkPlugin = result.data.find((p) => p.type === 'lark');
        const dingtalkPlugin = result.data.find((p) => p.type === 'dingtalk');
        setPluginStatus(telegramPlugin || null);
        setLarkPluginStatus(larkPlugin || null);
        setDingtalkPluginStatus(dingtalkPlugin || null);
      }
    } catch (error) {
      console.error('[ChannelSettings] Failed to load plugin status:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadPluginStatus();
  }, [loadPluginStatus]);

  // Listen for plugin status changes
  useEffect(() => {
    const unsubscribe = channel.pluginStatusChanged.on(({ status }) => {
      if (status.type === 'telegram') {
        setPluginStatus(status);
      } else if (status.type === 'lark') {
        setLarkPluginStatus(status);
      } else if (status.type === 'dingtalk') {
        setDingtalkPluginStatus(status);
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

  // Enable/Disable Lark plugin
  const handleToggleLarkPlugin = async (enabled: boolean) => {
    setLarkEnableLoading(true);
    try {
      if (enabled) {
        // Check if we have credentials - already saved in database
        if (!larkPluginStatus?.hasToken) {
          Message.warning(t('settings.lark.credentialsRequired', 'Please configure Lark credentials first'));
          setLarkEnableLoading(false);
          return;
        }

        const result = await channel.enablePlugin.invoke({
          pluginId: 'lark_default',
          config: {},
        });

        if (result.success) {
          Message.success(t('settings.lark.pluginEnabled', 'Lark bot enabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.lark.enableFailed', 'Failed to enable Lark plugin'));
        }
      } else {
        const result = await channel.disablePlugin.invoke({ pluginId: 'lark_default' });

        if (result.success) {
          Message.success(t('settings.lark.pluginDisabled', 'Lark bot disabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.lark.disableFailed', 'Failed to disable Lark plugin'));
        }
      }
    } catch (error: any) {
      Message.error(error.message);
    } finally {
      setLarkEnableLoading(false);
    }
  };

  // Enable/Disable DingTalk plugin
  const handleToggleDingtalkPlugin = async (enabled: boolean) => {
    setDingtalkEnableLoading(true);
    try {
      if (enabled) {
        if (!dingtalkPluginStatus?.hasToken) {
          Message.warning(t('settings.dingtalk.credentialsRequired', 'Please configure DingTalk credentials first'));
          setDingtalkEnableLoading(false);
          return;
        }

        const result = await channel.enablePlugin.invoke({
          pluginId: 'dingtalk_default',
          config: {},
        });

        if (result.success) {
          Message.success(t('settings.dingtalk.pluginEnabled', 'DingTalk bot enabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.dingtalk.enableFailed', 'Failed to enable DingTalk plugin'));
        }
      } else {
        const result = await channel.disablePlugin.invoke({ pluginId: 'dingtalk_default' });

        if (result.success) {
          Message.success(t('settings.dingtalk.pluginDisabled', 'DingTalk bot disabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.dingtalk.disableFailed', 'Failed to disable DingTalk plugin'));
        }
      }
    } catch (error: any) {
      Message.error(error.message);
    } finally {
      setDingtalkEnableLoading(false);
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
      defaultModel: telegramModelSelection.currentModel?.useModel,
      content: <TelegramConfigForm pluginStatus={pluginStatus} modelSelection={telegramModelSelection} onStatusChange={setPluginStatus} />,
    };

    const larkChannel: ChannelConfig = {
      id: 'lark',
      title: t('channels.larkTitle', 'Lark / Feishu'),
      description: t('channels.larkDesc', 'Chat with AionUi assistant via Lark or Feishu'),
      status: 'active',
      enabled: larkPluginStatus?.enabled || false,
      disabled: larkEnableLoading,
      isConnected: larkPluginStatus?.connected || false,
      defaultModel: larkModelSelection.currentModel?.useModel,
      content: <LarkConfigForm pluginStatus={larkPluginStatus} modelSelection={larkModelSelection} onStatusChange={setLarkPluginStatus} />,
    };

    const dingtalkChannel: ChannelConfig = {
      id: 'dingtalk',
      title: t('channels.dingtalkTitle', 'DingTalk'),
      description: t('channels.dingtalkDesc', 'Chat with AionUi assistant via DingTalk'),
      status: 'active',
      enabled: dingtalkPluginStatus?.enabled || false,
      disabled: dingtalkEnableLoading,
      isConnected: dingtalkPluginStatus?.connected || false,
      defaultModel: dingtalkModelSelection.currentModel?.useModel,
      content: <DingTalkConfigForm pluginStatus={dingtalkPluginStatus} modelSelection={dingtalkModelSelection} onStatusChange={setDingtalkPluginStatus} />,
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
    ];

    return [telegramChannel, larkChannel, dingtalkChannel, ...comingSoonChannels];
  }, [pluginStatus, larkPluginStatus, dingtalkPluginStatus, telegramModelSelection, larkModelSelection, dingtalkModelSelection, enableLoading, larkEnableLoading, dingtalkEnableLoading, t]);

  // Get toggle handler for each channel
  const getToggleHandler = (channelId: string) => {
    if (channelId === 'telegram') return handleTogglePlugin;
    if (channelId === 'lark') return handleToggleLarkPlugin;
    if (channelId === 'dingtalk') return handleToggleDingtalkPlugin;
    return undefined;
  };

  return (
    <AionScrollArea className={isPageMode ? 'h-full' : ''}>
      <div className='flex flex-col gap-12px'>
        {channels.map((channelConfig) => (
          <ChannelItem key={channelConfig.id} channel={channelConfig} isCollapsed={collapseKeys[channelConfig.id] || false} onToggleCollapse={() => handleToggleCollapse(channelConfig.id)} onToggleEnabled={getToggleHandler(channelConfig.id)} />
        ))}
      </div>
    </AionScrollArea>
  );
};

export default ChannelModalContent;
