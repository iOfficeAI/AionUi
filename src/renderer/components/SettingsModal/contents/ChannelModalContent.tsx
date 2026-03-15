/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPluginStatus } from '@/channels/types';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { channel, webui, type IWebUIStatus } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useModelProviderList } from '@/renderer/hooks/useModelProviderList';
import type { GeminiModelSelection } from '@/renderer/pages/conversation/gemini/useGeminiModelSelection';
import { useGeminiModelSelection } from '@/renderer/pages/conversation/gemini/useGeminiModelSelection';
import { Button, Input, InputNumber, Message, Popconfirm, Select, Switch } from '@arco-design/web-react';
import { CheckOne, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../settingsViewContext';
import ChannelItem from './channels/ChannelItem';
import type { ChannelConfig } from './channels/types';
import DingTalkConfigForm from './DingTalkConfigForm';
import LarkConfigForm from './LarkConfigForm';
import TelegramConfigForm from './TelegramConfigForm';

type ChannelModelConfigKey = 'assistant.telegram.defaultModel' | 'assistant.lark.defaultModel' | 'assistant.dingtalk.defaultModel';
type BuiltinChannelPlatform = 'telegram' | 'lark' | 'dingtalk';

type ExtensionFieldType = 'text' | 'password' | 'select' | 'number' | 'boolean';

type ExtensionFieldSchema = {
  key: string;
  label: string;
  type: ExtensionFieldType;
  required?: boolean;
  options?: string[];
  default?: string | number | boolean;
};

type ExtensionFieldValues = Record<string, Record<string, string | number | boolean>>;

type BuiltinDraftConfig = {
  token?: string;
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;
  clientId?: string;
  clientSecret?: string;
};

const BUILTIN_CHANNEL_TYPES = new Set(['telegram', 'lark', 'dingtalk', 'slack', 'discord']);

/**
 * Internal hook: wraps useGeminiModelSelection with ConfigStorage persistence
 * for a specific channel config key (e.g. 'assistant.telegram.defaultModel').
 *
 * Restoration is done by resolving the saved model reference into a full
 * TProviderWithModel and passing it as `initialModel` — this avoids triggering
 * the onSelectModel callback (and its toast) on mount.
 */
const useChannelModelSelection = (configKey: ChannelModelConfigKey, reloadVersion: number): GeminiModelSelection => {
  const { t } = useTranslation();

  // Resolve persisted model into a full TProviderWithModel for initialModel.
  // useModelProviderList is SWR-backed so the duplicate call inside
  // useGeminiModelSelection is deduplicated automatically.
  const { providers } = useModelProviderList();
  const [resolvedInitialModel, setResolvedInitialModel] = useState<TProviderWithModel | undefined>(undefined);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setResolvedInitialModel(undefined);
    setRestored(false);
  }, [configKey, reloadVersion]);

  useEffect(() => {
    if (restored || providers.length === 0) return;

    const restore = async () => {
      try {
        const saved = (await ConfigStorage.get(configKey)) as { id: string; useModel: string } | undefined;
        if (!saved?.id || !saved?.useModel) {
          // Nothing saved — mark restored so we don't keep retrying
          setRestored(true);
          return;
        }

        const provider = providers.find((p) => p.id === saved.id);
        if (!provider) {
          // Provider not found in current list — don't mark as restored.
          // The Google Auth provider may load after API-key providers;
          // leaving restored=false lets this effect re-run when providers update.
          return;
        }

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
        setRestored(true);
      } catch (error) {
        console.error(`[ChannelSettings] Failed to restore model for ${configKey}:`, error);
        setRestored(true);
      }
    };

    void restore();
  }, [configKey, providers, restored, reloadVersion]);

  // Only called on explicit user selection — not during restoration
  const onSelectModel = useCallback(
    async (provider: IProvider, modelName: string) => {
      try {
        const modelRef = { id: provider.id, useModel: modelName };
        await ConfigStorage.set(configKey, modelRef);

        // Derive platform from configKey and sync to channel system
        const platform = configKey.replace('assistant.', '').replace('.defaultModel', '') as BuiltinChannelPlatform;
        const agentKey = `assistant.${platform}.agent` as const;
        const currentAgent = await ConfigStorage.get(agentKey);
        await channel.syncChannelSettings
          .invoke({
            platform,
            agent: (currentAgent as { backend: string; customAgentId?: string; name?: string }) || { backend: 'gemini' },
            model: modelRef,
            change: 'model',
          })
          .catch((err) => console.warn(`[ChannelSettings] syncChannelSettings failed for ${platform}:`, err));

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
  const [builtinStatuses, setBuiltinStatuses] = useState<Record<'telegram' | 'lark' | 'dingtalk', IChannelPluginStatus[]>>({
    telegram: [],
    lark: [],
    dingtalk: [],
  });
  const [builtinLoadingMap, setBuiltinLoadingMap] = useState<Record<string, boolean>>({});
  const [extensionStatuses, setExtensionStatuses] = useState<IChannelPluginStatus[]>([]);
  const [extensionLoadingMap, setExtensionLoadingMap] = useState<Record<string, boolean>>({});
  const [extensionFieldValues, setExtensionFieldValues] = useState<ExtensionFieldValues>({});
  const [webuiStatus, setWebuiStatus] = useState<IWebUIStatus | null>(null);

  // Track unsaved builtin credentials per plugin instance so toggles can validate and enable consistently.
  const pendingBuiltinConfigRef = React.useRef<Record<string, BuiltinDraftConfig>>({});

  const updatePendingBuiltinConfig = useCallback((pluginId: string, nextDraft: BuiltinDraftConfig) => {
    const mergedDraft = {
      ...(pendingBuiltinConfigRef.current[pluginId] || {}),
      ...nextDraft,
    };

    const hasAnyValue = Object.values(mergedDraft).some((value) => typeof value === 'string' && value.trim().length > 0);

    if (hasAnyValue) {
      pendingBuiltinConfigRef.current[pluginId] = mergedDraft;
      return;
    }

    delete pendingBuiltinConfigRef.current[pluginId];
  }, []);

  // Collapse state - true means collapsed (closed), false means expanded (open)
  const [collapseKeys, setCollapseKeys] = useState<Record<string, boolean>>({});
  const [activeInstanceKeys, setActiveInstanceKeys] = useState<Record<string, string>>({});
  const [modelReloadVersions, setModelReloadVersions] = useState<Record<BuiltinChannelPlatform, number>>({
    telegram: 0,
    lark: 0,
    dingtalk: 0,
  });

  // Model selection state — uses unified hook with ConfigStorage persistence
  const telegramModelSelection = useChannelModelSelection('assistant.telegram.defaultModel', modelReloadVersions.telegram);
  const larkModelSelection = useChannelModelSelection('assistant.lark.defaultModel', modelReloadVersions.lark);
  const dingtalkModelSelection = useChannelModelSelection('assistant.dingtalk.defaultModel', modelReloadVersions.dingtalk);

  // Load plugin status
  const loadPluginStatus = useCallback(async () => {
    try {
      const result = await channel.getPluginStatus.invoke();
      console.log('[ChannelSettings] getPluginStatus result:', {
        success: result?.success,
        count: result?.data?.length || 0,
      });
      if (result.success && result.data) {
        const sortBuiltinPlugins = (type: 'telegram' | 'lark' | 'dingtalk') =>
          result.data
            .filter((p) => p.type === type)
            .sort((a, b) => {
              const aIsDefault = a.id.endsWith('_default');
              const bIsDefault = b.id.endsWith('_default');
              if (aIsDefault && !bIsDefault) return -1;
              if (!aIsDefault && bIsDefault) return 1;
              return a.id.localeCompare(b.id);
            });

        const extensionPlugins = result.data.filter((p) => !BUILTIN_CHANNEL_TYPES.has(p.type));

        setBuiltinStatuses({
          telegram: sortBuiltinPlugins('telegram'),
          lark: sortBuiltinPlugins('lark'),
          dingtalk: sortBuiltinPlugins('dingtalk'),
        });
        setExtensionStatuses(
          extensionPlugins.sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            const aIsDefault = a.id === a.type || a.id.endsWith('_default');
            const bIsDefault = b.id === b.type || b.id.endsWith('_default');
            if (aIsDefault && !bIsDefault) return -1;
            if (!aIsDefault && bIsDefault) return 1;
            return a.id.localeCompare(b.id);
          })
        );

        setCollapseKeys((prev) => {
          const next = { ...prev };
          for (const plugin of result.data) {
            if (next[plugin.id] === undefined) {
              next[plugin.id] = true;
            }
          }
          return next;
        });

        setExtensionFieldValues((prev) => {
          const next: ExtensionFieldValues = { ...prev };
          for (const plugin of extensionPlugins) {
            const fields = [...(plugin.extensionMeta?.credentialFields || []), ...(plugin.extensionMeta?.configFields || [])] as ExtensionFieldSchema[];
            if (!next[plugin.id]) {
              next[plugin.id] = {};
            }
            for (const field of fields) {
              if (next[plugin.id][field.key] === undefined && field.default !== undefined) {
                next[plugin.id][field.key] = field.default;
              }
            }
          }
          return next;
        });
      }
    } catch (error) {
      console.error('[ChannelSettings] Failed to load plugin status:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadPluginStatus();
  }, [loadPluginStatus]);

  useEffect(() => {
    const loadWebuiStatus = async () => {
      try {
        const result = await webui.getStatus.invoke();
        if (result?.success && result.data) {
          setWebuiStatus(result.data);
        }
      } catch {
        // Best-effort only: channel settings should not fail if webui status is unavailable.
      }
    };
    void loadWebuiStatus();
  }, []);

  // Listen for plugin status changes
  useEffect(() => {
    const unsubscribe = channel.pluginStatusChanged.on(({ status }) => {
      if (status.type === 'telegram' || status.type === 'lark' || status.type === 'dingtalk') {
        setBuiltinStatuses((prev) => {
          const list = [...prev[status.type as BuiltinChannelPlatform]];
          const idx = list.findIndex((item) => item.id === status.id);
          if (idx >= 0) {
            list[idx] = status;
          } else {
            list.push(status);
          }
          list.sort((a, b) => {
            const aIsDefault = a.id.endsWith('_default');
            const bIsDefault = b.id.endsWith('_default');
            if (aIsDefault && !bIsDefault) return -1;
            if (!aIsDefault && bIsDefault) return 1;
            return a.id.localeCompare(b.id);
          });
          return {
            ...prev,
            [status.type]: list,
          };
        });
        return;
      }

      if (!BUILTIN_CHANNEL_TYPES.has(status.type)) {
        setExtensionStatuses((prev) => {
          const list = [...prev];
          const idx = list.findIndex((item) => item.id === status.id);
          if (idx >= 0) {
            list[idx] = {
              ...list[idx],
              ...status,
              extensionMeta: status.extensionMeta || list[idx].extensionMeta,
            };
          } else {
            list.push(status);
          }
          list.sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            const aIsDefault = a.id === a.type || a.id.endsWith('_default');
            const bIsDefault = b.id === b.type || b.id.endsWith('_default');
            if (aIsDefault && !bIsDefault) return -1;
            if (!aIsDefault && bIsDefault) return 1;
            return a.id.localeCompare(b.id);
          });
          return list;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = channel.settingsChanged.on((event) => {
      if (event.change === 'model' && (event.platformType === 'telegram' || event.platformType === 'lark' || event.platformType === 'dingtalk')) {
        const platform = event.platformType as BuiltinChannelPlatform;
        setModelReloadVersions((prev) => ({
          ...prev,
          [platform]: prev[platform] + 1,
        }));
      }

      if (event.change === 'plugin-instance-created' || event.change === 'plugin-instance-renamed' || event.change === 'plugin-instance-deleted') {
        void loadPluginStatus();
      }
    });
    return () => unsubscribe();
  }, [loadPluginStatus]);

  // Toggle collapse
  const handleToggleCollapse = (channelId: string) => {
    setCollapseKeys((prev) => ({
      ...prev,
      [channelId]: !prev[channelId],
    }));
  };

  const handleToggleBuiltinPlugin = async (plugin: IChannelPluginStatus, enabled: boolean) => {
    setBuiltinLoadingMap((prev) => ({ ...prev, [plugin.id]: true }));
    try {
      if (enabled) {
        const pendingConfig = pendingBuiltinConfigRef.current[plugin.id] || {};

        if (plugin.type === 'telegram') {
          const pendingToken = (pendingConfig.token || '').trim();
          if (!plugin.hasToken && !pendingToken) {
            Message.warning(t('settings.assistant.tokenRequired', 'Please enter a bot token first'));
            return;
          }

          const result = await channel.enablePlugin.invoke({
            pluginId: plugin.id,
            config: pendingToken ? { token: pendingToken } : {},
          });
          if (result.success) {
            Message.success(t('settings.assistant.pluginEnabled', 'Telegram bot enabled'));
            await loadPluginStatus();
          } else {
            Message.error(result.msg || t('settings.assistant.enableFailed', 'Failed to enable plugin'));
          }
          return;
        }

        if (plugin.type === 'lark') {
          const appId = (pendingConfig.appId || '').trim();
          const appSecret = (pendingConfig.appSecret || '').trim();
          const encryptKey = (pendingConfig.encryptKey || '').trim();
          const verificationToken = (pendingConfig.verificationToken || '').trim();
          const hasDraftCredentials = Boolean(appId || appSecret);

          if ((!plugin.hasToken && (!appId || !appSecret)) || (hasDraftCredentials && (!appId || !appSecret))) {
            Message.warning(t('settings.lark.credentialsRequired', 'Please configure Lark credentials first'));
            return;
          }

          const result = await channel.enablePlugin.invoke({
            pluginId: plugin.id,
            config: appId && appSecret ? { appId, appSecret, encryptKey: encryptKey || undefined, verificationToken: verificationToken || undefined } : {},
          });

          if (result.success) {
            Message.success(t('settings.lark.pluginEnabled', 'Lark bot enabled'));
            await loadPluginStatus();
          } else {
            Message.error(result.msg || t('settings.lark.enableFailed', 'Failed to enable Lark plugin'));
          }
          return;
        }

        if (plugin.type === 'dingtalk') {
          const clientId = (pendingConfig.clientId || '').trim();
          const clientSecret = (pendingConfig.clientSecret || '').trim();
          const hasDraftCredentials = Boolean(clientId || clientSecret);

          if ((!plugin.hasToken && (!clientId || !clientSecret)) || (hasDraftCredentials && (!clientId || !clientSecret))) {
            Message.warning(t('settings.dingtalk.credentialsRequired', 'Please configure DingTalk credentials first'));
            return;
          }

          const result = await channel.enablePlugin.invoke({
            pluginId: plugin.id,
            config: clientId && clientSecret ? { clientId, clientSecret } : {},
          });

          if (result.success) {
            Message.success(t('settings.dingtalk.pluginEnabled', 'DingTalk bot enabled'));
            await loadPluginStatus();
          } else {
            Message.error(result.msg || t('settings.dingtalk.enableFailed', 'Failed to enable DingTalk plugin'));
          }
          return;
        }
      } else {
        const result = await channel.disablePlugin.invoke({ pluginId: plugin.id });
        if (result.success) {
          const successText = plugin.type === 'telegram' ? t('settings.assistant.pluginDisabled', 'Telegram bot disabled') : plugin.type === 'lark' ? t('settings.lark.pluginDisabled', 'Lark bot disabled') : t('settings.dingtalk.pluginDisabled', 'DingTalk bot disabled');
          Message.success(successText);
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.assistant.disableFailed', 'Failed to disable plugin'));
        }
      }
    } catch (error: any) {
      Message.error(error.message);
    } finally {
      setBuiltinLoadingMap((prev) => ({ ...prev, [plugin.id]: false }));
    }
  };

  const handleCreatePluginInstance = useCallback(
    async (payload: { platform?: 'telegram' | 'lark' | 'dingtalk'; pluginType?: string }) => {
      try {
        const result = await channel.createPluginInstance.invoke(payload);
        if (!result.success || !result.data?.pluginId) {
          Message.error(result.msg || t('settings.channels.createInstanceFailed', { defaultValue: 'Failed to create channel instance' }));
          return;
        }

        const groupId = payload.platform || payload.pluginType || result.data.pluginId;
        await loadPluginStatus();
        setCollapseKeys((prev) => ({
          ...prev,
          [groupId]: false,
        }));
        setActiveInstanceKeys((prev) => ({
          ...prev,
          [groupId]: result.data!.pluginId,
        }));
        Message.success(t('settings.channels.createInstanceSuccess', { defaultValue: 'Channel instance created' }));
      } catch (error: any) {
        Message.error(error.message || t('settings.channels.createInstanceFailed', { defaultValue: 'Failed to create channel instance' }));
      }
    },
    [loadPluginStatus, t]
  );

  const handleCreateBuiltinInstance = useCallback(
    async (platform: 'telegram' | 'lark' | 'dingtalk') => {
      await handleCreatePluginInstance({ platform });
    },
    [handleCreatePluginInstance]
  );

  const handleCreateExtensionInstance = useCallback(
    async (pluginType: string) => {
      await handleCreatePluginInstance({ pluginType });
    },
    [handleCreatePluginInstance]
  );

  const handleRenamePluginInstance = useCallback(
    async (status: IChannelPluginStatus, name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        Message.warning(t('settings.channels.renameInstanceRequired', { defaultValue: '请输入实例名称' }));
        return false;
      }

      if (trimmedName === status.name) {
        return true;
      }

      try {
        const result = await channel.renamePluginInstance.invoke({
          pluginId: status.id,
          pluginType: status.type,
          name: trimmedName,
        });
        if (!result.success) {
          Message.error(result.msg || t('settings.channels.renameInstanceFailed', { defaultValue: '修改实例名称失败' }));
          return false;
        }
        await loadPluginStatus();
        return true;
      } catch (error: any) {
        Message.error(error.message || t('settings.channels.renameInstanceFailed', { defaultValue: '修改实例名称失败' }));
        return false;
      }
    },
    [loadPluginStatus, t]
  );

  const isDefaultPluginInstance = useCallback((pluginId: string, pluginType: string) => {
    return pluginId === pluginType || pluginId.endsWith('_default');
  }, []);

  const handleDeletePluginInstance = useCallback(
    async (pluginId: string) => {
      try {
        const result = await channel.deletePluginInstance.invoke({ pluginId });
        if (!result.success) {
          Message.error(result.msg || t('settings.channels.deleteInstanceFailed', { defaultValue: 'Failed to delete channel instance' }));
          return;
        }

        await loadPluginStatus();
        setExtensionFieldValues((prev) => {
          const next = { ...prev };
          delete next[pluginId];
          return next;
        });
        delete pendingBuiltinConfigRef.current[pluginId];

        Message.success(t('settings.channels.deleteInstanceSuccess', { defaultValue: 'Channel instance deleted' }));
      } catch (error: any) {
        Message.error(error.message || t('settings.channels.deleteInstanceFailed', { defaultValue: 'Failed to delete channel instance' }));
      }
    },
    [loadPluginStatus, t]
  );

  const renderGroupHeaderActions = useCallback((options: { addLabel: string; onAdd: () => void; canAdd: boolean }) => {
    const { addLabel, onAdd, canAdd } = options;
    if (!canAdd) return null;
    return (
      <Button
        size='mini'
        type='secondary'
        shape='circle'
        title={addLabel}
        aria-label={addLabel}
        icon={<Plus theme='outline' size='12' />}
        onClick={(event) => {
          event.stopPropagation();
          onAdd();
        }}
      />
    );
  }, []);

  const renderInstanceActions = useCallback(
    (status: IChannelPluginStatus) => {
      if (isDefaultPluginInstance(status.id, status.type)) {
        return null;
      }

      return (
        <Popconfirm title={t('settings.channels.deleteInstanceConfirm', { defaultValue: '确认删除该实例？' })} content={t('settings.channels.deleteInstanceConfirmDesc', { defaultValue: '删除后不可恢复。' })} onOk={() => void handleDeletePluginInstance(status.id)}>
          <Button size='mini' status='danger' type='secondary'>
            {t('settings.channels.deleteInstance', { defaultValue: '删除实例' })}
          </Button>
        </Popconfirm>
      );
    },
    [handleDeletePluginInstance, isDefaultPluginInstance, t]
  );

  const handleSelectActiveInstance = useCallback((groupId: string, instanceId: string) => {
    setActiveInstanceKeys((prev) => {
      if (prev[groupId] === instanceId) {
        return prev;
      }
      return {
        ...prev,
        [groupId]: instanceId,
      };
    });
  }, []);

  useEffect(() => {
    const nextActiveKeys: Record<string, string> = {};

    const ensureActiveInstance = (groupId: string, statuses: IChannelPluginStatus[]) => {
      if (statuses.length === 0) return;
      const current = activeInstanceKeys[groupId];
      if (current && statuses.some((item) => item.id === current)) {
        return;
      }
      nextActiveKeys[groupId] = statuses[0].id;
    };

    ensureActiveInstance('telegram', builtinStatuses.telegram);
    ensureActiveInstance('lark', builtinStatuses.lark);
    ensureActiveInstance('dingtalk', builtinStatuses.dingtalk);

    const extensionGroups = extensionStatuses.reduce<Record<string, IChannelPluginStatus[]>>((acc, item) => {
      (acc[item.type] ||= []).push(item);
      return acc;
    }, {});

    Object.entries(extensionGroups).forEach(([groupId, statuses]) => ensureActiveInstance(groupId, statuses));

    if (Object.keys(nextActiveKeys).length > 0) {
      setActiveInstanceKeys((prev) => ({
        ...prev,
        ...nextActiveKeys,
      }));
    }
  }, [activeInstanceKeys, builtinStatuses, extensionStatuses]);

  const getInstanceTabTitle = useCallback(
    (index: number) => {
      return index === 0 ? t('settings.channels.defaultInstanceTab', { defaultValue: '默认实例' }) : t('settings.channels.instanceTab', { defaultValue: '实例 {{index}}', index: index + 1 });
    },
    [t]
  );

  const updateExtensionFieldValue = useCallback((pluginId: string, key: string, value: string | number | boolean) => {
    setExtensionFieldValues((prev) => ({
      ...prev,
      [pluginId]: {
        ...(prev[pluginId] || {}),
        [key]: value,
      },
    }));
  }, []);

  const handleToggleExtensionPlugin = useCallback(
    async (pluginId: string, enabled: boolean) => {
      const status = extensionStatuses.find((item) => item.id === pluginId);
      if (!status) return;

      setExtensionLoadingMap((prev) => ({ ...prev, [pluginId]: true }));
      try {
        if (enabled) {
          const fieldValues = extensionFieldValues[pluginId] || {};
          const credentialFields = (status.extensionMeta?.credentialFields || []) as ExtensionFieldSchema[];
          const missingField = credentialFields.find((field) => {
            if (!field.required) return false;
            const value = fieldValues[field.key];
            if (field.type === 'boolean') return value === undefined;
            return value === undefined || value === '';
          });

          if (missingField) {
            Message.warning(
              t('settings.channels.extension.requiredField', {
                defaultValue: 'Please fill required field: {{field}}',
                field: missingField.label,
              })
            );
            return;
          }

          const result = await channel.enablePlugin.invoke({
            pluginId: status.id,
            config: fieldValues,
          });

          if (result.success) {
            Message.success(t('settings.channels.extension.enabled', { defaultValue: 'Channel enabled' }));
            await loadPluginStatus();
          } else {
            Message.error(result.msg || t('settings.channels.extension.enableFailed', { defaultValue: 'Failed to enable channel' }));
          }
        } else {
          const result = await channel.disablePlugin.invoke({ pluginId: status.id });
          if (result.success) {
            Message.success(t('settings.channels.extension.disabled', { defaultValue: 'Channel disabled' }));
            await loadPluginStatus();
          } else {
            Message.error(result.msg || t('settings.channels.extension.disableFailed', { defaultValue: 'Failed to disable channel' }));
          }
        }
      } catch (error: any) {
        Message.error(error.message || String(error));
      } finally {
        setExtensionLoadingMap((prev) => ({ ...prev, [pluginId]: false }));
      }
    },
    [extensionStatuses, extensionFieldValues, t, loadPluginStatus]
  );

  const getToggleHandler = useCallback(
    (channelId: string) => {
      const builtinPlugin = [...builtinStatuses.telegram, ...builtinStatuses.lark, ...builtinStatuses.dingtalk].find((item) => item.id === channelId);
      if (builtinPlugin) {
        return (enabled: boolean) => {
          void handleToggleBuiltinPlugin(builtinPlugin, enabled);
        };
      }
      if (extensionStatuses.some((item) => item.id === channelId)) {
        return (enabled: boolean) => {
          void handleToggleExtensionPlugin(channelId, enabled);
        };
      }
      return undefined;
    },
    [builtinStatuses, extensionStatuses, handleToggleExtensionPlugin]
  );

  const renderExtensionConfigForm = useCallback(
    (status: IChannelPluginStatus) => {
      const pluginType = status.type;
      const pluginId = status.id;
      const fields = [...((status.extensionMeta?.credentialFields || []) as ExtensionFieldSchema[]), ...((status.extensionMeta?.configFields || []) as ExtensionFieldSchema[])];
      const values = extensionFieldValues[pluginId] || {};
      const callbackPath = '/ext-wecom-bot/webhook';
      const localCallbackUrl = webuiStatus?.localUrl ? `${webuiStatus.localUrl}${callbackPath}` : `http://localhost:25808${callbackPath}`;
      const lanCallbackUrl = webuiStatus?.networkUrl ? `${webuiStatus.networkUrl}${callbackPath}` : null;
      const publicBaseUrl = typeof values.publicBaseUrl === 'string' ? values.publicBaseUrl.trim().replace(/\/+$/, '') : '';
      const publicCallbackUrl = publicBaseUrl ? `${publicBaseUrl}${callbackPath}` : null;

      if (fields.length === 0) {
        return <div className='text-14px text-t-secondary py-12px'>{status.extensionMeta?.description || t('settings.channels.extension.noConfig', { defaultValue: 'No extra configuration required.' })}</div>;
      }

      return (
        <div className='space-y-10px py-4px'>
          {status.extensionMeta?.description && <div className='text-13px text-t-secondary leading-relaxed'>{status.extensionMeta.description}</div>}
          {pluginType === 'ext-wecom-bot' && (
            <div className='text-12px leading-relaxed p-10px rd-8px bg-[rgba(var(--orange-6),0.08)] border border-[rgba(var(--orange-6),0.3)] text-t-secondary'>
              <div className='font-500 text-t-primary mb-6px'>企微回调地址说明</div>
              <div>本机 Callback URL: {localCallbackUrl}</div>
              {lanCallbackUrl ? <div>局域网 Callback URL: {lanCallbackUrl}</div> : null}
              {publicCallbackUrl ? <div>公网 Callback URL(配置值): {publicCallbackUrl}</div> : null}
              <div className='mt-6px'>仅开启 WebUI 远程访问（LAN）通常不能直接通过企微回调。企微服务器需要可访问的公网 HTTPS 地址。</div>
              <div>建议：使用反向代理 + 证书，或 Cloudflare Tunnel / ngrok 映射到本机。</div>
            </div>
          )}
          {fields.map((field) => {
            const rawValue = values[field.key];
            const label = `${field.label}${field.required ? ' *' : ''}`;

            if (field.type === 'boolean') {
              return (
                <div key={`${pluginType}-${field.key}`} className='flex items-center justify-between'>
                  <span className='text-13px text-t-primary'>{label}</span>
                  <Switch checked={Boolean(rawValue)} onChange={(checked) => updateExtensionFieldValue(pluginId, field.key, checked)} />
                </div>
              );
            }

            if (field.type === 'number') {
              return (
                <div key={`${pluginType}-${field.key}`} className='space-y-6px'>
                  <div className='text-13px text-t-primary'>{label}</div>
                  <InputNumber value={typeof rawValue === 'number' ? rawValue : undefined} onChange={(value) => updateExtensionFieldValue(pluginId, field.key, Number(value || 0))} className='w-full' />
                </div>
              );
            }

            if (field.type === 'select') {
              return (
                <div key={`${pluginType}-${field.key}`} className='space-y-6px'>
                  <div className='text-13px text-t-primary'>{label}</div>
                  <Select value={typeof rawValue === 'string' ? rawValue : undefined} options={(field.options || []).map((option) => ({ label: option, value: option }))} onChange={(value) => updateExtensionFieldValue(pluginId, field.key, String(value))} placeholder={t('settings.channels.extension.selectPlaceholder', { defaultValue: 'Please select' })} allowClear />
                </div>
              );
            }

            return (
              <div key={`${pluginType}-${field.key}`} className='space-y-6px'>
                <div className='text-13px text-t-primary'>{label}</div>
                <Input value={typeof rawValue === 'string' ? rawValue : ''} onChange={(value) => updateExtensionFieldValue(pluginId, field.key, value)} placeholder={field.label} type={field.type === 'password' ? 'password' : 'text'} />
              </div>
            );
          })}
        </div>
      );
    },
    [extensionFieldValues, t, updateExtensionFieldValue, webuiStatus]
  );

  // Build channel configurations
  const channels: ChannelConfig[] = useMemo(() => {
    const activeTelegram = builtinStatuses.telegram.find((item) => item.id === activeInstanceKeys.telegram) || builtinStatuses.telegram[0];
    const activeLark = builtinStatuses.lark.find((item) => item.id === activeInstanceKeys.lark) || builtinStatuses.lark[0];
    const activeDingTalk = builtinStatuses.dingtalk.find((item) => item.id === activeInstanceKeys.dingtalk) || builtinStatuses.dingtalk[0];

    const builtinChannels: ChannelConfig[] = [
      {
        id: 'telegram',
        title: t('settings.channels.telegramTitle', 'Telegram'),
        description: t('settings.channels.telegramDesc', 'Chat with AionUi assistant via Telegram'),
        status: 'active' as const,
        enabled: activeTelegram?.enabled || false,
        disabled: activeTelegram ? builtinLoadingMap[activeTelegram.id] || false : false,
        isConnected: activeTelegram?.connected || false,
        botUsername: activeTelegram?.botUsername,
        defaultModel: telegramModelSelection.currentModel?.useModel,
        activeInstanceId: activeTelegram?.id,
        headerActions: renderGroupHeaderActions({
          addLabel: t('settings.channels.addTelegramInstance', { defaultValue: '新增 Telegram 实例' }),
          onAdd: () => void handleCreateBuiltinInstance('telegram'),
          canAdd: true,
        }),
        instances: builtinStatuses.telegram.map((status, idx) => ({
          id: status.id,
          title: getInstanceTabTitle(idx),
          status: 'active' as const,
          enabled: status.enabled || false,
          disabled: builtinLoadingMap[status.id] || false,
          isConnected: status.connected || false,
          botUsername: status.botUsername,
          defaultModel: telegramModelSelection.currentModel?.useModel,
          actions: renderInstanceActions(status),
          onToggleEnabled: getToggleHandler(status.id),
          content: (
            <TelegramConfigForm
              key={status.id}
              pluginStatus={status}
              modelSelection={telegramModelSelection}
              onStatusChange={(nextStatus) => {
                if (!nextStatus) return;
                setBuiltinStatuses((prev) => ({
                  ...prev,
                  telegram: prev.telegram.map((item) => (item.id === status.id ? nextStatus : item)),
                }));
              }}
              onTokenChange={(token) => {
                updatePendingBuiltinConfig(status.id, { token });
              }}
            />
          ),
        })),
      },
      {
        id: 'lark',
        title: t('settings.channels.larkTitle', 'Lark / Feishu'),
        description: t('settings.channels.larkDesc', 'Chat with AionUi assistant via Lark or Feishu'),
        status: 'active' as const,
        enabled: activeLark?.enabled || false,
        disabled: activeLark ? builtinLoadingMap[activeLark.id] || false : false,
        isConnected: activeLark?.connected || false,
        defaultModel: larkModelSelection.currentModel?.useModel,
        activeInstanceId: activeLark?.id,
        headerActions: renderGroupHeaderActions({
          addLabel: t('settings.channels.addLarkInstance', { defaultValue: '新增 Lark 实例' }),
          onAdd: () => void handleCreateBuiltinInstance('lark'),
          canAdd: true,
        }),
        instances: builtinStatuses.lark.map((status, idx) => ({
          id: status.id,
          title: getInstanceTabTitle(idx),
          status: 'active' as const,
          enabled: status.enabled || false,
          disabled: builtinLoadingMap[status.id] || false,
          isConnected: status.connected || false,
          defaultModel: larkModelSelection.currentModel?.useModel,
          actions: renderInstanceActions(status),
          onToggleEnabled: getToggleHandler(status.id),
          content: (
            <LarkConfigForm
              key={status.id}
              pluginStatus={status}
              modelSelection={larkModelSelection}
              onStatusChange={(nextStatus) => {
                if (!nextStatus) return;
                setBuiltinStatuses((prev) => ({
                  ...prev,
                  lark: prev.lark.map((item) => (item.id === status.id ? nextStatus : item)),
                }));
              }}
              onDraftConfigChange={(draft) => {
                updatePendingBuiltinConfig(status.id, draft);
              }}
            />
          ),
        })),
      },
      {
        id: 'dingtalk',
        title: t('settings.channels.dingtalkTitle', 'DingTalk'),
        description: t('settings.channels.dingtalkDesc', 'Chat with AionUi assistant via DingTalk'),
        status: 'active' as const,
        enabled: activeDingTalk?.enabled || false,
        disabled: activeDingTalk ? builtinLoadingMap[activeDingTalk.id] || false : false,
        isConnected: activeDingTalk?.connected || false,
        defaultModel: dingtalkModelSelection.currentModel?.useModel,
        activeInstanceId: activeDingTalk?.id,
        headerActions: renderGroupHeaderActions({
          addLabel: t('settings.channels.addDingTalkInstance', { defaultValue: '新增 DingTalk 实例' }),
          onAdd: () => void handleCreateBuiltinInstance('dingtalk'),
          canAdd: true,
        }),
        instances: builtinStatuses.dingtalk.map((status, idx) => ({
          id: status.id,
          title: getInstanceTabTitle(idx),
          status: 'active' as const,
          enabled: status.enabled || false,
          disabled: builtinLoadingMap[status.id] || false,
          isConnected: status.connected || false,
          defaultModel: dingtalkModelSelection.currentModel?.useModel,
          actions: renderInstanceActions(status),
          onToggleEnabled: getToggleHandler(status.id),
          content: (
            <DingTalkConfigForm
              key={status.id}
              pluginStatus={status}
              modelSelection={dingtalkModelSelection}
              onStatusChange={(nextStatus) => {
                if (!nextStatus) return;
                setBuiltinStatuses((prev) => ({
                  ...prev,
                  dingtalk: prev.dingtalk.map((item) => (item.id === status.id ? nextStatus : item)),
                }));
              }}
              onDraftConfigChange={(draft) => {
                updatePendingBuiltinConfig(status.id, draft);
              }}
            />
          ),
        })),
      },
    ];

    const extensionGroupsMap = extensionStatuses.reduce<Record<string, IChannelPluginStatus[]>>((acc, item) => {
      (acc[item.type] ||= []).push(item);
      return acc;
    }, {});

    const extensionChannels: ChannelConfig[] = Object.entries(extensionGroupsMap)
      .map(([pluginType, statuses]) => {
        const sortedStatuses = [...statuses].sort((a, b) => {
          const aIsDefault = a.id === a.type || a.id.endsWith('_default');
          const bIsDefault = b.id === b.type || b.id.endsWith('_default');
          if (aIsDefault && !bIsDefault) return -1;
          if (!aIsDefault && bIsDefault) return 1;
          return a.id.localeCompare(b.id);
        });
        const activeStatus = sortedStatuses.find((item) => item.id === activeInstanceKeys[pluginType]) || sortedStatuses[0];
        const baseStatus = sortedStatuses[0];

        return {
          id: pluginType,
          title: baseStatus?.name || pluginType,
          description: baseStatus?.extensionMeta?.description || t('settings.channels.extension.defaultDesc', { defaultValue: 'Extension channel plugin' }),
          status: 'active' as const,
          enabled: activeStatus?.enabled || false,
          disabled: activeStatus ? extensionLoadingMap[activeStatus.id] || false : false,
          isConnected: activeStatus?.connected || false,
          icon: baseStatus?.extensionMeta?.icon,
          isExtension: true,
          activeInstanceId: activeStatus?.id,
          headerActions: renderGroupHeaderActions({
            addLabel: t('settings.channels.addExtensionInstance', { defaultValue: '新增 {{name}} 实例', name: baseStatus?.name || pluginType }),
            onAdd: () => void handleCreateExtensionInstance(pluginType),
            canAdd: Boolean(baseStatus?.extensionMeta?.multiInstance),
          }),
          instances: sortedStatuses.map((status, idx) => ({
            id: status.id,
            title: getInstanceTabTitle(idx),
            status: 'active' as const,
            enabled: status.enabled || false,
            disabled: extensionLoadingMap[status.id] || false,
            isConnected: status.connected || false,
            actions: renderInstanceActions(status),
            onToggleEnabled: getToggleHandler(status.id),
            content: renderExtensionConfigForm(status),
          })),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    const extensionTypeSet = new Set(extensionStatuses.map((status) => String(status.type).toLowerCase()));
    const comingSoonChannels: ChannelConfig[] = [
      {
        id: 'slack',
        title: t('settings.channels.slackTitle', 'Slack'),
        description: t('settings.channels.slackDesc', 'Chat with AionUi assistant via Slack'),
        status: 'coming_soon' as const,
        enabled: false,
        disabled: true,
        content: <div className='text-14px text-t-secondary py-12px'>{t('settings.channels.comingSoonDesc', 'Support for {{channel}} is coming soon', { channel: t('settings.channels.slackTitle', 'Slack') })}</div>,
      },
      {
        id: 'discord',
        title: t('settings.channels.discordTitle', 'Discord'),
        description: t('settings.channels.discordDesc', 'Chat with AionUi assistant via Discord'),
        status: 'coming_soon' as const,
        enabled: false,
        disabled: true,
        content: <div className='text-14px text-t-secondary py-12px'>{t('settings.channels.comingSoonDesc', 'Support for {{channel}} is coming soon', { channel: t('settings.channels.discordTitle', 'Discord') })}</div>,
      },
    ].filter((channel) => !extensionTypeSet.has(String(channel.id).toLowerCase()));

    return [...builtinChannels, ...extensionChannels, ...comingSoonChannels];
  }, [activeInstanceKeys, builtinLoadingMap, builtinStatuses, dingtalkModelSelection, extensionLoadingMap, extensionStatuses, getInstanceTabTitle, handleCreateBuiltinInstance, handleCreateExtensionInstance, getToggleHandler, larkModelSelection, renderExtensionConfigForm, renderGroupHeaderActions, renderInstanceActions, t, telegramModelSelection]);

  const channelGuideText = t('settings.webui.featureChannelsDesc', { defaultValue: 'Connect Telegram, Lark, and DingTalk to interact with AionUi from IM apps.' });
  const channelSetupSteps = [t('settings.channels.selectFirst', { defaultValue: 'Select a channel and configure credentials.' }), t('settings.channels.enableAfterConfig', { defaultValue: 'Enable it and start chatting with your AI agent.' })];

  return (
    <AionScrollArea className={isPageMode ? 'h-full' : ''}>
      <div className='px-[12px] md:px-[28px]'>
        <h2 className='text-20px font-500 text-t-primary m-0'>{t('settings.channels.title', 'Channels')}</h2>
        <div className='space-y-8px mt-10px'>
          <div className='text-13px text-t-secondary leading-relaxed'>{channelGuideText}</div>
          <div className='flex flex-wrap gap-x-12px gap-y-6px'>
            {channelSetupSteps.map((stepLabel, idx) => (
              <div key={stepLabel} className='inline-flex items-center gap-6px'>
                <span className='inline-flex items-center justify-center w-16px h-16px rd-50% text-10px font-600 bg-[rgba(var(--primary-6),0.12)] text-[rgb(var(--primary-6))]'>{idx + 1}</span>
                <CheckOne theme='outline' size='12' className='text-[rgb(var(--primary-6))]' />
                <span className='text-12px text-t-secondary'>{stepLabel}</span>
              </div>
            ))}
          </div>
        </div>

        <div className='space-y-12px mt-12px'>
          {channels.map((channelConfig) => (
            <ChannelItem key={channelConfig.id} channel={channelConfig} isCollapsed={collapseKeys[channelConfig.id] || false} onToggleCollapse={() => handleToggleCollapse(channelConfig.id)} onSelectInstance={(instanceId) => handleSelectActiveInstance(channelConfig.id, instanceId)} />
          ))}
        </div>
      </div>
    </AionScrollArea>
  );
};

export default ChannelModalContent;
