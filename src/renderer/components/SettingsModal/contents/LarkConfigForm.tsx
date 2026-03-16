/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/channels/types';
import { acpConversation, channel, dialog } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import { WorkspaceSelectorPopover } from '@/renderer/pages/guid/components/WorkspaceShortcutSelector';
import guidStyles from '@/renderer/pages/guid/index.module.css';
import { openExternalUrl } from '@/renderer/utils/platform';
import GeminiModelSelector from '@/renderer/pages/conversation/gemini/GeminiModelSelector';
import type { GeminiModelSelection } from '@/renderer/pages/conversation/gemini/useGeminiModelSelection';
import { updateWorkspaceTime } from '@/renderer/utils/workspaceHistory';
import type { AcpBackendAll } from '@/types/acpTypes';
import { Button, Dropdown, Empty, Input, Menu, Message, Spin, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, Delete, Down, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ChannelAssistantOptionContent from './channels/ChannelAssistantOptionContent';
import { getChannelAssistantKey, getChannelAssistantLabel, loadChannelAssistantOptions, type ChannelAssistantOption } from './channels/channelAssistantOptions';

/**
 * Preference row component
 */
const PreferenceRow: React.FC<{
  label: string;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, description, extra, required, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='flex-1'>
      <div className='flex items-center gap-8px'>
        <span className='text-14px text-t-primary'>
          {label}
          {required && <span className='text-red-500 ml-2px'>*</span>}
        </span>
        {extra}
      </div>
      {description && <div className='text-12px text-t-tertiary mt-2px'>{description}</div>}
    </div>
    <div className='flex items-center'>{children}</div>
  </div>
);

/**
 * Section header component
 */
const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className='flex items-center justify-between mb-12px'>
    <h3 className='text-14px font-500 text-t-primary m-0'>{title}</h3>
    {action}
  </div>
);

interface LarkConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GeminiModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
  onDraftConfigChange?: (draft: { appId?: string; appSecret?: string; encryptKey?: string; verificationToken?: string }) => void;
}

type ChannelChatMode = 'single' | 'group';

const LARK_DEV_DOCS_URL = 'https://open.feishu.cn/document/develop-an-echo-bot/introduction';

const LarkConfigForm: React.FC<LarkConfigFormProps> = ({ pluginStatus, modelSelection, onStatusChange, onDraftConfigChange }) => {
  const { t, i18n } = useTranslation();

  // Lark credentials
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [encryptKey, setEncryptKey] = useState('');
  const [verificationToken, setVerificationToken] = useState('');

  const [showOptional, setShowOptional] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [credentialsTested, setCredentialsTested] = useState(false);
  const [touched, setTouched] = useState({ appId: false, appSecret: false });
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  // Agent selection (used for Lark conversations)
  const [availableAgents, setAvailableAgents] = useState<ChannelAssistantOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<{ backend: AcpBackendAll; name?: string; customAgentId?: string }>({ backend: 'gemini' });
  const [workspacePath, setWorkspacePath] = useState('');

  // Instance-scoped settings keys (fallback to legacy platform keys for compatibility)
  const pluginId = pluginStatus?.id || 'lark_default';
  const pluginAgentKey = `assistant.plugin.${pluginId}.agent` as any;
  const pluginChatModeKey = `assistant.plugin.${pluginId}.chatMode` as any;
  const pluginWorkspaceKey = `assistant.plugin.${pluginId}.workspace` as const;
  const platformWorkspaceKey = 'assistant.lark.workspace' as const;
  const isDefaultPluginInstance = pluginStatus ? pluginStatus.id === pluginStatus.type || pluginStatus.id.endsWith('_default') : true;

  // Chat mode: single (compat) | group (@mention routing)
  const [chatMode, setChatMode] = useState<ChannelChatMode>('single');

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const result = await channel.getPendingPairings.invoke({ pluginId, platformType: 'lark' });
      if (result.success && result.data) {
        setPendingPairings(result.data);
      }
    } catch (error) {
      console.error('[LarkConfig] Failed to load pending pairings:', error);
    } finally {
      setPairingLoading(false);
    }
  }, [pluginId]);

  // Load authorized users
  const loadAuthorizedUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await channel.getAuthorizedUsers.invoke({ pluginId, platformType: 'lark' });
      if (result.success && result.data) {
        setAuthorizedUsers(result.data);
      }
    } catch (error) {
      console.error('[LarkConfig] Failed to load authorized users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, [pluginId]);

  // Refresh platform data when switching instances to avoid stale UI state
  useEffect(() => {
    void loadPendingPairings();
    void loadAuthorizedUsers();
  }, [loadAuthorizedUsers, loadPendingPairings, pluginId]);

  useEffect(() => {
    setAppId('');
    setAppSecret('');
    setEncryptKey('');
    setVerificationToken('');
    setShowOptional(false);
    setCredentialsTested(false);
    setTouched({ appId: false, appSecret: false });
    setSelectedAgent({ backend: 'gemini' });
    setWorkspacePath('');
    setChatMode('single');
    onDraftConfigChange?.({});
  }, [onDraftConfigChange, pluginId]);

  useEffect(() => {
    onDraftConfigChange?.({
      appId,
      appSecret,
      encryptKey,
      verificationToken,
    });
  }, [appId, appSecret, encryptKey, onDraftConfigChange, verificationToken]);

  // Load available agents + saved selection
  const loadAgentsAndSelection = useCallback(async () => {
    try {
      const [assistantOptions, savedScopedAgent, savedScopedChatMode, savedLegacyAgent, savedLegacyChatMode, savedScopedWorkspace, savedLegacyWorkspace] = await Promise.all([loadChannelAssistantOptions(i18n.language), ConfigStorage.get(pluginAgentKey), ConfigStorage.get(pluginChatModeKey), ConfigStorage.get('assistant.lark.agent'), ConfigStorage.get('assistant.lark.chatMode'), ConfigStorage.get(pluginWorkspaceKey as any), ConfigStorage.get(platformWorkspaceKey as any)]);

      setAvailableAgents(assistantOptions);

      const savedAgent = savedScopedAgent ?? (isDefaultPluginInstance ? savedLegacyAgent : undefined);
      const savedChatMode = savedScopedChatMode ?? (isDefaultPluginInstance ? savedLegacyChatMode : undefined);
      const savedWorkspace = savedScopedWorkspace ?? (isDefaultPluginInstance ? savedLegacyWorkspace : undefined);

      if (savedAgent && typeof savedAgent === 'object' && 'backend' in savedAgent && typeof (savedAgent as any).backend === 'string') {
        setSelectedAgent({
          backend: (savedAgent as any).backend as AcpBackendAll,
          customAgentId: (savedAgent as any).customAgentId,
          name: (savedAgent as any).name,
        });
      } else if (typeof savedAgent === 'string') {
        setSelectedAgent({ backend: savedAgent as AcpBackendAll });
      }

      if (savedChatMode === 'group' || savedChatMode === 'single') {
        setChatMode(savedChatMode);
      }

      setWorkspacePath(typeof savedWorkspace === 'string' ? savedWorkspace : '');
    } catch (error) {
      console.error('[LarkConfig] Failed to load channel settings:', error);
    }
  }, [i18n.language, isDefaultPluginInstance, platformWorkspaceKey, pluginAgentKey, pluginChatModeKey, pluginWorkspaceKey]);

  useEffect(() => {
    void loadAgentsAndSelection();
  }, [loadAgentsAndSelection]);

  const persistSelectedAgent = async (agent: { backend: AcpBackendAll; customAgentId?: string; name?: string }) => {
    try {
      await ConfigStorage.set(pluginAgentKey, agent);
      if (isDefaultPluginInstance) {
        await ConfigStorage.set('assistant.lark.agent', agent);
      }
      await channel.syncChannelSettings.invoke({ platform: 'lark', agent, pluginId, change: 'agent' }).catch((err) => console.warn('[LarkConfig] syncChannelSettings failed:', err));
      Message.success(t('settings.assistant.agentSwitched', 'Agent switched successfully'));
    } catch (error) {
      console.error('[LarkConfig] Failed to save agent:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  const persistWorkspace = async (path: string) => {
    const nextWorkspace = path.trim();
    try {
      await ConfigStorage.set(pluginWorkspaceKey as any, nextWorkspace);
      if (isDefaultPluginInstance) {
        await ConfigStorage.set(platformWorkspaceKey as any, nextWorkspace);
      }
      if (nextWorkspace) {
        updateWorkspaceTime(nextWorkspace);
      }
      setWorkspacePath(nextWorkspace);
      await channel.syncChannelSettings.invoke({ platform: 'lark', agent: selectedAgent, pluginId, change: 'workspace' }).catch((err) => console.warn('[LarkConfig] syncChannelSettings failed:', err));
      Message.success(nextWorkspace ? t('settings.channels.workspaceSaved', '工作目录已保存') : t('settings.channels.workspaceCleared', '工作目录已清空'));
    } catch (error) {
      console.error('[LarkConfig] Failed to save workspace:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  const handleSelectWorkspace = async () => {
    try {
      const selected = await dialog.showOpen.invoke({
        defaultPath: workspacePath || undefined,
        properties: ['openDirectory'],
      });
      if (selected?.[0]) {
        await persistWorkspace(selected[0]);
      }
    } catch (error) {
      console.error('[LarkConfig] Failed to pick workspace:', error);
      Message.error(t('settings.channels.workspacePickFailed', '选择工作目录失败'));
    }
  };

  const persistChatMode = async (nextMode: ChannelChatMode) => {
    try {
      await ConfigStorage.set(pluginChatModeKey, nextMode);
      if (isDefaultPluginInstance) {
        await ConfigStorage.set('assistant.lark.chatMode', nextMode);
      }
      await channel.syncChannelSettings.invoke({ platform: 'lark', agent: selectedAgent, pluginId, change: 'chatMode' }).catch((err) => console.warn('[LarkConfig] syncChannelSettings failed:', err));
      setChatMode(nextMode);
      Message.success(nextMode === 'group' ? t('settings.channels.groupModeEnabled', { defaultValue: '群聊模式已开启，可使用 @AgentName 路由到多助手。' }) : t('settings.channels.groupModeDisabled', { defaultValue: '已切换为单聊模式，保持原有行为。' }));
    } catch (error) {
      console.error('[LarkConfig] Failed to save chat mode:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'lark') return;
      if ((request.pluginId ?? 'lark_default') !== pluginId) return;
      setPendingPairings((prev) => {
        const exists = prev.some((p) => p.code === request.code);
        if (exists) return prev;
        return [request, ...prev];
      });
    });
    return () => unsubscribe();
  }, [pluginId]);

  // Listen for user authorization
  useEffect(() => {
    const unsubscribe = channel.userAuthorized.on((user) => {
      if (user.platformType !== 'lark') return;
      if ((user.pluginId ?? 'lark_default') !== pluginId) return;
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
      setPendingPairings((prev) => prev.filter((p) => p.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, [pluginId]);

  useEffect(() => {
    const unsubscribe = channel.settingsChanged.on((event) => {
      if (event.platformType !== 'lark') return;
      if ((event.pluginId ?? 'lark_default') !== pluginId) return;

      if (event.change === 'pairings') {
        void loadPendingPairings();
      }

      if (event.change === 'authorized-users') {
        void loadAuthorizedUsers();
      }

      if (event.change === 'agent' || event.change === 'chatMode' || event.change === 'workspace') {
        void loadAgentsAndSelection();
      }
    });
    return () => unsubscribe();
  }, [loadAgentsAndSelection, loadAuthorizedUsers, loadPendingPairings, pluginId]);

  // Test Lark connection
  const handleTestConnection = async () => {
    // Mark fields as touched to show validation errors
    setTouched({ appId: true, appSecret: true });

    if (!appId.trim() || !appSecret.trim()) {
      Message.warning(t('settings.lark.credentialsRequired', 'Please enter App ID and App Secret'));
      return;
    }

    setTestLoading(true);
    setCredentialsTested(false);
    try {
      const result = await channel.testPlugin.invoke({
        pluginId,
        token: '', // Not used for Lark
        extraConfig: {
          appId: appId.trim(),
          appSecret: appSecret.trim(),
        },
      });

      if (result.success && result.data?.success) {
        setCredentialsTested(true);
        Message.success(t('settings.lark.connectionSuccess', 'Connected to Lark API!'));

        // Auto-enable bot after successful test
        await handleAutoEnable();
      } else {
        setCredentialsTested(false);
        Message.error(result.data?.error || t('settings.lark.connectionFailed', 'Connection failed'));
      }
    } catch (error: any) {
      setCredentialsTested(false);
      Message.error(error.message || t('settings.lark.connectionFailed', 'Connection failed'));
    } finally {
      setTestLoading(false);
    }
  };

  // Auto-enable plugin after successful test
  const handleAutoEnable = async () => {
    try {
      const result = await channel.enablePlugin.invoke({
        pluginId,
        config: {
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          encryptKey: encryptKey.trim() || undefined,
          verificationToken: verificationToken.trim() || undefined,
        },
      });

      if (result.success) {
        Message.success(t('settings.lark.pluginEnabled', 'Lark bot enabled'));
        const statusResult = await channel.getPluginStatus.invoke();
        if (statusResult.success && statusResult.data) {
          const larkPlugin = statusResult.data.find((p) => p.id === pluginId);
          onStatusChange(larkPlugin || null);
        }
      } else {
        // Show error to user when enable fails
        console.error('[LarkConfig] enablePlugin failed:', result.msg);
        Message.error(result.msg || t('settings.lark.enableFailed', 'Failed to enable Lark plugin'));
      }
    } catch (error: any) {
      console.error('[LarkConfig] Auto-enable failed:', error);
      Message.error(error.message || t('settings.lark.enableFailed', 'Failed to enable Lark plugin'));
    }
  };

  // Reset credentials tested state when credentials change
  const handleCredentialsChange = () => {
    setCredentialsTested(false);
  };

  // Approve pairing
  const handleApprovePairing = async (code: string) => {
    try {
      const result = await channel.approvePairing.invoke({ code });
      if (result.success) {
        Message.success(t('settings.assistant.pairingApproved', 'Pairing approved'));
        await loadPendingPairings();
        await loadAuthorizedUsers();
      } else {
        Message.error(result.msg || t('settings.assistant.approveFailed', 'Failed to approve pairing'));
      }
    } catch (error: any) {
      Message.error(error.message);
    }
  };

  // Reject pairing
  const handleRejectPairing = async (code: string) => {
    try {
      const result = await channel.rejectPairing.invoke({ code });
      if (result.success) {
        Message.info(t('settings.assistant.pairingRejected', 'Pairing rejected'));
        await loadPendingPairings();
      } else {
        Message.error(result.msg || t('settings.assistant.rejectFailed', 'Failed to reject pairing'));
      }
    } catch (error: any) {
      Message.error(error.message);
    }
  };

  // Revoke user
  const handleRevokeUser = async (userId: string) => {
    try {
      const result = await channel.revokeUser.invoke({ userId });
      if (result.success) {
        Message.success(t('settings.assistant.userRevoked', 'User access revoked'));
        await loadAuthorizedUsers();
      } else {
        Message.error(result.msg || t('settings.assistant.revokeFailed', 'Failed to revoke user'));
      }
    } catch (error: any) {
      Message.error(error.message);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success(t('common.copySuccess', 'Copied'));
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Calculate remaining time
  const getRemainingTime = (expiresAt: number) => {
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000 / 60));
    return `${remaining} min`;
  };

  const hasExistingUsers = Boolean(pluginStatus?.enabled) && authorizedUsers.length > 0;
  const isTransportConnected = pluginStatus?.transportConnected ?? pluginStatus?.connected ?? false;
  const isRoutingHealthy = pluginStatus?.routingHealthy;
  const isConnectedHealthy = isTransportConnected && isRoutingHealthy !== false;
  const statusToneClass = pluginStatus?.error ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : isConnectedHealthy ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
  const statusBadgeClass = pluginStatus?.error ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : isConnectedHealthy ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
  const statusLabel = pluginStatus?.error ? t('settings.lark.statusError', 'Error') : !isTransportConnected ? t('settings.lark.statusConnecting', 'Connecting...') : isRoutingHealthy === false ? t('settings.channels.routingDegraded', 'Routing Degraded') : t('settings.lark.statusConnected', 'Connected');
  const isGeminiAgent = selectedAgent.backend === 'gemini';
  const agentOptions: ChannelAssistantOption[] = availableAgents.length > 0 ? availableAgents : [{ backend: 'gemini', name: 'Gemini CLI' }];
  const selectedAgentOption = agentOptions.find((option) => getChannelAssistantKey(option) === getChannelAssistantKey(selectedAgent)) ?? {
    backend: selectedAgent.backend,
    customAgentId: selectedAgent.customAgentId,
    name: getChannelAssistantLabel(availableAgents, selectedAgent),
  };

  return (
    <div className='flex flex-col gap-24px'>
      {/* App ID */}
      <PreferenceRow
        label={t('settings.lark.appId', 'App ID')}
        description={
          <span>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={LARK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(LARK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.lark.devConsoleLink', 'Feishu Developer Console')}
            </a>{' '}
            {t('settings.lark.appIdDescSuffix', 'to get your App ID')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip content={t('settings.assistant.tokenLocked', '请先关闭 Channel 并删除所有已授权用户后，再尝试修改')}>
            <span>
              <Input
                value={appId}
                onChange={(value) => {
                  setAppId(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, appId: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'cli_xxxxxxxxxx'}
                style={{ width: 240 }}
                status={touched.appId && !appId.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input
            value={appId}
            onChange={(value) => {
              setAppId(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, appId: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'cli_xxxxxxxxxx'}
            style={{ width: 240 }}
            status={touched.appId && !appId.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            disabled={hasExistingUsers}
          />
        )}
      </PreferenceRow>

      {/* App Secret */}
      <PreferenceRow
        label={t('settings.lark.appSecret', 'App Secret')}
        description={
          <span>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={LARK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(LARK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.lark.devConsoleLink', 'Feishu Developer Console')}
            </a>{' '}
            {t('settings.lark.appSecretDescSuffix', 'to get App Secret')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip content={t('settings.assistant.tokenLocked', '请先关闭 Channel 并删除所有已授权用户后，再尝试修改')}>
            <span>
              <Input.Password
                value={appSecret}
                onChange={(value) => {
                  setAppSecret(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, appSecret: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xxxxxxxxxxxxxxxxxx'}
                style={{ width: 240 }}
                status={touched.appSecret && !appSecret.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                visibilityToggle
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input.Password
            value={appSecret}
            onChange={(value) => {
              setAppSecret(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, appSecret: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xxxxxxxxxxxxxxxxxx'}
            style={{ width: 240 }}
            status={touched.appSecret && !appSecret.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            visibilityToggle
            disabled={hasExistingUsers}
          />
        )}
      </PreferenceRow>

      {/* Optional fields toggle */}
      <div className='flex items-center gap-4px text-12px text-t-tertiary cursor-pointer select-none' onClick={() => setShowOptional((prev) => !prev)}>
        <Down theme='outline' size={12} style={{ transform: showOptional ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        <span>{showOptional ? t('settings.lark.hideOptionalFields', 'Hide optional settings') : t('settings.lark.showOptionalFields', 'Show optional settings')}</span>
      </div>

      {showOptional && (
        <>
          {/* Encrypt Key (Optional) */}
          <PreferenceRow label={t('settings.lark.encryptKey', 'Encrypt Key')} description={t('settings.lark.encryptKeyDesc', 'Optional: For event encryption (from Event Subscription settings)')}>
            {hasExistingUsers ? (
              <Tooltip content={t('settings.assistant.tokenLocked', '请先关闭 Channel 并删除所有已授权用户后，再尝试修改')}>
                <span>
                  <Input.Password
                    value={encryptKey}
                    onChange={(value) => {
                      setEncryptKey(value);
                      handleCredentialsChange();
                    }}
                    placeholder={t('settings.lark.optional', 'Optional')}
                    style={{ width: 240 }}
                    visibilityToggle
                    disabled={hasExistingUsers}
                  />
                </span>
              </Tooltip>
            ) : (
              <Input.Password
                value={encryptKey}
                onChange={(value) => {
                  setEncryptKey(value);
                  handleCredentialsChange();
                }}
                placeholder={t('settings.lark.optional', 'Optional')}
                style={{ width: 240 }}
                visibilityToggle
                disabled={hasExistingUsers}
              />
            )}
          </PreferenceRow>

          {/* Verification Token (Optional) */}
          <PreferenceRow label={t('settings.lark.verificationToken', 'Verification Token')} description={t('settings.lark.verificationTokenDesc', 'Optional: For event verification (from Event Subscription settings)')}>
            {hasExistingUsers ? (
              <Tooltip content={t('settings.assistant.tokenLocked', '请先关闭 Channel 并删除所有已授权用户后，再尝试修改')}>
                <span>
                  <Input.Password
                    value={verificationToken}
                    onChange={(value) => {
                      setVerificationToken(value);
                      handleCredentialsChange();
                    }}
                    placeholder={t('settings.lark.optional', 'Optional')}
                    style={{ width: 240 }}
                    visibilityToggle
                    disabled={hasExistingUsers}
                  />
                </span>
              </Tooltip>
            ) : (
              <Input.Password
                value={verificationToken}
                onChange={(value) => {
                  setVerificationToken(value);
                  handleCredentialsChange();
                }}
                placeholder={t('settings.lark.optional', 'Optional')}
                style={{ width: 240 }}
                visibilityToggle
                disabled={hasExistingUsers}
              />
            )}
          </PreferenceRow>
        </>
      )}

      {/* Test Connection Button - only show when not connected or no existing users */}
      {!hasExistingUsers && !pluginStatus?.connected && (
        <div className='flex justify-end'>
          {pluginStatus?.hasToken && !appId.trim() && !appSecret.trim() ? (
            // Credentials already saved but not entered in UI - show info message
            <span className='text-12px text-t-tertiary mr-12px self-center'>{t('settings.lark.credentialsSaved', 'Credentials already configured. Enter new values to update.')}</span>
          ) : null}
          <Button type='primary' loading={testLoading} onClick={handleTestConnection} disabled={pluginStatus?.hasToken && !appId.trim() && !appSecret.trim()}>
            {t('settings.lark.testAndConnect', 'Test & Connect')}
          </Button>
        </div>
      )}

      {/* Agent Selection */}
      <div className='flex flex-col gap-8px'>
        <PreferenceRow label={t('settings.lark.agent', 'Agent')} description={t('settings.lark.agentDesc', 'Used for Lark conversations')}>
          <Dropdown
            trigger='click'
            position='br'
            droplist={
              <Menu selectedKeys={[getChannelAssistantKey(selectedAgent)]}>
                {agentOptions.map((a) => {
                  const key = getChannelAssistantKey(a);
                  return (
                    <Menu.Item
                      key={key}
                      onClick={() => {
                        const currentKey = selectedAgent.customAgentId ? `${selectedAgent.backend}|${selectedAgent.customAgentId}` : selectedAgent.backend;
                        if (key === currentKey) {
                          return;
                        }
                        const next = { backend: a.backend, customAgentId: a.customAgentId, name: a.name };
                        setSelectedAgent(next);
                        void persistSelectedAgent(next);
                      }}
                    >
                      <ChannelAssistantOptionContent
                        assistant={{
                          backend: a.backend,
                          name: a.name,
                          avatar: a.avatar,
                          presetAgentType: a.presetAgentType,
                        }}
                      />
                    </Menu.Item>
                  );
                })}
              </Menu>
            }
          >
            <Button type='secondary' className='min-w-160px flex items-center justify-between gap-8px'>
              <ChannelAssistantOptionContent
                assistant={{
                  backend: selectedAgentOption.backend,
                  name: selectedAgentOption.name,
                  avatar: selectedAgentOption.avatar,
                  presetAgentType: selectedAgentOption.presetAgentType,
                }}
                nameClassName='truncate'
              />
              <Down theme='outline' size={14} />
            </Button>
          </Dropdown>
        </PreferenceRow>
      </div>

      <PreferenceRow label={t('settings.channels.workspace', '工作目录')} description={t('settings.channels.workspaceDesc', '用于该 Channel 对话的默认工作目录；留空时会自动创建临时工作区。')}>
        <div className='flex items-center gap-8px flex-wrap' style={{ maxWidth: '100%', justifyContent: 'flex-end' }}>
          <WorkspaceSelectorPopover workspacePath={workspacePath} onSelectWorkspace={(nextWorkspacePath) => void persistWorkspace(nextWorkspacePath)} onPickWorkspace={() => void handleSelectWorkspace()}>
            {({ visible, workspaceLabel, workspaceTooltip }) => (
              <Tooltip content={workspaceTooltip} disabled={visible}>
                <Button type='secondary' className={`${guidStyles.workspaceShortcutButton} ${guidStyles.workspaceShortcutButtonCompact}`} aria-label={workspaceTooltip}>
                  {workspaceLabel}
                </Button>
              </Tooltip>
            )}
          </WorkspaceSelectorPopover>
          {workspacePath ? (
            <Button type='text' size='small' onClick={() => void persistWorkspace('')}>
              {t('common.clear', '清空')}
            </Button>
          ) : null}
        </div>
      </PreferenceRow>

      {/* Default Model Selection */}
      <PreferenceRow label={t('settings.assistant.defaultModel', '对话模型')} description={t('settings.lark.defaultModelDesc', '用于Agent对话时调用')}>
        <GeminiModelSelector selection={isGeminiAgent ? modelSelection : undefined} disabled={!isGeminiAgent} label={!isGeminiAgent ? t('settings.assistant.autoFollowCliModel', '自动跟随CLI运行时的模型') : undefined} variant='settings' />
      </PreferenceRow>

      {/* Connection Status - show when bot is enabled */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className={`rd-12px p-16px border ${pluginStatus?.connected ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : pluginStatus?.error ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'}`}>
          <SectionHeader title={t('settings.lark.connectionStatus', 'Connection Status')} action={<span className={`text-12px px-8px py-2px rd-4px ${pluginStatus?.connected ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : pluginStatus?.error ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'}`}>{pluginStatus?.connected ? t('settings.lark.statusConnected', 'Connected') : pluginStatus?.error ? t('settings.lark.statusError', 'Error') : t('settings.lark.statusConnecting', 'Connecting...')}</span>} />
          {pluginStatus?.error && <div className='text-14px text-red-600 dark:text-red-400 mb-12px'>{pluginStatus.error}</div>}
          {pluginStatus?.connected && (
            <div className='text-14px text-t-secondary space-y-8px'>
              <p className='m-0 font-500'>{t('settings.assistant.nextSteps', 'Next Steps')}:</p>
              <p className='m-0'>
                <strong>1.</strong> {t('settings.lark.step1', 'Open Feishu/Lark and find your bot application')}
              </p>
              <p className='m-0'>
                <strong>2.</strong> {t('settings.lark.step2', 'Send any message to initiate pairing')}
              </p>
              <p className='m-0'>
                <strong>3.</strong> {t('settings.lark.step3', 'A pairing request will appear below. Click "Approve" to authorize the user.')}
              </p>
              <p className='m-0'>
                <strong>4.</strong> {t('settings.lark.step4', 'Once approved, you can start chatting with the AI assistant through Lark!')}
              </p>
            </div>
          )}
          {!pluginStatus?.connected && !pluginStatus?.error && <div className='text-14px text-t-secondary'>{t('settings.lark.waitingConnection', 'WebSocket connection is being established. Please wait...')}</div>}
        </div>
      )}

      {/* Pending Pairings */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className='bg-fill-1 rd-12px pt-16px pr-16px pb-16px pl-0'>
          <SectionHeader
            title={t('settings.assistant.pendingPairings', 'Pending Pairing Requests')}
            action={
              <Button size='mini' type='text' icon={<Refresh size={14} />} loading={pairingLoading} onClick={loadPendingPairings}>
                {t('conversation.workspace.refresh', 'Refresh')}
              </Button>
            }
          />

          {pairingLoading ? (
            <div className='flex justify-center py-24px'>
              <Spin />
            </div>
          ) : pendingPairings.length === 0 ? (
            <Empty description={t('settings.assistant.noPendingPairings', 'No pending pairing requests')} />
          ) : (
            <div className='flex flex-col gap-12px'>
              {pendingPairings.map((pairing) => (
                <div key={pairing.code} className='flex items-center justify-between bg-fill-2 rd-8px p-12px'>
                  <div className='flex-1'>
                    <div className='flex items-center gap-8px'>
                      <span className='text-14px font-500 text-t-primary'>{pairing.displayName || 'Unknown User'}</span>
                      <Tooltip content={t('settings.assistant.copyCode', 'Copy pairing code')}>
                        <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={() => copyToClipboard(pairing.code)}>
                          <Copy size={14} />
                        </button>
                      </Tooltip>
                    </div>
                    <div className='text-12px text-t-tertiary mt-4px'>
                      {t('settings.assistant.pairingCode', 'Code')}: <code className='bg-fill-3 px-4px rd-2px'>{pairing.code}</code>
                      <span className='mx-8px'>|</span>
                      {t('settings.assistant.expiresIn', 'Expires in')}: {getRemainingTime(pairing.expiresAt)}
                    </div>
                  </div>
                  <div className='flex items-center gap-8px'>
                    <Button type='primary' size='small' icon={<CheckOne size={14} />} onClick={() => handleApprovePairing(pairing.code)}>
                      {t('settings.assistant.approve', 'Approve')}
                    </Button>
                    <Button type='secondary' size='small' status='danger' icon={<CloseOne size={14} />} onClick={() => handleRejectPairing(pairing.code)}>
                      {t('settings.assistant.reject', 'Reject')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Authorized Users */}
      {pluginStatus?.enabled && authorizedUsers.length > 0 && (
        <div className='bg-fill-1 rd-12px pt-16px pr-16px pb-16px pl-0'>
          <SectionHeader
            title={t('settings.assistant.authorizedUsers', 'Authorized Users')}
            action={
              <Button size='mini' type='text' icon={<Refresh size={14} />} loading={usersLoading} onClick={loadAuthorizedUsers}>
                {t('common.refresh', 'Refresh')}
              </Button>
            }
          />

          {usersLoading ? (
            <div className='flex justify-center py-24px'>
              <Spin />
            </div>
          ) : authorizedUsers.length === 0 ? (
            <Empty description={t('settings.assistant.noAuthorizedUsers', 'No authorized users yet')} />
          ) : (
            <div className='flex flex-col gap-12px'>
              {authorizedUsers.map((user) => (
                <div key={user.id} className='flex items-center justify-between bg-fill-2 rd-8px p-12px'>
                  <div className='flex-1'>
                    <div className='text-14px font-500 text-t-primary'>{user.displayName || 'Unknown User'}</div>
                    <div className='text-12px text-t-tertiary mt-4px'>
                      {t('settings.assistant.platform', 'Platform')}: {user.platformType}
                      <span className='mx-8px'>|</span>
                      {t('settings.assistant.authorizedAt', 'Authorized')}: {formatTime(user.authorizedAt)}
                    </div>
                  </div>
                  <Tooltip content={t('settings.assistant.revokeAccess', 'Revoke access')}>
                    <Button type='text' status='danger' size='small' icon={<Delete size={16} />} onClick={() => handleRevokeUser(user.id)} />
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LarkConfigForm;
