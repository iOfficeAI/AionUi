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

interface DingTalkConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GeminiModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
  onDraftConfigChange?: (draft: { clientId?: string; clientSecret?: string }) => void;
}

type ChannelChatMode = 'single' | 'group';

const DINGTALK_DEV_DOCS_URL = 'https://github.com/iOfficeAI/AionUi/wiki/DingTalk-Bot-Setup-Guide';

const DingTalkConfigForm: React.FC<DingTalkConfigFormProps> = ({ pluginStatus, modelSelection, onStatusChange, onDraftConfigChange }) => {
  const { t, i18n } = useTranslation();

  // DingTalk credentials
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const [testLoading, setTestLoading] = useState(false);
  const [_credentialsTested, setCredentialsTested] = useState(false);
  const [touched, setTouched] = useState({ clientId: false, clientSecret: false });
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  // Agent selection
  const [availableAgents, setAvailableAgents] = useState<ChannelAssistantOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<{ backend: AcpBackendAll; name?: string; customAgentId?: string }>({ backend: 'gemini' });
  const [workspacePath, setWorkspacePath] = useState('');

  const pluginId = pluginStatus?.id || 'dingtalk_default';
  const pluginAgentKey = `assistant.plugin.${pluginId}.agent` as any;
  const pluginChatModeKey = `assistant.plugin.${pluginId}.chatMode` as any;
  const pluginWorkspaceKey = `assistant.plugin.${pluginId}.workspace` as const;
  const platformWorkspaceKey = 'assistant.dingtalk.workspace' as const;
  const isDefaultPluginInstance = pluginStatus ? pluginStatus.id === pluginStatus.type || pluginStatus.id.endsWith('_default') : true;

  // Chat mode: single (compat) | group (@mention routing)
  const [chatMode, setChatMode] = useState<ChannelChatMode>('single');

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const result = await channel.getPendingPairings.invoke({ pluginId, platformType: 'dingtalk' });
      if (result.success && result.data) {
        setPendingPairings(result.data);
      }
    } catch (error) {
      console.error('[DingTalkConfig] Failed to load pending pairings:', error);
    } finally {
      setPairingLoading(false);
    }
  }, [pluginId]);

  // Load authorized users
  const loadAuthorizedUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await channel.getAuthorizedUsers.invoke({ pluginId, platformType: 'dingtalk' });
      if (result.success && result.data) {
        setAuthorizedUsers(result.data);
      }
    } catch (error) {
      console.error('[DingTalkConfig] Failed to load authorized users:', error);
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
    setClientId('');
    setClientSecret('');
    setCredentialsTested(false);
    setTouched({ clientId: false, clientSecret: false });
    setSelectedAgent({ backend: 'gemini' });
    setWorkspacePath('');
    setChatMode('single');
    onDraftConfigChange?.({});
  }, [onDraftConfigChange, pluginId]);

  useEffect(() => {
    onDraftConfigChange?.({
      clientId,
      clientSecret,
    });
  }, [clientId, clientSecret, onDraftConfigChange]);

  // Load available agents + saved selection
  const loadAgentsAndSelection = useCallback(async () => {
    try {
      const [assistantOptions, savedScopedAgent, savedScopedChatMode, savedLegacyAgent, savedLegacyChatMode, savedScopedWorkspace, savedLegacyWorkspace] = await Promise.all([loadChannelAssistantOptions(i18n.language), ConfigStorage.get(pluginAgentKey), ConfigStorage.get(pluginChatModeKey), ConfigStorage.get('assistant.dingtalk.agent'), ConfigStorage.get('assistant.dingtalk.chatMode'), ConfigStorage.get(pluginWorkspaceKey as any), ConfigStorage.get(platformWorkspaceKey as any)]);

      setAvailableAgents(assistantOptions);

      const savedAgentRaw = savedScopedAgent ?? (isDefaultPluginInstance ? savedLegacyAgent : undefined);
      const savedChatModeRaw = savedScopedChatMode ?? (isDefaultPluginInstance ? savedLegacyChatMode : undefined);
      const savedWorkspaceRaw = savedScopedWorkspace ?? (isDefaultPluginInstance ? savedLegacyWorkspace : undefined);

      if (savedAgentRaw && typeof savedAgentRaw === 'object' && 'backend' in savedAgentRaw && typeof (savedAgentRaw as any).backend === 'string') {
        setSelectedAgent({
          backend: (savedAgentRaw as any).backend as AcpBackendAll,
          customAgentId: (savedAgentRaw as any).customAgentId,
          name: (savedAgentRaw as any).name,
        });
      } else if (typeof savedAgentRaw === 'string') {
        setSelectedAgent({ backend: savedAgentRaw as AcpBackendAll });
      }

      if (savedChatModeRaw === 'group' || savedChatModeRaw === 'single') {
        setChatMode(savedChatModeRaw);
      }

      setWorkspacePath(typeof savedWorkspaceRaw === 'string' ? savedWorkspaceRaw : '');
    } catch (error) {
      console.error('[DingTalkConfig] Failed to load channel settings:', error);
    }
  }, [i18n.language, isDefaultPluginInstance, platformWorkspaceKey, pluginAgentKey, pluginChatModeKey, pluginWorkspaceKey]);

  useEffect(() => {
    void loadAgentsAndSelection();
  }, [loadAgentsAndSelection]);

  const persistSelectedAgent = async (agent: { backend: AcpBackendAll; customAgentId?: string; name?: string }) => {
    try {
      await ConfigStorage.set(pluginAgentKey, agent);
      if (isDefaultPluginInstance) {
        await ConfigStorage.set('assistant.dingtalk.agent', agent);
      }
      await channel.syncChannelSettings.invoke({ platform: 'dingtalk', agent, pluginId, change: 'agent' }).catch((err) => console.warn('[DingTalkConfig] syncChannelSettings failed:', err));
      Message.success(t('settings.assistant.agentSwitched', 'Agent switched successfully'));
    } catch (error) {
      console.error('[DingTalkConfig] Failed to save agent:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  const persistChatMode = async (nextMode: ChannelChatMode) => {
    try {
      await ConfigStorage.set(pluginChatModeKey, nextMode);
      if (isDefaultPluginInstance) {
        await ConfigStorage.set('assistant.dingtalk.chatMode', nextMode);
      }
      await channel.syncChannelSettings.invoke({ platform: 'dingtalk', agent: selectedAgent, pluginId, change: 'chatMode' }).catch((err) => console.warn('[DingTalkConfig] syncChannelSettings failed:', err));
      setChatMode(nextMode);
      Message.success(nextMode === 'group' ? t('settings.channels.groupModeEnabled', { defaultValue: '群聊模式已开启，可使用 @AgentName 路由到多助手。' }) : t('settings.channels.groupModeDisabled', { defaultValue: '已切换为单聊模式，保持原有行为。' }));
    } catch (error) {
      console.error('[DingTalkConfig] Failed to save chat mode:', error);
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
      await channel.syncChannelSettings.invoke({ platform: 'dingtalk', agent: selectedAgent, pluginId, change: 'workspace' }).catch((err) => console.warn('[DingTalkConfig] syncChannelSettings failed:', err));
      Message.success(nextWorkspace ? t('settings.channels.workspaceSaved', '工作目录已保存') : t('settings.channels.workspaceCleared', '工作目录已清空'));
    } catch (error) {
      console.error('[DingTalkConfig] Failed to save workspace:', error);
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
      console.error('[DingTalkConfig] Failed to pick workspace:', error);
      Message.error(t('settings.channels.workspacePickFailed', '选择工作目录失败'));
    }
  };

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'dingtalk') return;
      if ((request.pluginId ?? 'dingtalk_default') !== pluginId) return;
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
      if (user.platformType !== 'dingtalk') return;
      if ((user.pluginId ?? 'dingtalk_default') !== pluginId) return;
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
      if (event.platformType !== 'dingtalk') return;
      if ((event.pluginId ?? 'dingtalk_default') !== pluginId) return;

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

  // Test DingTalk connection
  const handleTestConnection = async () => {
    setTouched({ clientId: true, clientSecret: true });

    if (!clientId.trim() || !clientSecret.trim()) {
      Message.warning(t('settings.dingtalk.credentialsRequired', 'Please enter Client ID and Client Secret'));
      return;
    }

    setTestLoading(true);
    setCredentialsTested(false);
    try {
      const result = await channel.testPlugin.invoke({
        pluginId,
        token: '',
        extraConfig: {
          appId: clientId.trim(),
          appSecret: clientSecret.trim(),
        },
      });

      if (result.success && result.data?.success) {
        setCredentialsTested(true);
        Message.success(t('settings.dingtalk.connectionSuccess', 'Connected to DingTalk API!'));
        await handleAutoEnable();
      } else {
        setCredentialsTested(false);
        Message.error(result.data?.error || t('settings.dingtalk.connectionFailed', 'Connection failed'));
      }
    } catch (error: any) {
      setCredentialsTested(false);
      Message.error(error.message || t('settings.dingtalk.connectionFailed', 'Connection failed'));
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
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        },
      });

      if (result.success) {
        Message.success(t('settings.dingtalk.pluginEnabled', 'DingTalk bot enabled'));
        const statusResult = await channel.getPluginStatus.invoke();
        if (statusResult.success && statusResult.data) {
          const dingtalkPlugin = statusResult.data.find((p) => p.id === pluginId);
          onStatusChange(dingtalkPlugin || null);
        }
      } else {
        console.error('[DingTalkConfig] enablePlugin failed:', result.msg);
        Message.error(result.msg || t('settings.dingtalk.enableFailed', 'Failed to enable DingTalk plugin'));
      }
    } catch (error: any) {
      console.error('[DingTalkConfig] Auto-enable failed:', error);
      Message.error(error.message || t('settings.dingtalk.enableFailed', 'Failed to enable DingTalk plugin'));
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
  const isGeminiAgent = selectedAgent.backend === 'gemini';
  const agentOptions: ChannelAssistantOption[] = availableAgents.length > 0 ? availableAgents : [{ backend: 'gemini', name: 'Gemini CLI' }];
  const selectedAgentOption = agentOptions.find((option) => getChannelAssistantKey(option) === getChannelAssistantKey(selectedAgent)) ?? {
    backend: selectedAgent.backend,
    customAgentId: selectedAgent.customAgentId,
    name: getChannelAssistantLabel(availableAgents, selectedAgent),
  };

  return (
    <div className='flex flex-col gap-24px'>
      {/* Client ID */}
      <PreferenceRow
        label={t('settings.dingtalk.clientId', 'Client ID')}
        description={
          <span>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={DINGTALK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(DINGTALK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.dingtalk.devConsoleLink', 'DingTalk Open Platform')}
            </a>{' '}
            {t('settings.dingtalk.clientIdDescSuffix', 'to get your Client ID')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip content={t('settings.assistant.tokenLocked', 'Please close the Channel and delete all authorized users before modifying')}>
            <span>
              <Input
                value={clientId}
                onChange={(value) => {
                  setClientId(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, clientId: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'dingxxxxxxxxxx'}
                style={{ width: 240 }}
                status={touched.clientId && !clientId.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input
            value={clientId}
            onChange={(value) => {
              setClientId(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, clientId: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'dingxxxxxxxxxx'}
            style={{ width: 240 }}
            status={touched.clientId && !clientId.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            disabled={hasExistingUsers}
          />
        )}
      </PreferenceRow>

      {/* Client Secret */}
      <PreferenceRow
        label={t('settings.dingtalk.clientSecret', 'Client Secret')}
        description={
          <span>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={DINGTALK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(DINGTALK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.dingtalk.devConsoleLink', 'DingTalk Open Platform')}
            </a>{' '}
            {t('settings.dingtalk.clientSecretDescSuffix', 'to get Client Secret')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip content={t('settings.assistant.tokenLocked', 'Please close the Channel and delete all authorized users before modifying')}>
            <span>
              <Input.Password
                value={clientSecret}
                onChange={(value) => {
                  setClientSecret(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, clientSecret: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xxxxxxxxxxxxxxxxxx'}
                style={{ width: 240 }}
                status={touched.clientSecret && !clientSecret.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                visibilityToggle
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input.Password
            value={clientSecret}
            onChange={(value) => {
              setClientSecret(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, clientSecret: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xxxxxxxxxxxxxxxxxx'}
            style={{ width: 240 }}
            status={touched.clientSecret && !clientSecret.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            visibilityToggle
            disabled={hasExistingUsers}
          />
        )}
      </PreferenceRow>

      {/* Test Connection Button */}
      {!hasExistingUsers && !pluginStatus?.connected && (
        <div className='flex justify-end'>
          {pluginStatus?.hasToken && !clientId.trim() && !clientSecret.trim() ? <span className='text-12px text-t-tertiary mr-12px self-center'>{t('settings.dingtalk.credentialsSaved', 'Credentials already configured. Enter new values to update.')}</span> : null}
          <Button type='primary' loading={testLoading} onClick={handleTestConnection} disabled={pluginStatus?.hasToken && !clientId.trim() && !clientSecret.trim()}>
            {t('settings.dingtalk.testAndConnect', 'Test & Connect')}
          </Button>
        </div>
      )}

      {/* Agent Selection */}
      <div className='flex flex-col gap-8px'>
        <PreferenceRow label={t('settings.dingtalk.agent', 'Agent')} description={t('settings.dingtalk.agentDesc', 'Used for DingTalk conversations')}>
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
                        const currentKey = getChannelAssistantKey(selectedAgent);
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
      <PreferenceRow label={t('settings.assistant.defaultModel', 'Model')} description={t('settings.dingtalk.defaultModelDesc', 'Used for Agent conversations')}>
        <GeminiModelSelector selection={isGeminiAgent ? modelSelection : undefined} disabled={!isGeminiAgent} label={!isGeminiAgent ? t('settings.assistant.autoFollowCliModel', 'Auto-follow CLI runtime model') : undefined} variant='settings' />
      </PreferenceRow>

      {/* Connection Status */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className={`rd-12px p-16px border ${pluginStatus?.connected ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : pluginStatus?.error ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'}`}>
          <SectionHeader title={t('settings.dingtalk.connectionStatus', 'Connection Status')} action={<span className={`text-12px px-8px py-2px rd-4px ${pluginStatus?.connected ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : pluginStatus?.error ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'}`}>{pluginStatus?.connected ? t('settings.dingtalk.statusConnected', 'Connected') : pluginStatus?.error ? t('settings.dingtalk.statusError', 'Error') : t('settings.dingtalk.statusConnecting', 'Connecting...')}</span>} />
          {pluginStatus?.error && <div className='text-14px text-red-600 dark:text-red-400 mb-12px'>{pluginStatus.error}</div>}
          {pluginStatus?.connected && (
            <div className='text-14px text-t-secondary space-y-8px'>
              <p className='m-0 font-500'>{t('settings.assistant.nextSteps', 'Next Steps')}:</p>
              <p className='m-0'>
                <strong>1.</strong> {t('settings.dingtalk.step1', 'Open DingTalk and find your bot application')}
              </p>
              <p className='m-0'>
                <strong>2.</strong> {t('settings.dingtalk.step2', 'Send any message to initiate pairing')}
              </p>
              <p className='m-0'>
                <strong>3.</strong> {t('settings.dingtalk.step3', 'A pairing request will appear below. Click "Approve" to authorize the user.')}
              </p>
              <p className='m-0'>
                <strong>4.</strong> {t('settings.dingtalk.step4', 'Once approved, you can start chatting with the AI assistant through DingTalk!')}
              </p>
            </div>
          )}
          {!pluginStatus?.connected && !pluginStatus?.error && <div className='text-14px text-t-secondary'>{t('settings.dingtalk.waitingConnection', 'Connection is being established. Please wait...')}</div>}
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

export default DingTalkConfigForm;
