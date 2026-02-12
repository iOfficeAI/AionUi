/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/channels/types';
import { acpConversation, channel, shell } from '@/common/ipcBridge';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';
import type { AcpBackendAll } from '@/types/acpTypes';
import { Button, Dropdown, Empty, Input, Menu, Message, Spin, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, Delete, Down, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  modelList: IProvider[];
  selectedModel: TProviderWithModel | null;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
  onModelChange: (model: TProviderWithModel | null) => void;
}

const LARK_DEV_DOCS_URL = 'https://open.feishu.cn/document/develop-an-echo-bot/introduction';

const LarkConfigForm: React.FC<LarkConfigFormProps> = ({ pluginStatus, modelList, selectedModel, onStatusChange, onModelChange }) => {
  const { t } = useTranslation();

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
  const [availableAgents, setAvailableAgents] = useState<Array<{ backend: AcpBackendAll; name: string; customAgentId?: string; isPreset?: boolean }>>([]);
  const [selectedAgent, setSelectedAgent] = useState<{ backend: AcpBackendAll; name?: string; customAgentId?: string }>({ backend: 'gemini' });

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const result = await channel.getPendingPairings.invoke();
      if (result.success && result.data) {
        // Filter for Lark platform only
        setPendingPairings(result.data.filter((p) => p.platformType === 'lark'));
      }
    } catch (error) {
      console.error('[LarkConfig] Failed to load pending pairings:', error);
    } finally {
      setPairingLoading(false);
    }
  }, []);

  // Load authorized users
  const loadAuthorizedUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await channel.getAuthorizedUsers.invoke();
      if (result.success && result.data) {
        // Filter for Lark platform only
        setAuthorizedUsers(result.data.filter((u) => u.platformType === 'lark'));
      }
    } catch (error) {
      console.error('[LarkConfig] Failed to load authorized users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadPendingPairings();
    void loadAuthorizedUsers();
  }, [loadPendingPairings, loadAuthorizedUsers]);

  // Load available agents + saved selection
  useEffect(() => {
    const loadAgentsAndSelection = async () => {
      try {
        const [agentsResp, saved] = await Promise.all([acpConversation.getAvailableAgents.invoke(), ConfigStorage.get('assistant.lark.agent')]);

        if (agentsResp.success && agentsResp.data) {
          const list = agentsResp.data.filter((a) => !a.isPreset).map((a) => ({ backend: a.backend, name: a.name, customAgentId: a.customAgentId, isPreset: a.isPreset }));
          setAvailableAgents(list);
        }

        if (saved && typeof saved === 'object' && 'backend' in saved && typeof (saved as any).backend === 'string') {
          setSelectedAgent({
            backend: (saved as any).backend as AcpBackendAll,
            customAgentId: (saved as any).customAgentId,
            name: (saved as any).name,
          });
        } else if (typeof saved === 'string') {
          setSelectedAgent({ backend: saved as AcpBackendAll });
        }
      } catch (error) {
        console.error('[LarkConfig] Failed to load agents:', error);
      }
    };

    void loadAgentsAndSelection();
  }, []);

  const persistSelectedAgent = async (agent: { backend: AcpBackendAll; customAgentId?: string; name?: string }) => {
    try {
      await ConfigStorage.set('assistant.lark.agent', agent);
      Message.success(t('settings.assistant.agentSwitched', "Agent switched. Please delete the Channel's historical conversations before continuing to use, new conversations will use the new configuration. (Next version will support automatic hot update)"));
    } catch (error) {
      console.error('[LarkConfig] Failed to save agent:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'lark') return;
      setPendingPairings((prev) => {
        const exists = prev.some((p) => p.code === request.code);
        if (exists) return prev;
        return [request, ...prev];
      });
    });
    return () => unsubscribe();
  }, []);

  // Listen for user authorization
  useEffect(() => {
    const unsubscribe = channel.userAuthorized.on((user) => {
      if (user.platformType !== 'lark') return;
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
      setPendingPairings((prev) => prev.filter((p) => p.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, []);

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
        pluginId: 'lark_default',
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
      console.log('[LarkConfig] Auto-enabling plugin with credentials...');
      const result = await channel.enablePlugin.invoke({
        pluginId: 'lark_default',
        config: {
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          encryptKey: encryptKey.trim() || undefined,
          verificationToken: verificationToken.trim() || undefined,
        },
      });

      console.log('[LarkConfig] enablePlugin result:', result);

      if (result.success) {
        Message.success(t('settings.lark.pluginEnabled', 'Lark bot enabled'));
        const statusResult = await channel.getPluginStatus.invoke();
        console.log('[LarkConfig] getPluginStatus result:', statusResult);
        if (statusResult.success && statusResult.data) {
          const larkPlugin = statusResult.data.find((p) => p.type === 'lark');
          console.log('[LarkConfig] Lark plugin status:', larkPlugin);
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

  // Save model selection
  const handleModelSelect = async (provider: IProvider, modelName: string) => {
    const newModel: TProviderWithModel = { ...provider, useModel: modelName };
    onModelChange(newModel);
    try {
      await ConfigStorage.set('assistant.lark.defaultModel', {
        id: provider.id,
        useModel: modelName,
      });
      Message.success(t('settings.assistant.modelSwitched', "Model switched. Please delete the Channel's historical conversations before continuing to use, new conversations will use the new configuration. (Next version will support automatic hot update)"));
    } catch (error) {
      console.error('[LarkConfig] Failed to save model:', error);
      Message.error(t('settings.assistant.modelSaveFailed', 'Failed to save model'));
    }
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
    Message.success(t('common.copied', 'Copied to clipboard'));
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

  const hasExistingUsers = authorizedUsers.length > 0;
  const isGeminiAgent = selectedAgent.backend === 'gemini';
  const agentOptions: Array<{ backend: AcpBackendAll; name: string; customAgentId?: string }> = availableAgents.length > 0 ? availableAgents : [{ backend: 'gemini', name: 'Gemini CLI' }];

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
                shell.openExternal.invoke(LARK_DEV_DOCS_URL).catch(console.error);
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
                shell.openExternal.invoke(LARK_DEV_DOCS_URL).catch(console.error);
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
              <Menu selectedKeys={[selectedAgent.customAgentId ? `${selectedAgent.backend}|${selectedAgent.customAgentId}` : selectedAgent.backend]}>
                {agentOptions.map((a) => {
                  const key = a.customAgentId ? `${a.backend}|${a.customAgentId}` : a.backend;
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
                      {a.name}
                    </Menu.Item>
                  );
                })}
              </Menu>
            }
          >
            <Button type='secondary' className='min-w-160px flex items-center justify-between gap-8px'>
              <span className='truncate'>{selectedAgent.name || availableAgents.find((a) => (a.customAgentId ? `${a.backend}|${a.customAgentId}` : a.backend) === (selectedAgent.customAgentId ? `${selectedAgent.backend}|${selectedAgent.customAgentId}` : selectedAgent.backend))?.name || selectedAgent.backend}</span>
              <Down theme='outline' size={14} />
            </Button>
          </Dropdown>
        </PreferenceRow>
      </div>

      {/* Default Model Selection */}
      <PreferenceRow label={t('settings.assistant.defaultModel', '对话模型')} description={t('settings.lark.defaultModelDesc', '用于Agent对话时调用')}>
        {isGeminiAgent ? (
          <Dropdown
            trigger='click'
            position='br'
            droplist={
              <Menu selectedKeys={selectedModel ? [selectedModel.id + selectedModel.useModel] : []}>
                {!modelList || modelList.length === 0 ? (
                  <Menu.Item key='no-models' className='px-12px py-12px text-t-secondary text-14px text-center' disabled>
                    {t('settings.assistant.noAvailableModels', 'No Gemini models configured')}
                  </Menu.Item>
                ) : (
                  modelList.map((provider) => {
                    const availableModels = getAvailableModels(provider);
                    if (availableModels.length === 0) return null;
                    return (
                      <Menu.ItemGroup title={provider.name} key={provider.id}>
                        {availableModels.map((modelName) => (
                          <Menu.Item
                            key={provider.id + modelName}
                            className={selectedModel?.id + selectedModel?.useModel === provider.id + modelName ? '!bg-fill-2' : ''}
                            onClick={() => {
                              handleModelSelect(provider, modelName).catch((error) => {
                                console.error('Failed to select model:', error);
                              });
                            }}
                          >
                            {modelName}
                          </Menu.Item>
                        ))}
                      </Menu.ItemGroup>
                    );
                  })
                )}
              </Menu>
            }
          >
            <Button type='secondary' className='min-w-160px flex items-center justify-between gap-8px'>
              <span className='truncate'>{selectedModel?.useModel || t('settings.assistant.selectModel', 'Select Model')}</span>
              <Down theme='outline' size={14} />
            </Button>
          </Dropdown>
        ) : (
          <div className='text-14px text-t-secondary min-w-160px'>{t('settings.assistant.autoFollowCliModel', '自动跟随CLI运行时的模型')}</div>
        )}
      </PreferenceRow>

      {/* Connection Status - show when bot is enabled */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className={`rd-12px p-16px border ${pluginStatus?.connected ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : pluginStatus?.error ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'}`}>
          <SectionHeader title={t('settings.lark.connectionStatus', 'Connection Status')} action={<span className={`text-12px px-8px py-2px rd-4px ${pluginStatus?.connected ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : pluginStatus?.error ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'}`}>{pluginStatus?.connected ? t('settings.lark.statusConnected', '✅ Connected') : pluginStatus?.error ? t('settings.lark.statusError', '❌ Error') : t('settings.lark.statusConnecting', '⏳ Connecting...')}</span>} />
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

      {/* Authorized Users */}
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

export default LarkConfigForm;
