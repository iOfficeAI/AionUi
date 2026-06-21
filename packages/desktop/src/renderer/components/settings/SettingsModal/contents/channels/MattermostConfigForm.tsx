/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus } from '@/common/types/channel/channel';
import { assistants, channel } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import { isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';
import { resolveLocaleKey } from '@/common/utils';
import { resolveAssistantName } from '@/renderer/utils/model/assistantDisplay';
import GoogleModelSelector from '@/renderer/pages/conversation/platforms/gemini/GoogleModelSelector';
import type { GoogleModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGoogleModelSelection';
import { Button, Dropdown, Empty, Input, Menu, Message, Spin, Switch, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, Down, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildChannelAssistantBinding,
  getDefaultChannelAssistant,
  resolveChannelAssistantSelection,
} from './assistantBinding';

const PreferenceRow: React.FC<{
  label: string;
  description?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, description, required, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='flex-1'>
      <div className='text-14px text-t-primary'>
        {label}
        {required && <span className='text-red-500 ml-2px'>*</span>}
      </div>
      {description && <div className='text-12px text-t-tertiary mt-2px'>{description}</div>}
    </div>
    <div className='flex items-center'>{children}</div>
  </div>
);

type MattermostConfigFormProps = {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GoogleModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
};

const MattermostConfigForm: React.FC<MattermostConfigFormProps> = ({
  pluginStatus,
  modelSelection,
  onStatusChange,
}) => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n?.language ?? 'en-US');

  const [serverUrl, setServerUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [allowedChannelIds, setAllowedChannelIds] = useState('');
  const [replyInThread, setReplyInThread] = useState(true);
  const [ignoreSelfMessages, setIgnoreSelfMessages] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [hasBrokenSavedAssistant, setHasBrokenSavedAssistant] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      const saved = configService.get('assistant.mattermost.config');
      if (saved?.serverUrl) setServerUrl(saved.serverUrl);
      if (saved?.allowedChannelIds) setAllowedChannelIds(saved.allowedChannelIds);
      if (typeof saved?.replyInThread === 'boolean') setReplyInThread(saved.replyInThread);
      if (typeof saved?.ignoreSelfMessages === 'boolean') setIgnoreSelfMessages(saved.ignoreSelfMessages);
    };
    void loadConfig();
  }, []);

  useEffect(() => {
    const loadAssistantsAndSelection = async () => {
      try {
        const [assistantList, saved] = await Promise.all([
          assistants.list.invoke(),
          channel.getPlatformSettings.invoke({ platform: 'mattermost' }),
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
        console.error('[MattermostConfig] Failed to load assistants:', error);
      }
    };
    void loadAssistantsAndSelection();
  }, []);

  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const pairings = await channel.getPendingPairings.invoke();
      setPendingPairings(pairings?.filter((pairing) => pairing.platformType === 'mattermost') ?? []);
    } catch (error) {
      console.error('[MattermostConfig] Failed to load pending pairings:', error);
    } finally {
      setPairingLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendingPairings();
  }, [loadPendingPairings]);

  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'mattermost') return;
      setPendingPairings((prev) => {
        const exists = prev.some((pairing) => pairing.code === request.code);
        if (exists) return prev;
        return [request, ...prev];
      });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = channel.userAuthorized.on((user) => {
      if (user.platformType !== 'mattermost') return;
      setPendingPairings((prev) => prev.filter((pairing) => pairing.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, []);

  const persistSelectedAssistant = async (assistant: Assistant) => {
    try {
      await channel.setAssistantSetting.invoke({
        platform: 'mattermost',
        assistant: buildChannelAssistantBinding(assistant),
      });
      Message.success(t('settings.assistant.agentSwitched', 'Assistant switched successfully'));
    } catch (error) {
      console.error('[MattermostConfig] Failed to save assistant:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  const handleSaveAndEnable = async () => {
    if (!serverUrl.trim()) {
      Message.warning(t('settings.mattermost.serverUrlRequired', 'Please enter Mattermost Server URL'));
      return;
    }
    if (!pluginStatus?.hasToken && !accessToken.trim()) {
      Message.warning(t('settings.mattermost.accessTokenRequired', 'Please enter Access Token'));
      return;
    }

    setSaving(true);
    try {
      const config = {
        serverUrl: serverUrl.trim(),
        allowedChannelIds: allowedChannelIds.trim(),
        replyInThread,
        ignoreSelfMessages,
      };
      await configService.set('assistant.mattermost.config', config);
      await channel.enablePlugin.invoke({
        plugin_id: 'mattermost',
        config: {
          credentials: accessToken.trim() ? { accessToken: accessToken.trim() } : {},
          config,
        },
      });
      Message.success(t('settings.mattermost.pluginEnabled', 'Mattermost channel enabled'));
      const plugins = await channel.getPluginStatus.invoke();
      onStatusChange(plugins?.find((plugin) => plugin.type === 'mattermost') || null);
      setAccessToken('');
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!serverUrl.trim() || !accessToken.trim()) {
      Message.warning(t('settings.mattermost.credentialsRequired', 'Please enter Server URL and Access Token'));
      return;
    }
    setSaving(true);
    try {
      const result = await channel.testPlugin.invoke({
        plugin_id: 'mattermost',
        token: accessToken.trim(),
        extra_config: {
          serverUrl: serverUrl.trim(),
        },
      });
      if (result.success) {
        Message.success(t('settings.mattermost.connectionSuccess', 'Connected to Mattermost API'));
      } else {
        Message.error(result.error || t('settings.mattermost.connectionFailed', 'Connection failed'));
      }
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleApprovePairing = async (code: string) => {
    try {
      await channel.approvePairing.invoke({ code });
      Message.success(t('settings.assistant.pairingApproved', 'Pairing approved'));
      await loadPendingPairings();
    } catch (error) {
      console.error('[MattermostConfig] Failed to approve pairing:', error);
      Message.error(t('settings.assistant.approveFailed', 'Failed to approve pairing'));
    }
  };

  const handleRejectPairing = async (code: string) => {
    try {
      await channel.rejectPairing.invoke({ code });
      Message.info(t('settings.assistant.pairingRejected', 'Pairing rejected'));
      await loadPendingPairings();
    } catch (error) {
      console.error('[MattermostConfig] Failed to reject pairing:', error);
      Message.error(t('settings.assistant.rejectFailed', 'Failed to reject pairing'));
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success(t('common.copySuccess', 'Copied'));
  };

  const getRemainingTime = (expiresAt: number) => {
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000 / 60));
    return `${remaining} min`;
  };

  const showModelSelector = isAionrsAssistant(selectedAssistant);
  const selectedAssistantName = selectedAssistant
    ? resolveAssistantName(selectedAssistant, localeKey, selectedAssistant.name)
    : t('settings.assistant.name', 'Assistant');

  return (
    <div className='flex flex-col gap-24px'>
      <PreferenceRow label={t('settings.mattermost.serverUrl', 'Mattermost Server URL')} required>
        <Input
          value={serverUrl}
          onChange={setServerUrl}
          placeholder='https://mattermost.example.com'
          style={{ width: 280 }}
        />
      </PreferenceRow>

      <PreferenceRow label={t('settings.mattermost.accessToken', 'Access Token')} required>
        <Input.Password
          value={accessToken}
          onChange={setAccessToken}
          placeholder={pluginStatus?.hasToken ? '••••••••••••••••' : 'MMAUTHTOKEN...'}
          style={{ width: 280 }}
          visibilityToggle
        />
      </PreferenceRow>

      <PreferenceRow
        label={t('settings.mattermost.allowedChannelIds', 'Allowed Channel IDs')}
        description={t(
          'settings.mattermost.allowedChannelIdsDesc',
          'Comma-separated. Leave empty to allow all channels.'
        )}
      >
        <Input
          value={allowedChannelIds}
          onChange={setAllowedChannelIds}
          placeholder='channel_id_1, channel_id_2'
          style={{ width: 280 }}
        />
      </PreferenceRow>

      <PreferenceRow label={t('settings.mattermost.replyInThread', 'Reply in thread')}>
        <Switch checked={replyInThread} onChange={setReplyInThread} />
      </PreferenceRow>

      <PreferenceRow label={t('settings.mattermost.ignoreSelfMessages', 'Ignore self messages')}>
        <Switch checked={ignoreSelfMessages} onChange={setIgnoreSelfMessages} />
      </PreferenceRow>

      <div className='flex justify-end gap-8px'>
        <Button type='outline' loading={saving} disabled={!accessToken.trim()} onClick={handleTestConnection}>
          {t('settings.assistant.testConnection', 'Test')}
        </Button>
        <Button type='primary' loading={saving} onClick={handleSaveAndEnable}>
          {t('settings.mattermost.saveAndEnable', 'Save & Enable')}
        </Button>
      </div>

      <PreferenceRow
        label={t('settings.assistant.name', 'Assistant')}
        description={
          <div className='flex flex-col gap-4px'>
            <span>{t('settings.mattermost.agentDesc', 'Used for Mattermost conversations')}</span>
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
              {availableAssistants.map((assistant) => {
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

      <PreferenceRow
        label={t('settings.assistant.defaultModel', 'Default Model')}
        description={t('settings.mattermost.defaultModelDesc', 'Used for Mattermost conversations')}
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

      {pluginStatus?.enabled && (
        <div
          className={`rd-12px p-16px border ${pluginStatus.connected ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : pluginStatus.error ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'}`}
        >
          <div className='text-14px font-500 text-t-primary mb-8px'>
            {t('settings.mattermost.connectionStatus', 'Connection Status')}
          </div>
          <div className='text-13px text-t-secondary'>
            {pluginStatus.connected
              ? t('settings.mattermost.statusConnected', 'Connected')
              : pluginStatus.error
                ? pluginStatus.error
                : t('settings.mattermost.statusConnecting', 'Connecting...')}
          </div>
        </div>
      )}

      {pluginStatus?.enabled && (
        <div className='bg-fill-1 rd-12px p-16px'>
          <div className='flex items-center justify-between mb-12px'>
            <div className='text-14px font-500 text-t-primary'>
              {t('settings.assistant.pendingPairings', 'Pending Pairing Requests')}
            </div>
            <Button
              size='mini'
              type='text'
              icon={<Refresh size={14} />}
              loading={pairingLoading}
              onClick={loadPendingPairings}
            >
              {t('common.refresh', 'Refresh')}
            </Button>
          </div>

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
                        {pairing.display_name || t('settings.assistant.unknownUser', 'Unknown User')}
                      </span>
                      <Tooltip content={t('settings.assistant.copyCode', 'Copy pairing code')}>
                        <Button
                          type='text'
                          size='mini'
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
    </div>
  );
};

export default MattermostConfigForm;
