/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/channels/types';
import { channel, dialog } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import { WorkspaceSelectorPopover } from '@/renderer/pages/guid/components/WorkspaceShortcutSelector';
import guidStyles from '@/renderer/pages/guid/index.module.css';
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
  children: React.ReactNode;
}> = ({ label, description, extra, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='flex-1'>
      <div className='flex items-center gap-8px'>
        <span className='text-14px text-t-primary'>{label}</span>
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

interface TelegramConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GeminiModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
  onTokenChange?: (token: string) => void;
}

const TelegramConfigForm: React.FC<TelegramConfigFormProps> = ({ pluginStatus, modelSelection, onStatusChange, onTokenChange }) => {
  const { t, i18n } = useTranslation();

  const [telegramToken, setTelegramToken] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  // Agent selection (used for Telegram conversations)
  const [availableAgents, setAvailableAgents] = useState<ChannelAssistantOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<{ backend: AcpBackendAll; name?: string; customAgentId?: string }>({ backend: 'gemini' });
  const [workspacePath, setWorkspacePath] = useState('');

  const pluginId = pluginStatus?.id || 'telegram_default';
  const pluginAgentKey = `assistant.plugin.${pluginId}.agent` as const;
  const pluginWorkspaceKey = `assistant.plugin.${pluginId}.workspace` as const;
  const platformWorkspaceKey = 'assistant.telegram.workspace' as const;
  const isDefaultPluginInstance = pluginStatus ? pluginStatus.id === pluginStatus.type || pluginStatus.id.endsWith('_default') : true;

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const result = await channel.getPendingPairings.invoke({ pluginId, platformType: 'telegram' });
      if (result.success && result.data) {
        setPendingPairings(result.data);
      }
    } catch (error) {
      console.error('[ChannelSettings] Failed to load pending pairings:', error);
    } finally {
      setPairingLoading(false);
    }
  }, [pluginId]);

  // Load authorized users
  const loadAuthorizedUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await channel.getAuthorizedUsers.invoke({ pluginId, platformType: 'telegram' });
      if (result.success && result.data) {
        setAuthorizedUsers(result.data);
      }
    } catch (error) {
      console.error('[ChannelSettings] Failed to load authorized users:', error);
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
    setTelegramToken('');
    setSelectedAgent({ backend: 'gemini' });
    setWorkspacePath('');
    onTokenChange?.('');
  }, [onTokenChange, pluginId]);

  // Load available agents + saved selection
  const loadAgentsAndSelection = useCallback(async () => {
    try {
      const [assistantOptions, savedPluginAgent, savedPlatformAgent, savedPluginWorkspace, savedPlatformWorkspace] = await Promise.all([loadChannelAssistantOptions(i18n.language), ConfigStorage.get(pluginAgentKey as any), ConfigStorage.get('assistant.telegram.agent'), ConfigStorage.get(pluginWorkspaceKey as any), ConfigStorage.get(platformWorkspaceKey as any)]);

      setAvailableAgents(assistantOptions);

      const saved = savedPluginAgent ?? (isDefaultPluginInstance ? savedPlatformAgent : undefined);
      if (saved && typeof saved === 'object' && 'backend' in saved && typeof (saved as any).backend === 'string') {
        setSelectedAgent({
          backend: (saved as any).backend as AcpBackendAll,
          customAgentId: (saved as any).customAgentId,
          name: (saved as any).name,
        });
      } else if (typeof saved === 'string') {
        setSelectedAgent({ backend: saved as AcpBackendAll });
      }

      const savedWorkspace = savedPluginWorkspace ?? (isDefaultPluginInstance ? savedPlatformWorkspace : undefined);
      setWorkspacePath(typeof savedWorkspace === 'string' ? savedWorkspace : '');
    } catch (error) {
      console.error('[TelegramConfig] Failed to load channel settings:', error);
    }
  }, [i18n.language, isDefaultPluginInstance, platformWorkspaceKey, pluginAgentKey, pluginWorkspaceKey]);

  useEffect(() => {
    void loadAgentsAndSelection();
  }, [loadAgentsAndSelection]);

  const persistSelectedAgent = async (agent: { backend: AcpBackendAll; customAgentId?: string; name?: string }) => {
    try {
      await ConfigStorage.set(pluginAgentKey as any, agent);
      if (isDefaultPluginInstance) {
        await ConfigStorage.set('assistant.telegram.agent', agent);
      }
      await channel.syncChannelSettings.invoke({ platform: 'telegram', agent, pluginId, change: 'agent' }).catch((err) => console.warn('[TelegramConfig] syncChannelSettings failed:', err));
      Message.success(t('settings.assistant.agentSwitched', 'Agent switched successfully'));
    } catch (error) {
      console.error('[TelegramConfig] Failed to save agent:', error);
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
      await channel.syncChannelSettings.invoke({ platform: 'telegram', agent: selectedAgent, pluginId, change: 'workspace' }).catch((err) => console.warn('[TelegramConfig] syncChannelSettings failed:', err));
      Message.success(nextWorkspace ? t('settings.channels.workspaceSaved', '工作目录已保存') : t('settings.channels.workspaceCleared', '工作目录已清空'));
    } catch (error) {
      console.error('[TelegramConfig] Failed to save workspace:', error);
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
      console.error('[TelegramConfig] Failed to pick workspace:', error);
      Message.error(t('settings.channels.workspacePickFailed', '选择工作目录失败'));
    }
  };

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'telegram') return;
      if ((request.pluginId ?? 'telegram_default') !== pluginId) return;
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
      if (user.platformType !== 'telegram') return;
      if ((user.pluginId ?? 'telegram_default') !== pluginId) return;
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
      if (event.platformType !== 'telegram') return;
      if ((event.pluginId ?? 'telegram_default') !== pluginId) return;

      if (event.change === 'pairings') {
        void loadPendingPairings();
      }

      if (event.change === 'authorized-users') {
        void loadAuthorizedUsers();
      }

      if (event.change === 'agent' || event.change === 'workspace') {
        void loadAgentsAndSelection();
      }
    });
    return () => unsubscribe();
  }, [loadAgentsAndSelection, loadAuthorizedUsers, loadPendingPairings, pluginId]);

  // Test Telegram connection
  const handleTestConnection = async () => {
    if (!telegramToken.trim()) {
      Message.warning(t('settings.assistant.tokenRequired', 'Please enter a bot token'));
      return;
    }

    setTestLoading(true);
    try {
      const result = await channel.testPlugin.invoke({
        pluginId,
        token: telegramToken.trim(),
      });

      if (result.success && result.data?.success) {
        Message.success(t('settings.assistant.connectionSuccess', `Connected! Bot: @${result.data.botUsername || 'unknown'}`));

        // Auto-enable bot after successful test
        await handleAutoEnable();
      } else {
        Message.error(result.data?.error || t('settings.assistant.connectionFailed', 'Connection failed'));
      }
    } catch (error: any) {
      Message.error(error.message || t('settings.assistant.connectionFailed', 'Connection failed'));
    } finally {
      setTestLoading(false);
    }
  };

  // Auto-enable plugin after successful test
  const handleAutoEnable = async () => {
    try {
      const result = await channel.enablePlugin.invoke({
        pluginId,
        config: { token: telegramToken.trim() },
      });

      if (result.success) {
        Message.success(t('settings.assistant.pluginEnabled', 'Telegram bot enabled'));
        const statusResult = await channel.getPluginStatus.invoke();
        if (statusResult.success && statusResult.data) {
          const telegramPlugin = statusResult.data.find((p) => p.id === pluginId);
          onStatusChange(telegramPlugin || null);
        }
      }
    } catch (error: any) {
      console.error('[ChannelSettings] Auto-enable failed:', error);
    }
  };

  // Reset token tested state when token changes
  const handleTokenChange = (value: string) => {
    setTelegramToken(value);
    onTokenChange?.(value);
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
      <PreferenceRow label={t('settings.assistant.botToken', 'Bot Token')} description={t('settings.assistant.botTokenDesc', 'Open Telegram, find @BotFather and send /newbot to get your Bot Token.')}>
        <div className='flex items-center gap-8px'>
          {hasExistingUsers ? (
            <Tooltip content={t('settings.assistant.tokenLocked', '请先关闭 Channel 并删除所有已授权用户后，再尝试修改')}>
              <span>
                <Input.Password value={telegramToken} onChange={handleTokenChange} placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : '123456:ABC-DEF...'} style={{ width: 240 }} visibilityToggle disabled={hasExistingUsers} />
              </span>
            </Tooltip>
          ) : (
            <Input.Password value={telegramToken} onChange={handleTokenChange} placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : '123456:ABC-DEF...'} style={{ width: 240 }} visibilityToggle disabled={hasExistingUsers} />
          )}
          {hasExistingUsers ? (
            <Tooltip content={t('settings.assistant.tokenLocked', '请先关闭 Channel 并删除所有已授权用户后，再尝试修改')}>
              <span>
                <Button type='outline' loading={testLoading} onClick={handleTestConnection} disabled={hasExistingUsers}>
                  {t('settings.assistant.testConnection', 'Test')}
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button type='outline' loading={testLoading} onClick={handleTestConnection} disabled={hasExistingUsers}>
              {t('settings.assistant.testConnection', 'Test')}
            </Button>
          )}
        </div>
      </PreferenceRow>

      {/* Agent Selection */}
      <div className='flex flex-col gap-8px'>
        <PreferenceRow label={t('settings.agent', 'Agent')} description={t('settings.assistant.agentDescTelegram', 'Used for Telegram conversations')}>
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
        <div className='flex items-center gap-8px'>
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
      <PreferenceRow label={t('settings.assistant.defaultModel', '对话模型')} description={t('settings.assistant.defaultModelDesc', '用于Agent对话时调用')}>
        <GeminiModelSelector selection={isGeminiAgent ? modelSelection : undefined} disabled={!isGeminiAgent} label={!isGeminiAgent ? t('settings.assistant.autoFollowCliModel', '自动跟随CLI运行时的模型') : undefined} variant='settings' />
      </PreferenceRow>

      {/* Next Steps Guide - show when bot is enabled and no authorized users yet */}
      {pluginStatus?.enabled && pluginStatus?.connected && authorizedUsers.length === 0 && (
        <div className='bg-blue-50 dark:bg-blue-900/20 rd-12px p-16px border border-blue-200 dark:border-blue-800'>
          <SectionHeader title={t('settings.assistant.nextSteps', 'Next Steps')} />
          <div className='text-14px text-t-secondary space-y-8px'>
            <p className='m-0'>
              <strong>1.</strong> {t('settings.assistant.step1', 'Open Telegram and search for your bot')}
              {pluginStatus.botUsername && (
                <span className='ml-4px'>
                  <code className='bg-fill-2 px-6px py-2px rd-4px'>@{pluginStatus.botUsername}</code>
                </span>
              )}
            </p>
            <p className='m-0'>
              <strong>2.</strong> {t('settings.assistant.step2', 'Send any message or click /start to initiate pairing')}
            </p>
            <p className='m-0'>
              <strong>3.</strong> {t('settings.assistant.step3', 'A pairing request will appear below. Click "Approve" to authorize the user.')}
            </p>
            <p className='m-0'>
              <strong>4.</strong> {t('settings.assistant.step4', 'Once approved, you can start chatting with Gemini through Telegram!')}
            </p>
          </div>
        </div>
      )}

      {/* Pending Pairings - show when bot is enabled and no authorized users yet */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className='bg-fill-1 rd-12px pt-16px pr-16px pb-16px pl-0'>
          <SectionHeader
            title={t('settings.assistant.pendingPairings', 'Pending Pairing Requests')}
            action={
              <Button size='mini' type='text' icon={<Refresh size={14} />} loading={pairingLoading} onClick={loadPendingPairings}>
                {t('common.refresh', 'Refresh')}
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

      {/* Authorized Users - show when there are authorized users */}
      {authorizedUsers.length > 0 && (
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

export default TelegramConfigForm;
