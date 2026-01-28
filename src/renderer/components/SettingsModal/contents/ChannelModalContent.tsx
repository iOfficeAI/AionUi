/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/channels/types';
import { ipcBridge } from '@/common';
import { channel } from '@/common/ipcBridge';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useGeminiGoogleAuthModels } from '@/renderer/hooks/useGeminiGoogleAuthModels';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';
import { Button, Dropdown, Empty, Input, Menu, Message, Spin, Switch, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, Delete, Down, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { useSettingsViewMode } from '../settingsViewContext';

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

/**
 * Status badge component
 */
const StatusBadge: React.FC<{ status: 'running' | 'stopped' | 'error' | string; text?: string }> = ({ status, text }) => {
  const colors = {
    running: 'bg-green-500/20 text-green-600',
    stopped: 'bg-gray-500/20 text-gray-500',
    error: 'bg-red-500/20 text-red-600',
  };

  const defaultTexts = {
    running: 'Running',
    stopped: 'Stopped',
    error: 'Error',
  };

  return <span className={`px-8px py-2px rd-4px text-12px ${colors[status as keyof typeof colors] || colors.stopped}`}>{text || defaultTexts[status as keyof typeof defaultTexts] || status}</span>;
};

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
  const [telegramToken, setTelegramToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [enableLoading, setEnableLoading] = useState(false);
  const [tokenTested, setTokenTested] = useState(false);
  const [testedBotUsername, setTestedBotUsername] = useState<string | null>(null);

  // Pairing state
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [pairingLoading, setPairingLoading] = useState(false);

  // Users state
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

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

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const result = await channel.getPendingPairings.invoke();
      if (result.success && result.data) {
        setPendingPairings(result.data);
      }
    } catch (error) {
      console.error('[ChannelSettings] Failed to load pending pairings:', error);
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
        setAuthorizedUsers(result.data);
      }
    } catch (error) {
      console.error('[ChannelSettings] Failed to load authorized users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadPluginStatus();
    void loadPendingPairings();
    void loadAuthorizedUsers();
  }, [loadPluginStatus, loadPendingPairings, loadAuthorizedUsers]);

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

  // Save model selection
  const handleModelSelect = async (provider: IProvider, modelName: string) => {
    const newModel: TProviderWithModel = { ...provider, useModel: modelName };
    setSelectedModel(newModel);
    try {
      await ConfigStorage.set('assistant.telegram.defaultModel', {
        id: provider.id,
        useModel: modelName,
      });
      Message.success(t('settings.assistant.modelSaved', 'Model saved'));
    } catch (error) {
      console.error('[ChannelSettings] Failed to save model:', error);
      Message.error(t('settings.assistant.modelSaveFailed', 'Failed to save model'));
    }
  };

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      setPendingPairings((prev) => {
        const exists = prev.some((p) => p.code === request.code);
        if (exists) return prev;
        return [request, ...prev];
      });
    });
    return () => unsubscribe();
  }, []);

  // Listen for plugin status changes
  useEffect(() => {
    const unsubscribe = channel.pluginStatusChanged.on(({ status }) => {
      if (status.type === 'telegram') {
        setPluginStatus(status);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen for user authorization
  useEffect(() => {
    const unsubscribe = channel.userAuthorized.on((user) => {
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
      // Remove from pending pairings
      setPendingPairings((prev) => prev.filter((p) => p.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, []);

  // Test Telegram connection
  const handleTestConnection = async () => {
    if (!telegramToken.trim()) {
      Message.warning(t('settings.assistant.tokenRequired', 'Please enter a bot token'));
      return;
    }

    setTestLoading(true);
    setTokenTested(false);
    setTestedBotUsername(null);
    try {
      const result = await channel.testPlugin.invoke({
        pluginId: 'telegram_default',
        token: telegramToken.trim(),
      });

      if (result.success && result.data?.success) {
        setTokenTested(true);
        setTestedBotUsername(result.data.botUsername || null);
        Message.success(t('settings.assistant.connectionSuccess', `Connected! Bot: @${result.data.botUsername || 'unknown'}`));

        // Auto-enable bot after successful test
        await handleAutoEnable();
      } else {
        setTokenTested(false);
        Message.error(result.data?.error || t('settings.assistant.connectionFailed', 'Connection failed'));
      }
    } catch (error: any) {
      setTokenTested(false);
      Message.error(error.message || t('settings.assistant.connectionFailed', 'Connection failed'));
    } finally {
      setTestLoading(false);
    }
  };

  // Auto-enable plugin after successful test
  const handleAutoEnable = async () => {
    try {
      const result = await channel.enablePlugin.invoke({
        pluginId: 'telegram_default',
        config: { token: telegramToken.trim() },
      });

      if (result.success) {
        Message.success(t('settings.assistant.pluginEnabled', 'Telegram bot enabled'));
        await loadPluginStatus();
      }
    } catch (error: any) {
      console.error('[ChannelSettings] Auto-enable failed:', error);
    }
  };

  // Reset token tested state when token changes
  const handleTokenChange = (value: string) => {
    setTelegramToken(value);
    setTokenTested(false);
    setTestedBotUsername(null);
  };

  // Enable/Disable plugin
  const handleTogglePlugin = async (enabled: boolean) => {
    setEnableLoading(true);
    try {
      if (enabled) {
        // Check if we have a token - either entered in the UI or already saved in database
        const hasToken = telegramToken.trim() || pluginStatus?.hasToken;
        if (!hasToken) {
          Message.warning(t('settings.assistant.tokenRequired', 'Please enter a bot token first'));
          setEnableLoading(false);
          return;
        }

        // Only pass token if user entered a new one, otherwise use existing from database
        const config = telegramToken.trim() ? { token: telegramToken.trim() } : {};

        const result = await channel.enablePlugin.invoke({
          pluginId: 'telegram_default',
          config,
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

  return (
    <AionScrollArea className={isPageMode ? 'h-full' : ''}>
      <div className='flex flex-col gap-24px'>
        {/* Telegram Configuration */}
        <div className='bg-fill-1 rd-12px p-16px'>
          <SectionHeader
            title={t('settings.assistant.telegramConfig', 'Telegram Bot Configuration')}
            action={
              <Button size='mini' type='text' icon={<Refresh size={14} />} loading={loading} onClick={loadPluginStatus}>
                {t('common.refresh', 'Refresh')}
              </Button>
            }
          />

          <PreferenceRow
            label={t('settings.assistant.botToken', 'Bot Token')}
            description={
              authorizedUsers.length > 0 ? (
                <span className='text-t-tertiary'>
                  {t('settings.assistant.tokenLocked', 'Revoke all users to change token.')}
                  {pluginStatus?.botUsername && <span className='ml-4px'>(@{pluginStatus.botUsername})</span>}
                </span>
              ) : tokenTested && testedBotUsername ? (
                <span className='flex items-center gap-4px text-green-600'>
                  <CheckOne size={14} /> {t('settings.assistant.tokenValid', 'Token valid')}: @{testedBotUsername}
                </span>
              ) : pluginStatus?.hasToken && !telegramToken ? (
                <span className='flex items-center gap-4px text-green-600'>
                  <CheckOne size={14} /> {t('settings.assistant.tokenConfigured', 'Token configured')}
                  {pluginStatus?.botUsername && <span className='ml-4px'>(@{pluginStatus.botUsername})</span>}
                </span>
              ) : (
                t('settings.assistant.botTokenDesc', 'Get your bot token from @BotFather on Telegram')
              )
            }
          >
            <div className='flex items-center gap-8px'>
              <Input.Password value={telegramToken} onChange={handleTokenChange} placeholder={authorizedUsers.length > 0 || pluginStatus?.hasToken ? '••••••••••••••••' : '123456:ABC-DEF...'} style={{ width: 240 }} visibilityToggle disabled={authorizedUsers.length > 0} />
              <Button type='outline' loading={testLoading} onClick={handleTestConnection} disabled={authorizedUsers.length > 0}>
                {t('settings.assistant.testConnection', 'Test')}
              </Button>
            </div>
          </PreferenceRow>

          <PreferenceRow
            label={t('settings.assistant.enableBot', 'Enable Bot')}
            description={
              pluginStatus?.connected ? (
                <span className='flex items-center gap-4px'>
                  <StatusBadge status='running' text={t('settings.assistant.connected', 'Connected')} />
                  {pluginStatus.botUsername && <span>@{pluginStatus.botUsername}</span>}
                </span>
              ) : pluginStatus?.enabled ? (
                <StatusBadge status='error' text={pluginStatus.error || t('settings.assistant.disconnected', 'Disconnected')} />
              ) : (
                t('settings.assistant.enableBotDesc', 'Start the Telegram bot to receive messages')
              )
            }
          >
            <Switch checked={pluginStatus?.enabled || false} loading={enableLoading} onChange={handleTogglePlugin} />
          </PreferenceRow>

          <PreferenceRow label={t('settings.assistant.defaultModel', 'Default Model')} description={t('settings.assistant.defaultModelDesc', 'Model used for Telegram conversations')}>
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
          </PreferenceRow>
        </div>

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
          <div className='bg-fill-1 rd-12px p-16px'>
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
          <div className='bg-fill-1 rd-12px p-16px'>
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
    </AionScrollArea>
  );
};

export default ChannelModalContent;
