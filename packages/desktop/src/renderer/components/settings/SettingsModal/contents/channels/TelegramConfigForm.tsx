/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/common/types/channel/channel';
import { assistants, channel } from '@/common/adapter/ipcBridge';
import { isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';
import { resolveLocaleKey } from '@/common/utils';
import { resolveAssistantName } from '@/renderer/utils/model/assistantDisplay';
import GoogleModelSelector from '@/renderer/pages/conversation/platforms/gemini/GoogleModelSelector';
import type { GoogleModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGoogleModelSelection';
import { Button, Dropdown, Empty, Input, Menu, Message, Spin, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, Delete, Down, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildChannelAssistantBinding,
  getDefaultChannelAssistant,
  resolveChannelAssistantSelection,
} from './assistantBinding';

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
  modelSelection: GoogleModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
  onTokenChange?: (token: string) => void;
}

const TelegramConfigForm: React.FC<TelegramConfigFormProps> = ({
  pluginStatus,
  modelSelection,
  onStatusChange,
  onTokenChange,
}) => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n?.language ?? 'en-US');

  const [telegramToken, setTelegramToken] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [tokenTested, setTokenTested] = useState(false);
  const [testedBotUsername, setTestedBotUsername] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  // Assistant selection (used for Telegram conversations)
  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [hasBrokenSavedAssistant, setHasBrokenSavedAssistant] = useState(false);

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const pairings = await channel.getPendingPairings.invoke();
      if (pairings) {
        setPendingPairings(pairings.filter((p) => p.platformType === 'telegram'));
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
      const users = await channel.getAuthorizedUsers.invoke();
      if (users) {
        setAuthorizedUsers(users.filter((u) => u.platformType === 'telegram'));
      }
    } catch (error) {
      console.error('[ChannelSettings] Failed to load authorized users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadPendingPairings();
    void loadAuthorizedUsers();
  }, [loadPendingPairings, loadAuthorizedUsers]);

  // Load available assistants + saved selection
  useEffect(() => {
    const loadAssistantsAndSelection = async () => {
      try {
        const [assistantList, saved] = await Promise.all([
          assistants.list.invoke(),
          channel.getPlatformSettings.invoke({ platform: 'telegram' }),
        ]);

        setAvailableAssistants(assistantList);

        const selection = resolveChannelAssistantSelection(saved.assistant ?? undefined, assistantList);
        const nextAssistant =
          assistantList.find((assistant) => assistant.id === selection.assistantId) ||
          (!selection.hasBrokenSavedAssistant ? getDefaultChannelAssistant(assistantList) : undefined) ||
          null;

        setHasBrokenSavedAssistant(selection.hasBrokenSavedAssistant);
        setSelectedAssistant(nextAssistant);
      } catch (error) {
        console.error('[TelegramConfig] Failed to load assistants:', error);
      }
    };

    void loadAssistantsAndSelection();
  }, []);

  const persistSelectedAssistant = async (assistant: Assistant) => {
    try {
      await channel.setAssistantSetting.invoke({
        platform: 'telegram',
        assistant: buildChannelAssistantBinding(assistant),
      });
      Message.success(t('settings.assistant.agentSwitched', 'Assistant switched successfully'));
    } catch (error) {
      console.error('[TelegramConfig] Failed to save assistant:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'telegram') return;
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
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
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
      // testPlugin returns { success, botUsername?, error? } directly
      const result = await channel.testPlugin.invoke({
        plugin_id: 'telegram',
        token: telegramToken.trim(),
      });

      if (result.success) {
        setTokenTested(true);
        setTestedBotUsername(result.bot_username || null);
        Message.success(
          t('settings.assistant.connectionSuccess', {
            defaultValue: 'Connected! Bot: @{{username}}',
            username: result.bot_username || 'unknown',
          })
        );

        // Auto-enable bot after successful test
        await handleAutoEnable();
      } else {
        setTokenTested(false);
        Message.error(result.error || t('settings.assistant.connectionFailed', 'Connection failed'));
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
      // enablePlugin returns void; success if no throw
      await channel.enablePlugin.invoke({
        plugin_id: 'telegram',
        config: { credentials: { token: telegramToken.trim() } },
      });

      Message.success(t('settings.assistant.pluginEnabled', 'Telegram bot enabled'));
      const plugins = await channel.getPluginStatus.invoke();
      if (plugins) {
        const telegramPlugin = plugins.find((p) => p.type === 'telegram');
        onStatusChange(telegramPlugin || null);
      }
    } catch (error: unknown) {
      console.error('[ChannelSettings] Auto-enable failed:', error);
    }
  };

  // Reset token tested state when token changes
  const handleTokenChange = (value: string) => {
    setTelegramToken(value);
    setTokenTested(false);
    setTestedBotUsername(null);
    onTokenChange?.(value);
  };

  // Approve pairing
  const handleApprovePairing = async (code: string) => {
    try {
      await channel.approvePairing.invoke({ code });
      Message.success(t('settings.assistant.pairingApproved', 'Pairing approved'));
      await loadPendingPairings();
      await loadAuthorizedUsers();
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  // Reject pairing
  const handleRejectPairing = async (code: string) => {
    try {
      await channel.rejectPairing.invoke({ code });
      Message.info(t('settings.assistant.pairingRejected', 'Pairing rejected'));
      await loadPendingPairings();
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  // Revoke user
  const handleRevokeUser = async (user_id: string) => {
    try {
      await channel.revokeUser.invoke({ user_id });
      Message.success(t('settings.assistant.userRevoked', 'User access revoked'));
      await loadAuthorizedUsers();
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
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

  const showModelSelector = isAionrsAssistant(selectedAssistant);
  const assistantOptions = availableAssistants;
  const selectedAssistantName = selectedAssistant
    ? resolveAssistantName(selectedAssistant, localeKey, selectedAssistant.name)
    : t('settings.assistant.name', 'Assistant');

  return (
    <div className='flex flex-col gap-24px'>
      <PreferenceRow
        label={t('settings.assistant.botToken', 'Bot Token')}
        description={t(
          'settings.assistant.botTokenDesc',
          'Open Telegram, find @BotFather and send /newbot to get your Bot Token.'
        )}
      >
        <div className='flex items-center gap-8px'>
          {authorizedUsers.length > 0 ? (
            <Tooltip
              content={t(
                'settings.assistant.tokenLocked',
                'Please close the Channel and delete all authorized users before modifying the configuration'
              )}
            >
              <span>
                <Input.Password
                  value={telegramToken}
                  onChange={handleTokenChange}
                  placeholder={
                    authorizedUsers.length > 0 || pluginStatus?.hasToken ? '••••••••••••••••' : '123456:ABC-DEF...'
                  }
                  style={{ width: 240 }}
                  visibilityToggle
                  disabled={authorizedUsers.length > 0}
                />
              </span>
            </Tooltip>
          ) : (
            <Input.Password
              value={telegramToken}
              onChange={handleTokenChange}
              placeholder={
                authorizedUsers.length > 0 || pluginStatus?.hasToken ? '••••••••••••••••' : '123456:ABC-DEF...'
              }
              style={{ width: 240 }}
              visibilityToggle
              disabled={authorizedUsers.length > 0}
            />
          )}
          {authorizedUsers.length > 0 ? (
            <Tooltip
              content={t(
                'settings.assistant.tokenLocked',
                'Please close the Channel and delete all authorized users before modifying the configuration'
              )}
            >
              <span>
                <Button
                  type='outline'
                  loading={testLoading}
                  onClick={handleTestConnection}
                  disabled={authorizedUsers.length > 0}
                >
                  {t('settings.assistant.testConnection', 'Test')}
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button
              type='outline'
              loading={testLoading}
              onClick={handleTestConnection}
              disabled={authorizedUsers.length > 0}
            >
              {t('settings.assistant.testConnection', 'Test')}
            </Button>
          )}
        </div>
      </PreferenceRow>

      {/* Assistant Selection */}
      <div className='flex flex-col gap-8px'>
        <PreferenceRow
          label={t('settings.assistant.name', 'Assistant')}
          description={
            <div className='flex flex-col gap-4px'>
              <span>{t('settings.assistant.agentDescTelegram', 'Used for Telegram conversations')}</span>
              {hasBrokenSavedAssistant && (
                <span className='text-orange-6'>
                  {t(
                    'conversation.agentError.codes.TEAM_ASSISTANT_NOT_FOUND.title',
                    'The selected assistant is no longer available'
                  )}
                </span>
              )}
            </div>
          }
        >
          <Dropdown
            trigger='click'
            position='br'
            droplist={
              <Menu selectedKeys={selectedAssistant ? [selectedAssistant.id] : []}>
                {assistantOptions.map((assistant) => {
                  const assistantName = resolveAssistantName(assistant, localeKey, assistant.name);
                  return (
                    <Menu.Item
                      key={assistant.id}
                      onClick={() => {
                        if (assistant.id === selectedAssistant?.id) return;

                        setHasBrokenSavedAssistant(false);
                        setSelectedAssistant(assistant);
                        void persistSelectedAssistant(assistant);

                        if (isAionrsAssistant(assistant)) {
                          const providers = modelSelection.providers;
                          const savedProviderExists =
                            modelSelection.current_model?.id &&
                            providers.some((p) => p.id === modelSelection.current_model?.id);
                          if (!savedProviderExists && providers.length > 0) {
                            const firstProvider = providers[0];
                            if (firstProvider.id && firstProvider.models?.[0]) {
                              void modelSelection.handleSelectModel(firstProvider, firstProvider.models[0]);
                            }
                          }
                        }
                      }}
                    >
                      {assistantName}
                    </Menu.Item>
                  );
                })}
              </Menu>
            }
          >
            <Button type='secondary' className='min-w-160px flex items-center justify-between gap-8px'>
              <span className='truncate'>{selectedAssistantName}</span>
              <Down theme='outline' size={14} />
            </Button>
          </Dropdown>
        </PreferenceRow>
      </div>

      {/* Default Model Selection */}
      <PreferenceRow
        label={t('settings.assistant.defaultModel', 'Default Model')}
        description={t(
          'settings.assistant.defaultModelDesc',
          'Model used for Telegram conversations handled by this assistant'
        )}
      >
        <GoogleModelSelector
          selection={showModelSelector ? modelSelection : undefined}
          disabled={!showModelSelector}
          label={
            !showModelSelector
              ? t('settings.assistant.autoFollowCliModel', 'Automatically follow the model when CLI is running')
              : undefined
          }
          variant='settings'
        />
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
              <strong>2.</strong>{' '}
              {t('settings.assistant.step2', 'Send any message or click /start to initiate pairing')}
            </p>
            <p className='m-0'>
              <strong>3.</strong>{' '}
              {t(
                'settings.assistant.step3',
                'A pairing request will appear below. Click "Approve" to authorize the user.'
              )}
            </p>
            <p className='m-0'>
              <strong>4.</strong>{' '}
              {t('settings.assistant.step4', 'Once approved, you can start chatting with Gemini through Telegram!')}
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
              <Button
                size='mini'
                type='text'
                icon={<Refresh size={14} />}
                loading={pairingLoading}
                onClick={loadPendingPairings}
              >
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
                      <span className='text-14px font-500 text-t-primary'>
                        {pairing.display_name || 'Unknown User'}
                      </span>
                      <Tooltip content={t('settings.assistant.copyCode', 'Copy pairing code')}>
                        <button
                          className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer'
                          onClick={() => copyToClipboard(pairing.code)}
                        >
                          <Copy size={14} />
                        </button>
                      </Tooltip>
                    </div>
                    <div className='text-12px text-t-tertiary mt-4px'>
                      {t('settings.assistant.pairingCode', 'Code')}:{' '}
                      <code className='bg-fill-3 px-4px rd-2px'>{pairing.code}</code>
                      <span className='mx-8px'>|</span>
                      {t('settings.assistant.expiresIn', 'Expires in')}: {getRemainingTime(pairing.expiresAt)}
                    </div>
                  </div>
                  <div className='flex items-center gap-8px'>
                    <Button
                      type='primary'
                      size='small'
                      icon={<CheckOne size={14} />}
                      onClick={() => handleApprovePairing(pairing.code)}
                    >
                      {t('settings.assistant.approve', 'Approve')}
                    </Button>
                    <Button
                      type='secondary'
                      size='small'
                      status='danger'
                      icon={<CloseOne size={14} />}
                      onClick={() => handleRejectPairing(pairing.code)}
                    >
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
              <Button
                size='mini'
                type='text'
                icon={<Refresh size={14} />}
                loading={usersLoading}
                onClick={loadAuthorizedUsers}
              >
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
                    <div className='text-14px font-500 text-t-primary'>{user.display_name || 'Unknown User'}</div>
                    <div className='text-12px text-t-tertiary mt-4px'>
                      {t('settings.assistant.platform', 'Platform')}: {user.platformType}
                      <span className='mx-8px'>|</span>
                      {t('settings.assistant.authorizedAt', 'Authorized')}: {formatTime(user.authorizedAt)}
                    </div>
                  </div>
                  <Tooltip content={t('settings.assistant.revokeAccess', 'Revoke access')}>
                    <Button
                      type='text'
                      status='danger'
                      size='small'
                      icon={<Delete size={16} />}
                      onClick={() => handleRevokeUser(user.id)}
                    />
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
