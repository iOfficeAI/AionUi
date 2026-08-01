/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/common/types/channel/channel';
import { assistants, channel } from '@/common/adapter/ipcBridge';
import { isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';
import { resolveLocaleKey } from '@/common/utils';
import { openExternalUrl } from '@/renderer/utils/platform';
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

interface SlackConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GoogleModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
}

const SLACK_DEV_DOCS_URL = 'https://github.com/iOfficeAI/AionUi/wiki/Slack-Bot-Setup-Guide';

const SlackConfigForm: React.FC<SlackConfigFormProps> = ({ pluginStatus, modelSelection, onStatusChange }) => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n?.language ?? 'en-US');

  // Slack credentials (Socket Mode)
  const [botToken, setBotToken] = useState('');
  const [appToken, setAppToken] = useState('');
  const [allowedChannels, setAllowedChannels] = useState('');

  const [testLoading, setTestLoading] = useState(false);
  const [_credentialsTested, setCredentialsTested] = useState(false);
  const [touched, setTouched] = useState({ botToken: false, appToken: false });
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [hasBrokenSavedAssistant, setHasBrokenSavedAssistant] = useState(false);

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const pairings = await channel.getPendingPairings.invoke();
      if (pairings) {
        setPendingPairings(pairings.filter((p) => p.platformType === 'slack'));
      }
    } catch (error) {
      console.error('[SlackConfig] Failed to load pending pairings:', error);
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
        setAuthorizedUsers(users.filter((u) => u.platformType === 'slack'));
      }
    } catch (error) {
      console.error('[SlackConfig] Failed to load authorized users:', error);
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
          channel.getPlatformSettings.invoke({ platform: 'slack' }),
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
        console.error('[SlackConfig] Failed to load assistants:', error);
      }
    };

    void loadAssistantsAndSelection();
  }, []);

  const persistSelectedAssistant = async (assistant: Assistant) => {
    try {
      await channel.setAssistantSetting.invoke({
        platform: 'slack',
        assistant: buildChannelAssistantBinding(assistant),
      });
      Message.success(t('settings.assistant.agentSwitched', 'Assistant switched successfully'));
    } catch (error) {
      console.error('[SlackConfig] Failed to save assistant:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'slack') return;
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
      if (user.platformType !== 'slack') return;
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
      setPendingPairings((prev) => prev.filter((p) => p.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, []);

  // Test Slack connection
  const handleTestConnection = async () => {
    setTouched({ botToken: true, appToken: true });

    if (!botToken.trim() || !appToken.trim()) {
      Message.warning(t('settings.slack.credentialsRequired', 'Please enter Bot Token and App Token'));
      return;
    }

    setTestLoading(true);
    setCredentialsTested(false);
    try {
      // testPlugin returns { success, botUsername?, error? } directly
      // token = bot xoxb-…; app_secret maps to Socket Mode app token xapp-…
      const result = await channel.testPlugin.invoke({
        plugin_id: 'slack',
        token: botToken.trim(),
        extra_config: {
          app_secret: appToken.trim(),
        },
      });

      if (result.success) {
        setCredentialsTested(true);
        Message.success(t('settings.slack.connectionSuccess', 'Connected to Slack API!'));
        await handleAutoEnable();
      } else {
        setCredentialsTested(false);
        Message.error(result.error || t('settings.slack.connectionFailed', 'Connection failed'));
      }
    } catch (error: any) {
      setCredentialsTested(false);
      Message.error(error.message || t('settings.slack.connectionFailed', 'Connection failed'));
    } finally {
      setTestLoading(false);
    }
  };

  // Auto-enable plugin after successful test
  const handleAutoEnable = async () => {
    try {
      await channel.enablePlugin.invoke({
        plugin_id: 'slack',
        config: {
          credentials: {
            token: botToken.trim(),
            app_token: appToken.trim(),
          },
          config: {
            allowed_channels: allowedChannels.trim() || undefined,
            mode: 'websocket',
          },
        },
      });

      Message.success(t('settings.slack.pluginEnabled', 'Slack bot enabled'));
      const plugins = await channel.getPluginStatus.invoke();
      if (plugins) {
        const slackPlugin = plugins.find((p) => p.type === 'slack');
        onStatusChange(slackPlugin || null);
      }
    } catch (error: unknown) {
      console.error('[SlackConfig] Auto-enable failed:', error);
      Message.error(
        (error instanceof Error ? error.message : String(error)) ||
          t('settings.slack.enableFailed', 'Failed to enable Slack plugin')
      );
    }
  };

  // Reset credentials tested state when credentials change
  const handleCredentialsChange = () => {
    setCredentialsTested(false);
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

  const hasExistingUsers = authorizedUsers.length > 0;
  const showModelSelector = isAionrsAssistant(selectedAssistant);
  const assistantOptions = availableAssistants;
  const selectedAssistantName = selectedAssistant
    ? resolveAssistantName(selectedAssistant, localeKey, selectedAssistant.name)
    : t('settings.assistant.name', 'Assistant');

  return (
    <div className='flex flex-col gap-24px'>
      {/* Bot Token (xoxb) */}
      <PreferenceRow
        label={t('settings.slack.botToken', 'Bot Token')}
        description={
          <span>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={SLACK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(SLACK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.slack.devConsoleLink', 'Slack setup guide')}
            </a>{' '}
            {t('settings.slack.botTokenDescSuffix', '— Bot User OAuth Token (xoxb-…)')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip
            content={t(
              'settings.assistant.tokenLocked',
              'Please close the Channel and delete all authorized users before modifying'
            )}
          >
            <span>
              <Input
                value={botToken}
                onChange={(value) => {
                  setBotToken(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, botToken: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xoxb-...'}
                style={{ width: 240 }}
                status={touched.botToken && !botToken.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input
            value={botToken}
            onChange={(value) => {
              setBotToken(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, botToken: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xoxb-...'}
            style={{ width: 240 }}
            status={touched.botToken && !botToken.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            disabled={hasExistingUsers}
          />
        )}
      </PreferenceRow>

      {/* App-Level Token (xapp) for Socket Mode */}
      <PreferenceRow
        label={t('settings.slack.appToken', 'App Token')}
        description={
          <span>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={SLACK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(SLACK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.slack.devConsoleLink', 'Slack setup guide')}
            </a>{' '}
            {t('settings.slack.appTokenDescSuffix', '— App-Level Token (xapp-…) with connections:write')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip
            content={t(
              'settings.assistant.tokenLocked',
              'Please close the Channel and delete all authorized users before modifying'
            )}
          >
            <span>
              <Input.Password
                value={appToken}
                onChange={(value) => {
                  setAppToken(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, appToken: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xapp-...'}
                style={{ width: 240 }}
                status={touched.appToken && !appToken.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                visibilityToggle
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input.Password
            value={appToken}
            onChange={(value) => {
              setAppToken(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, appToken: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xapp-...'}
            style={{ width: 240 }}
            status={touched.appToken && !appToken.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            visibilityToggle
            disabled={hasExistingUsers}
          />
        )}
      </PreferenceRow>

      {/* Allowed channels (optional) */}
      <PreferenceRow
        label={t('settings.slack.allowedChannels', 'Allowed channels')}
        description={t(
          'settings.slack.allowedChannelsDesc',
          'Comma-separated channel IDs (C…/G…). Empty = DMs only. In listed channels the bot only replies when @mentioned.'
        )}
      >
        <Input
          value={allowedChannels}
          onChange={setAllowedChannels}
          placeholder='C0123ABC,G0456DEF'
          style={{ width: 280 }}
          disabled={hasExistingUsers}
        />
      </PreferenceRow>

      {/* Test Connection Button */}
      {!hasExistingUsers && !pluginStatus?.connected && (
        <div className='flex justify-end'>
          {pluginStatus?.hasToken && !botToken.trim() && !appToken.trim() ? (
            <span className='text-12px text-t-tertiary mr-12px self-center'>
              {t('settings.slack.credentialsSaved', 'Credentials already configured. Enter new values to update.')}
            </span>
          ) : null}
          <Button
            type='primary'
            loading={testLoading}
            onClick={handleTestConnection}
            disabled={pluginStatus?.hasToken && !botToken.trim() && !appToken.trim()}
          >
            {t('settings.slack.testAndConnect', 'Test & Connect')}
          </Button>
        </div>
      )}

      {/* Assistant Selection */}
      <div className='flex flex-col gap-8px'>
        <PreferenceRow
          label={t('settings.assistant.name', 'Assistant')}
          description={
            <div className='flex flex-col gap-4px'>
              <span>{t('settings.slack.agentDesc', 'Used for Slack conversations')}</span>
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
                        if (assistant.id === selectedAssistant?.id) {
                          return;
                        }
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
        label={t('settings.assistant.defaultModel', 'Model')}
        description={t('settings.slack.defaultModelDesc', 'Model used for conversations handled by this assistant')}
      >
        <GoogleModelSelector
          selection={showModelSelector ? modelSelection : undefined}
          disabled={!showModelSelector}
          label={
            !showModelSelector ? t('settings.assistant.autoFollowCliModel', 'Auto-follow CLI runtime model') : undefined
          }
          variant='settings'
        />
      </PreferenceRow>

      {/* Connection Status */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div
          className={`rd-12px p-16px border ${pluginStatus?.connected ? 'bg-success-light-1 border-success-3' : pluginStatus?.error ? 'bg-danger-light-1 border-danger-3' : 'bg-warning-light-1 border-warning-3'}`}
        >
          <SectionHeader
            title={t('settings.slack.connectionStatus', 'Connection Status')}
            action={
              <span
                className={`text-12px px-8px py-2px rd-4px ${pluginStatus?.connected ? 'bg-success-light-1 text-success-6' : pluginStatus?.error ? 'bg-danger-light-1 text-danger-6' : 'bg-warning-light-1 text-warning-6'}`}
              >
                {pluginStatus?.connected
                  ? t('settings.slack.statusConnected', 'Connected')
                  : pluginStatus?.error
                    ? t('settings.slack.statusError', 'Error')
                    : t('settings.slack.statusConnecting', 'Connecting...')}
              </span>
            }
          />
          {pluginStatus?.error && <div className='text-14px text-danger-6 mb-12px'>{pluginStatus.error}</div>}
          {pluginStatus?.connected && (
            <div className='text-14px text-t-secondary space-y-8px'>
              <p className='m-0 font-500'>{t('settings.assistant.nextSteps', 'Next Steps')}:</p>
              <p className='m-0'>
                <strong>1.</strong> {t('settings.slack.step1', 'Open Slack and find your bot application')}
              </p>
              <p className='m-0'>
                <strong>2.</strong> {t('settings.slack.step2', 'Send any message to initiate pairing')}
              </p>
              <p className='m-0'>
                <strong>3.</strong>{' '}
                {t(
                  'settings.slack.step3',
                  'A pairing request will appear below. Click "Approve" to authorize the user.'
                )}
              </p>
              <p className='m-0'>
                <strong>4.</strong>{' '}
                {t(
                  'settings.slack.step4',
                  'Once approved, you can start chatting with the AI assistant through Slack!'
                )}
              </p>
            </div>
          )}
          {!pluginStatus?.connected && !pluginStatus?.error && (
            <div className='text-14px text-t-secondary'>
              {t('settings.slack.waitingConnection', 'Connection is being established. Please wait...')}
            </div>
          )}
        </div>
      )}

      {/* Pending Pairings */}
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
                      <span className='text-14px font-500 text-t-primary'>
                        {pairing.display_name || 'Unknown User'}
                      </span>
                      <Tooltip content={t('settings.assistant.copyCode', 'Copy pairing code')}>
                        <Button
                          type='text'
                          size='mini'
                          className='text-t-tertiary hover:text-t-primary'
                          icon={<Copy size={14} />}
                          onClick={() => copyToClipboard(pairing.code)}
                        />
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

      {/* Authorized Users */}
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

export default SlackConfigForm;
