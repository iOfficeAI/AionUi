/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@process/channels/types';
import { acpConversation, channel } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import GeminiModelSelector from '@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector';
import type { GeminiModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection';
import { Button, Dropdown, Empty, Menu, Message, Spin, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, Delete, Down, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';

/**
 * Preference row component (local, mirrors other config forms)
 */
const PreferenceRow: React.FC<{
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='flex-1'>
      <span className='text-14px text-t-primary'>{label}</span>
      {description && <div className='text-12px text-t-tertiary mt-2px'>{description}</div>}
    </div>
    <div className='flex items-center'>{children}</div>
  </div>
);

const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className='flex items-center justify-between mb-12px'>
    <h3 className='text-14px font-500 text-t-primary m-0'>{title}</h3>
    {action}
  </div>
);

interface WeixinConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GeminiModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
}

const getRemainingTime = (expiresAt: number) => {
  const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000 / 60));
  return `${remaining} min`;
};

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleString();

const WeixinConfigForm: React.FC<WeixinConfigFormProps> = ({ pluginStatus, modelSelection, onStatusChange }) => {
  const { t } = useTranslation();

  const [loginState, setLoginState] = useState<LoginState>(
    pluginStatus?.hasToken && pluginStatus?.enabled ? 'connected' : 'idle'
  );
  // In Electron mode this holds a base64 data URL; in WebUI mode it holds the raw QR ticket string.
  const [qrcodeDataUrl, setQrcodeDataUrl] = useState<string | null>(null);
  const [isWebUIMode, setIsWebUIMode] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Pairing state
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  // Agent selection
  const [availableAgents, setAvailableAgents] = useState<
    Array<{ backend: string; name: string; customAgentId?: string }>
  >([]);
  const [selectedAgent, setSelectedAgent] = useState<{
    backend: string;
    name?: string;
    customAgentId?: string;
  }>({ backend: 'gemini' });

  // Close EventSource on unmount to prevent connection leaks.
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  // Sync connected state when pluginStatus changes externally.
  // Require enabled to be true so that a post-disable pluginStatusChanged event
  // (which still carries hasToken: true but enabled: false) does not flip back to connected.
  useEffect(() => {
    if (pluginStatus?.hasToken && pluginStatus?.enabled && loginState === 'idle') {
      setLoginState('connected');
    }
  }, [pluginStatus, loginState]);

  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const result = await channel.getPendingPairings.invoke();
      if (result.success && result.data) {
        setPendingPairings(result.data.filter((p) => p.platformType === 'weixin'));
      }
    } catch (error) {
      console.error('[WeixinConfig] Failed to load pending pairings:', error);
    } finally {
      setPairingLoading(false);
    }
  }, []);

  const loadAuthorizedUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await channel.getAuthorizedUsers.invoke();
      if (result.success && result.data) {
        setAuthorizedUsers(result.data.filter((u) => u.platformType === 'weixin'));
      }
    } catch (error) {
      console.error('[WeixinConfig] Failed to load authorized users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendingPairings();
    void loadAuthorizedUsers();
  }, [loadPendingPairings, loadAuthorizedUsers]);

  // Listen for incoming weixin pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'weixin') return;
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
      if (user.platformType !== 'weixin') return;
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
      setPendingPairings((prev) => prev.filter((p) => p.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, []);

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
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRejectPairing = async (code: string) => {
    try {
      const result = await channel.rejectPairing.invoke({ code });
      if (result.success) {
        Message.info(t('settings.assistant.pairingRejected', 'Pairing rejected'));
        await loadPendingPairings();
      } else {
        Message.error(result.msg || t('settings.assistant.rejectFailed', 'Failed to reject pairing'));
      }
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRevokeUser = async (userId: string) => {
    try {
      const result = await channel.revokeUser.invoke({ userId });
      if (result.success) {
        Message.success(t('settings.assistant.userRevoked', 'User access revoked'));
        await loadAuthorizedUsers();
      } else {
        Message.error(result.msg || t('settings.assistant.revokeFailed', 'Failed to revoke user'));
      }
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success(t('common.copySuccess', 'Copied'));
  };

  // Load agents + saved selection
  useEffect(() => {
    const load = async () => {
      try {
        const [agentsResp, saved] = await Promise.all([
          acpConversation.getAvailableAgents.invoke(),
          ConfigStorage.get('assistant.weixin.agent'),
        ]);
        if (agentsResp.success && agentsResp.data) {
          setAvailableAgents(
            agentsResp.data
              .filter((a) => !a.isPreset)
              .map((a) => ({
                backend: a.backend,
                name: a.name,
                customAgentId: a.customAgentId,
              }))
          );
        }
        if (
          saved &&
          typeof saved === 'object' &&
          'backend' in saved &&
          typeof (saved as Record<string, unknown>).backend === 'string'
        ) {
          const s = saved as { backend: string; customAgentId?: string; name?: string };
          setSelectedAgent({
            backend: s.backend,
            customAgentId: s.customAgentId,
            name: s.name,
          });
        }
      } catch (error) {
        console.error('[WeixinConfig] Failed to load agents:', error);
      }
    };
    void load();
  }, []);

  const persistSelectedAgent = async (agent: { backend: string; customAgentId?: string; name?: string }) => {
    try {
      await ConfigStorage.set('assistant.weixin.agent', agent);
      await channel.syncChannelSettings
        .invoke({ platform: 'weixin', agent })
        .catch((err) => console.warn('[WeixinConfig] syncChannelSettings failed:', err));
      Message.success(t('settings.assistant.agentSwitched', 'Agent switched successfully'));
    } catch (error) {
      console.error('[WeixinConfig] Failed to save agent:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  const enableWeixinPlugin = async (accountId: string, botToken: string) => {
    const enableResult = await channel.enablePlugin.invoke({
      pluginId: 'weixin_default',
      config: { accountId, botToken },
    });
    if (enableResult.success) {
      Message.success(t('settings.weixin.pluginEnabled', 'WeChat channel enabled'));
      const statusResult = await channel.getPluginStatus.invoke();
      if (statusResult.success && statusResult.data) {
        const weixinPlugin = statusResult.data.find((p) => p.type === 'weixin');
        onStatusChange(weixinPlugin || null);
      }
      setLoginState('connected');
    } else {
      Message.error(enableResult.msg || t('settings.weixin.enableFailed', 'Failed to enable WeChat plugin'));
      setLoginState('idle');
    }
  };

  const handleLoginWebUI = () => {
    setIsWebUIMode(true);
    setLoginState('loading_qr');
    setQrcodeDataUrl(null);

    const es = new EventSource('/api/channel/weixin/login', { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('qr', (e: MessageEvent) => {
      const { qrcodeData } = JSON.parse(e.data) as { qrcodeData: string };
      setQrcodeDataUrl(qrcodeData);
      setLoginState('showing_qr');
    });

    es.addEventListener('scanned', () => {
      setLoginState('scanned');
    });

    es.addEventListener('done', (e: MessageEvent) => {
      es.close();
      const { accountId, botToken } = JSON.parse(e.data) as { accountId: string; botToken: string };
      enableWeixinPlugin(accountId, botToken).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        Message.error(msg || t('settings.weixin.enableFailed', 'Failed to enable WeChat plugin'));
        setLoginState('idle');
        setQrcodeDataUrl(null);
      });
    });

    es.addEventListener('error', (e: MessageEvent) => {
      es.close();
      const msg = e.data ? ((JSON.parse(e.data) as { message?: string }).message ?? '') : '';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('too many')) {
        Message.warning(t('settings.weixin.loginExpired', 'QR code expired, please try again'));
      } else {
        Message.error(t('settings.weixin.loginError', 'WeChat login failed'));
      }
      setLoginState('idle');
      setQrcodeDataUrl(null);
    });

    es.onerror = () => {
      es.close();
      setLoginState('idle');
      setQrcodeDataUrl(null);
    };
  };

  const handleLogin = async () => {
    if (!window.electronAPI?.weixinLoginStart) {
      handleLoginWebUI();
      return;
    }

    setLoginState('loading_qr');
    setQrcodeDataUrl(null);

    const unsubQR =
      window.electronAPI.weixinLoginOnQR?.(({ qrcodeUrl: dataUrl }: { qrcodeUrl: string }) => {
        setQrcodeDataUrl(dataUrl);
        setLoginState('showing_qr');
      }) ?? (() => {});
    const unsubScanned =
      window.electronAPI.weixinLoginOnScanned?.(() => {
        setLoginState('scanned');
      }) ?? (() => {});
    const unsubDone =
      window.electronAPI.weixinLoginOnDone?.(() => {
        // credentials come from the Promise resolve — not this event
      }) ?? (() => {});

    try {
      const result = await window.electronAPI.weixinLoginStart();
      const { accountId, botToken } = result as {
        accountId: string;
        botToken: string;
      };
      await enableWeixinPlugin(accountId, botToken);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('too many')) {
        Message.warning(t('settings.weixin.loginExpired', 'QR code expired, please try again'));
      } else if (msg !== 'Aborted') {
        Message.error(t('settings.weixin.loginError', 'WeChat login failed'));
      }
      setLoginState('idle');
      setQrcodeDataUrl(null);
    } finally {
      unsubQR();
      unsubScanned();
      unsubDone();
    }
  };

  const isGeminiAgent = selectedAgent.backend === 'gemini' || selectedAgent.backend === 'aionrs';
  const agentOptions: Array<{
    backend: string;
    name: string;
    customAgentId?: string;
  }> = availableAgents.length > 0 ? availableAgents : [{ backend: 'gemini', name: 'Gemini CLI' }];

  const handleDisconnect = async () => {
    try {
      const result = await channel.disablePlugin.invoke({ pluginId: 'weixin_default' });
      if (result.success) {
        Message.success(t('settings.weixin.pluginDisabled', 'WeChat channel disabled'));
        onStatusChange(null);
        setLoginState('idle');
        setQrcodeDataUrl(null);
      } else {
        Message.error(result.msg || t('settings.weixin.disableFailed', 'Failed to disconnect'));
      }
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const renderLoginArea = () => {
    if (loginState === 'connected' || (pluginStatus?.hasToken && pluginStatus?.enabled)) {
      return (
        <div className='flex items-center gap-8px'>
          <CheckOne theme='filled' size={16} className='text-green-500' />
          <span className='text-14px text-t-primary'>{t('settings.weixin.connected', 'Connected')}</span>
          {pluginStatus?.botUsername && <span className='text-12px text-t-tertiary'>({pluginStatus.botUsername})</span>}
          <Button
            type='secondary'
            size='small'
            status='danger'
            onClick={() => {
              void handleDisconnect();
            }}
          >
            {t('settings.weixin.disconnect', 'Disconnect')}
          </Button>
        </div>
      );
    }

    if (loginState === 'showing_qr' || loginState === 'scanned') {
      return (
        <div className='flex flex-col items-center gap-8px'>
          {qrcodeDataUrl &&
            (isWebUIMode ? (
              <QRCodeSVG value={qrcodeDataUrl} size={160} />
            ) : (
              <img src={qrcodeDataUrl} alt='WeChat QR code' className='w-160px h-160px rd-8px' />
            ))}
          {loginState === 'scanned' ? (
            <div className='flex items-center gap-6px text-13px text-t-secondary'>
              <Spin size={14} />
              <span>{t('settings.weixin.scanned', 'Scanned, waiting for confirmation...')}</span>
            </div>
          ) : (
            <span className='text-13px text-t-secondary'>
              {t('settings.weixin.scanPrompt', 'Please scan the QR code with WeChat')}
            </span>
          )}
        </div>
      );
    }

    // idle or loading_qr
    return (
      <Button
        type='primary'
        loading={loginState === 'loading_qr'}
        onClick={() => {
          void handleLogin();
        }}
      >
        {t('settings.weixin.loginButton', 'Scan to Login')}
      </Button>
    );
  };

  return (
    <div className='flex flex-col gap-24px'>
      {/* Login / connection status */}
      <PreferenceRow
        label={t('settings.weixin.accountId', 'Account ID')}
        description={
          loginState === 'idle' || loginState === 'loading_qr'
            ? t('settings.weixin.scanPrompt', 'Please scan the QR code with WeChat')
            : undefined
        }
      >
        {renderLoginArea()}
      </PreferenceRow>

      {/* Agent Selection */}
      <PreferenceRow
        label={t('settings.weixin.agent', 'Agent')}
        description={t('settings.weixin.agentDesc', 'Used for WeChat conversations')}
      >
        <Dropdown
          trigger='click'
          position='br'
          droplist={
            <Menu
              selectedKeys={[
                selectedAgent.customAgentId
                  ? `${selectedAgent.backend}|${selectedAgent.customAgentId}`
                  : selectedAgent.backend,
              ]}
            >
              {agentOptions.map((a) => {
                const key = a.customAgentId ? `${a.backend}|${a.customAgentId}` : a.backend;
                return (
                  <Menu.Item
                    key={key}
                    onClick={() => {
                      const currentKey = selectedAgent.customAgentId
                        ? `${selectedAgent.backend}|${selectedAgent.customAgentId}`
                        : selectedAgent.backend;
                      if (key === currentKey) return;
                      const next = {
                        backend: a.backend,
                        customAgentId: a.customAgentId,
                        name: a.name,
                      };
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
            <span className='truncate'>
              {selectedAgent.name ||
                availableAgents.find(
                  (a) =>
                    (a.customAgentId ? `${a.backend}|${a.customAgentId}` : a.backend) ===
                    (selectedAgent.customAgentId
                      ? `${selectedAgent.backend}|${selectedAgent.customAgentId}`
                      : selectedAgent.backend)
                )?.name ||
                selectedAgent.backend}
            </span>
            <Down theme='outline' size={14} />
          </Button>
        </Dropdown>
      </PreferenceRow>

      {/* Default Model Selection */}
      <PreferenceRow
        label={t('settings.assistant.defaultModel', 'Default Model')}
        description={t('settings.weixin.defaultModelDesc', 'Model used for WeChat conversations')}
      >
        <GeminiModelSelector
          selection={isGeminiAgent ? modelSelection : undefined}
          disabled={!isGeminiAgent}
          label={
            !isGeminiAgent
              ? t('settings.assistant.autoFollowCliModel', 'Automatically follow the model when CLI is running')
              : undefined
          }
          variant='settings'
        />
      </PreferenceRow>

      {/* Next Steps Guide - shown when connected but no authorized users yet */}
      {pluginStatus?.connected && authorizedUsers.length === 0 && (
        <div className='bg-blue-50 dark:bg-blue-900/20 rd-12px p-16px border border-blue-200 dark:border-blue-800'>
          <SectionHeader title={t('settings.assistant.nextSteps', 'Next Steps')} />
          <div className='text-14px text-t-secondary space-y-8px'>
            <p className='m-0'>
              <strong>1.</strong> {t('settings.weixin.step1', 'Find and send a message to your bot in WeChat')}
            </p>
            <p className='m-0'>
              <strong>2.</strong>{' '}
              {t(
                'settings.weixin.step2',
                'A pairing request will appear below. Click "Approve" to authorize the user.'
              )}
            </p>
            <p className='m-0'>
              <strong>3.</strong>{' '}
              {t(
                'settings.weixin.step3',
                'Once approved, you can start chatting with the AI assistant through WeChat!'
              )}
            </p>
          </div>
        </div>
      )}

      {/* Pending Pairing Requests */}
      {pluginStatus?.connected && (
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
                      <span className='text-14px font-500 text-t-primary'>{pairing.displayName || 'Unknown User'}</span>
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
          ) : (
            <div className='flex flex-col gap-12px'>
              {authorizedUsers.map((user) => (
                <div key={user.id} className='flex items-center justify-between bg-fill-2 rd-8px p-12px'>
                  <div className='flex-1'>
                    <div className='text-14px font-500 text-t-primary'>{user.displayName || 'Unknown User'}</div>
                    <div className='text-12px text-t-tertiary mt-4px'>
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

export default WeixinConfigForm;
