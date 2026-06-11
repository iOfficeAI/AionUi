/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { RemoteAgentConfig, RemoteAgentInput, RemoteAgentProtocol } from '@/common/types/agent/remoteAgentTypes';
import { getDefaultRemoteAgentId, setDefaultRemoteAgentId } from '@/common/utils/defaultRemoteAgent';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import ConnectWizard from '@/renderer/components/settings/ConnectWizard';
import { clearConnectWizardDismissal } from '@/renderer/components/settings/ConnectWizard/connectWizardState';
import { useRemoteAgentHealth } from '@/renderer/hooks/agent/useRemoteAgentHealth';
import { openExternalUrl } from '@/renderer/utils/platform';
import {
  connectErrorI18nKey,
  parseConnectErrorCode,
  stripConnectErrorCode,
} from '@/renderer/utils/remote/connectError';
import {
  Avatar,
  Button,
  Form,
  Input,
  Link,
  Message,
  Modal,
  Select,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from '@arco-design/web-react';
import AionModal from '@/renderer/components/base/AionModal';
import { Attention, Edit, Key, Like, Magic, Plug, Plus, ReduceOne, Refresh, Robot, Speed } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import PluginInstallModal from './PluginInstall';
import { getRemoteProtocolOption, REMOTE_PROTOCOL_OPTIONS } from './remoteAgentProtocolOptions';
import RemoteProviderAuthModal from './RemoteProviderAuthModal';
import LocalOpenCodePanel from './LocalOpenCodePanel';

const FormItem = Form.Item;

const PAIRING_POLL_INTERVAL = 5_000;
const PAIRING_TIMEOUT = 5 * 60 * 1000;
const REMOTE_AGENT_GUIDE_URL = 'https://github.com/iOfficeAI/AionUi/wiki/Remote-Agent-Guide-Chinese';

type PairingState = 'idle' | 'handshaking' | 'pending' | 'timeout';

const formatTimeLeft = (ms: number): string => {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

const statusColor = (status?: string): string => {
  switch (status) {
    case 'connected':
      return 'green';
    case 'pending':
      return 'orange';
    case 'reconnecting':
      return 'orange';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
};

const openRemoteAgentGuide = (): void => {
  void openExternalUrl(REMOTE_AGENT_GUIDE_URL).catch(console.error);
};

const RemoteAgentFormModal: React.FC<{
  visible: boolean;
  editAgent?: RemoteAgentConfig;
  onClose: () => void;
  onSaved: () => void;
}> = ({ visible, editAgent, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<RemoteAgentInput>();
  const [saving, setSaving] = useState(false);
  const [activeProtocol, setActiveProtocol] = useState<RemoteAgentProtocol>('openclaw');
  const [avatar, setAvatar] = useState<string>('\u{1F916}');
  const [pairingState, setPairingState] = useState<PairingState>('idle');
  const [pairingTimeLeft, setPairingTimeLeft] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const countdownRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const savedAgentIdRef = useRef<string>(undefined);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = undefined;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const startPairingPoll = useCallback(
    (agentId: string) => {
      setPairingState('pending');
      setPairingTimeLeft(PAIRING_TIMEOUT);
      const startedAt = Date.now();

      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, PAIRING_TIMEOUT - elapsed);
        setPairingTimeLeft(remaining);
        if (remaining <= 0) {
          stopPolling();
          setPairingState('timeout');
        }
      }, 1_000);

      pollTimerRef.current = setInterval(async () => {
        try {
          const result = await ipcBridge.remoteAgent.handshake.invoke({ id: agentId });
          if (result.status === 'ok') {
            stopPolling();
            setPairingState('idle');
            Message.success(t('settings.remoteAgent.created'));
            onSaved();
            onClose();
          }
          // pending_approval → keep polling
        } catch {
          // ignore, keep polling
        }
      }, PAIRING_POLL_INTERVAL);
    },
    [stopPolling, onSaved, onClose, t]
  );

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validate();
      setSaving(true);

      // 1. Test connection BEFORE saving
      const testResult = await ipcBridge.remoteAgent.testConnection.invoke({
        url: values.url,
        protocol: activeProtocol,
        auth_type: values.auth_type || 'none',
        auth_token: values.auth_token,
        allow_insecure: values.allow_insecure,
      });

      if (!testResult.success) {
        const code = parseConnectErrorCode(testResult.error);
        if (code) {
          Message.error(t(connectErrorI18nKey(code)));
        } else {
          Message.error(t('settings.remoteAgent.testFailed', { error: testResult.error }));
        }
        setSaving(false);
        return;
      }

      // tool_host only applies to opencode; default to 'local'.
      const toolHost: 'local' | 'server' =
        activeProtocol === 'opencode' ? ((values as { tool_host?: 'local' | 'server' }).tool_host ?? 'local') : 'local';
      const payload: RemoteAgentInput = { ...values, protocol: activeProtocol, avatar, tool_host: toolHost };

      let agentId: string;
      if (editAgent) {
        await ipcBridge.remoteAgent.update.invoke({ id: editAgent.id, updates: payload });
        agentId = editAgent.id;
      } else {
        const created = await ipcBridge.remoteAgent.create.invoke(payload);
        agentId = created.id;
      }
      savedAgentIdRef.current = agentId;

      // 2. Run handshake (since we just tested, this should succeed or just update the status to connected)
      if (activeProtocol === 'openclaw' || activeProtocol === 'opencode') {
        setPairingState('handshaking');
        const result = await ipcBridge.remoteAgent.handshake.invoke({ id: agentId });

        if (result.status === 'ok') {
          Message.success(editAgent ? t('settings.remoteAgent.updated') : t('settings.remoteAgent.created'));

          // Refresh model cache in the background for this agent
          if (activeProtocol === 'opencode') {
            ipcBridge.remoteAgent.refreshModels.invoke({ id: agentId }).catch(() => {});
          }

          // Automatically set as default if none exists, to streamline A5 wizard
          if (!getDefaultRemoteAgentId()) {
            setDefaultRemoteAgentId(agentId);
          }

          onSaved();
          onClose();
        } else if (activeProtocol === 'openclaw' && result.status === 'pending_approval') {
          startPairingPoll(agentId);
          onSaved();
        } else {
          const handshakeCode = parseConnectErrorCode(result.error);
          const handshakeError = handshakeCode
            ? t(connectErrorI18nKey(handshakeCode))
            : stripConnectErrorCode(result.error || '') || t('settings.remoteAgent.handshakeFailed');
          Message.warning(
            t('settings.remoteAgent.handshakeWarning', {
              action: editAgent ? t('settings.remoteAgent.updated') : t('settings.remoteAgent.created'),
              error: handshakeError,
            })
          );
          onSaved();
          onClose();
        }
      } else {
        Message.success(editAgent ? t('settings.remoteAgent.updated') : t('settings.remoteAgent.created'));
        onSaved();
        onClose();
      }
    } catch {
      // validation error or API error
    } finally {
      setSaving(false);
    }
  }, [form, editAgent, activeProtocol, avatar, onSaved, onClose, startPairingPoll, t]);

  const handleCancelPairing = useCallback(() => {
    stopPolling();
    setPairingState('idle');
    onSaved();
    onClose();
  }, [stopPolling, onSaved, onClose]);

  // Render pairing waiting UI
  if (pairingState === 'pending' || pairingState === 'timeout') {
    return (
      <AionModal
        visible={visible}
        onCancel={handleCancelPairing}
        header={{
          title: editAgent ? t('settings.remoteAgent.editTitle') : t('settings.remoteAgent.addTitle'),
          showClose: true,
        }}
        style={{ maxWidth: '92vw', borderRadius: 'var(--radius-panel)' }}
        contentStyle={{
          background: 'var(--dialog-fill-0)',
          borderRadius: 'var(--radius-panel)',
          padding: '20px 24px 16px',
          overflow: 'auto',
        }}
        footer={{
          render: () => <Button onClick={handleCancelPairing}>{t('settings.remoteAgent.pendingCancel')}</Button>,
        }}
        afterClose={() => {
          stopPolling();
          setPairingState('idle');
          form.resetFields();
        }}
      >
        <div className='flex flex-col items-center gap-16px py-32px'>
          {pairingState === 'pending' ? (
            <>
              <Spin size={32} />
              <Typography.Text className='text-16px font-medium'>
                {t('settings.remoteAgent.pendingApproval')}
              </Typography.Text>
              <Typography.Text type='secondary'>{t('settings.remoteAgent.pendingApprovalHint')}</Typography.Text>
              <Typography.Text type='secondary' className='text-12px'>
                {t('settings.remoteAgent.pendingTimeRemaining', { time: formatTimeLeft(pairingTimeLeft) })}
              </Typography.Text>
            </>
          ) : (
            <>
              <Typography.Text className='text-16px font-medium' type='warning'>
                {t('settings.remoteAgent.pendingTimeout')}
              </Typography.Text>
            </>
          )}
        </div>
      </AionModal>
    );
  }

  return (
    <AionModal
      visible={visible}
      onCancel={onClose}
      header={{
        title: editAgent ? t('settings.remoteAgent.editTitle') : t('settings.remoteAgent.addTitle'),
        showClose: true,
      }}
      style={{ maxWidth: '92vw', borderRadius: 'var(--radius-panel)' }}
      contentStyle={{
        background: 'var(--dialog-fill-0)',
        borderRadius: 'var(--radius-panel)',
        padding: '20px 24px 16px',
        overflow: 'auto',
      }}
      okText={pairingState === 'handshaking' ? t('settings.remoteAgent.handshaking') : t('settings.remoteAgent.save')}
      cancelText={t('settings.remoteAgent.cancel')}
      onOk={handleSave}
      confirmLoading={saving || pairingState === 'handshaking'}
      afterOpen={() => {
        if (editAgent) {
          setActiveProtocol(editAgent.protocol);
          setAvatar(editAgent.avatar || '\u{1F916}');
          form.setFieldsValue({
            name: editAgent.name,
            url: editAgent.url,
            auth_type: editAgent.auth_type,
            auth_token: editAgent.auth_token,
            allow_insecure: editAgent.allow_insecure,
            tool_host: editAgent.tool_host ?? 'local',
          });
        } else {
          setActiveProtocol('openclaw');
          setAvatar('\u{1F916}');
          form.setFieldsValue({ auth_type: 'none' });
        }
      }}
      afterClose={() => {
        setPairingState('idle');
        form.resetFields();
      }}
    >
      <div className='flex flex-col gap-16px pt-8px pb-20px'>
        <div className='flex gap-10px rounded-12px border border-solid border-[rgba(var(--warning-6),0.14)] bg-[rgba(var(--warning-6),0.08)] px-16px py-12px'>
          <Attention theme='filled' size={16} className='mt-2px shrink-0 text-[rgb(var(--warning-6))]' />
          <div className='min-w-0 text-13px leading-20px text-t-secondary'>
            <span>{t('settings.agentManagement.remoteAgentsDescription')} </span>
            <Link className='text-13px leading-20px' onClick={openRemoteAgentGuide}>
              {t('settings.remoteAgent.guideAction')}
            </Link>
          </div>
        </div>

        {/* Avatar + Name row */}
        <div className='flex items-center gap-12px'>
          <EmojiPicker onChange={(emoji) => setAvatar(emoji)}>
            <div className='cursor-pointer shrink-0'>
              <Avatar
                size={48}
                shape='square'
                style={{ backgroundColor: 'var(--color-fill-2)', fontSize: 24, borderRadius: 'var(--radius-panel)' }}
              >
                {avatar}
              </Avatar>
            </div>
          </EmojiPicker>
          <div className='flex-1 min-w-0'>
            <Form form={form} layout='vertical' autoComplete='off'>
              <FormItem
                field='name'
                rules={[{ required: true, message: t('settings.remoteAgent.nameRequired') }]}
                style={{ marginBottom: 0 }}
              >
                <Input size='large' placeholder={t('settings.remoteAgent.namePlaceholder')} />
              </FormItem>
            </Form>
          </div>
        </div>

        {/* Connection fields */}
        <Form form={form} layout='vertical' autoComplete='off'>
          <FormItem label={t('settings.remoteAgent.protocol')} required>
            <Select
              value={activeProtocol}
              onChange={(value) => setActiveProtocol(value as RemoteAgentProtocol)}
              aria-label={t('settings.remoteAgent.protocol')}
            >
              {REMOTE_PROTOCOL_OPTIONS.map((option) => (
                <Select.Option key={option.value} value={option.value} disabled={option.disabled}>
                  <div className='flex items-center justify-between gap-8px'>
                    <span>{t(`settings.remoteAgent.${option.labelKey}`)}</span>
                    <Tag size='small' color={option.statusKey === 'protocolStable' ? 'green' : 'orange'}>
                      {t(`settings.remoteAgent.${option.statusKey}`)}
                    </Tag>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </FormItem>

          <Typography.Text type='secondary' className='block text-12px leading-18px -mt-8px mb-8px'>
            {t(`settings.remoteAgent.${getRemoteProtocolOption(activeProtocol).hintKey}`)}
          </Typography.Text>

          <FormItem
            label={t('settings.remoteAgent.url')}
            field='url'
            rules={[{ required: true, message: t('settings.remoteAgent.urlRequired') }]}
          >
            <Input placeholder={getRemoteProtocolOption(activeProtocol).urlPlaceholder} />
          </FormItem>

          <FormItem label={t('settings.remoteAgent.authType')} field='auth_type' rules={[{ required: true }]}>
            <Select>
              <Select.Option value='none'>{t('settings.remoteAgent.authNone')}</Select.Option>
              <Select.Option value='bearer'>{t('settings.remoteAgent.authBearer')}</Select.Option>
              <Select.Option value='basic'>{t('settings.remoteAgent.authBasic')}</Select.Option>
              <Select.Option value='password'>{t('settings.remoteAgent.authPassword')}</Select.Option>
            </Select>
          </FormItem>

          <Form.Item shouldUpdate noStyle>
            {(values: Record<string, unknown>) =>
              values.auth_type === 'bearer' || values.auth_type === 'basic' || values.auth_type === 'password' ? (
                <FormItem
                  label={
                    values.auth_type === 'password'
                      ? t('settings.remoteAgent.authPassword')
                      : t('settings.remoteAgent.authToken')
                  }
                  field='auth_token'
                  rules={[{ required: true, message: t('settings.remoteAgent.tokenRequired') }]}
                >
                  <Input.Password
                    placeholder={
                      values.auth_type === 'password'
                        ? t('settings.remoteAgent.passwordPlaceholder')
                        : t('settings.remoteAgent.tokenPlaceholder')
                    }
                  />
                </FormItem>
              ) : null
            }
          </Form.Item>

          <Form.Item shouldUpdate noStyle>
            {(values: Record<string, unknown>) =>
              typeof values.url === 'string' &&
              (values.url.startsWith('wss://') || values.url.startsWith('https://')) ? (
                <FormItem
                  label={t('settings.remoteAgent.allowInsecure')}
                  field='allow_insecure'
                  triggerPropName='checked'
                  extra={
                    <Typography.Text type='secondary' className='text-12px'>
                      {t('settings.remoteAgent.allowInsecureHint')}
                    </Typography.Text>
                  }
                >
                  <Switch />
                </FormItem>
              ) : null
            }
          </Form.Item>

          {activeProtocol === 'opencode' ? (
            <FormItem
              label={t('settings.remoteAgent.toolHost')}
              field='tool_host'
              initialValue='local'
              extra={
                <Typography.Text type='secondary' className='text-12px'>
                  {t('settings.remoteAgent.toolHostHint')}
                </Typography.Text>
              }
            >
              <Select>
                <Select.Option value='local'>{t('settings.remoteAgent.toolHostLocal')}</Select.Option>
                <Select.Option value='server'>{t('settings.remoteAgent.toolHostServer')}</Select.Option>
              </Select>
            </FormItem>
          ) : null}
        </Form>
      </div>
    </AionModal>
  );
};

const RemoteAgentManagement: React.FC = () => {
  const { t } = useTranslation();
  const { data: agents, mutate } = useSWR('remote-agents.list', () => ipcBridge.remoteAgent.list.invoke());
  const { health, refresh: refreshHealth } = useRemoteAgentHealth();
  const [defaultAgentId, setDefaultAgentIdState] = useState<string | null>(() => getDefaultRemoteAgentId());
  const [modalVisible, setModalVisible] = useState(false);
  const [editAgent, setEditAgent] = useState<RemoteAgentConfig>();
  const [providerAgent, setProviderAgent] = useState<RemoteAgentConfig>();
  const [pluginAgent, setPluginAgent] = useState<RemoteAgentConfig>();
  const [wizardVisible, setWizardVisible] = useState(false);
  const remoteActionButtonClassName = '!rounded-10px !px-10px';

  const handleSetDefault = useCallback((id: string | null) => {
    setDefaultRemoteAgentId(id);
    setDefaultAgentIdState(id);
  }, []);

  useEffect(() => {
    if (!agents?.length) return;
    if (defaultAgentId && !agents.some((a) => a.id === defaultAgentId)) {
      handleSetDefault(null);
    }
  }, [agents, defaultAgentId, handleSetDefault]);

  const handleAdd = useCallback(() => {
    setEditAgent(undefined);
    setModalVisible(true);
  }, []);

  const handleEdit = useCallback((agent: RemoteAgentConfig) => {
    setEditAgent(agent);
    setModalVisible(true);
  }, []);

  const handleManageProviders = useCallback((agent: RemoteAgentConfig) => {
    setProviderAgent(agent);
  }, []);

  const handleDelete = useCallback(
    async (agent: RemoteAgentConfig) => {
      Modal.confirm({
        title: t('settings.remoteAgent.deleteConfirm'),
        content: t('settings.remoteAgent.deleteConfirmContent', { name: agent.name }),
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          await ipcBridge.remoteAgent.delete.invoke({ id: agent.id });
          Message.success(t('settings.remoteAgent.deleted'));
          await mutate();
        },
      });
    },
    [t, mutate]
  );

  const handleSaved = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return (
    <div className='flex flex-col gap-16px py-16px'>
      <div className='px-16px'>
        <LocalOpenCodePanel />
      </div>
      <div className='flex flex-wrap items-start justify-between gap-12px'>
        <div className='flex flex-1 flex-wrap items-center gap-x-6px gap-y-2px px-16px'>
          <Typography.Text type='secondary' className='text-12px leading-18px text-t-secondary'>
            {t('settings.agentManagement.remoteAgentsDescription')}
          </Typography.Text>
          <Link className='text-12px leading-18px' onClick={openRemoteAgentGuide}>
            {t('settings.remoteAgent.guideAction')}
          </Link>
        </div>
        <div className='flex items-center gap-8px'>
          <Tooltip content={t('settings.remoteAgent.healthChecking')}>
            <Button
              type='outline'
              shape='round'
              size='small'
              icon={<Refresh size='16' />}
              onClick={() => void refreshHealth()}
              className='rd-100px border-1 border-solid border-[var(--color-border-2)] h-34px px-10px text-t-secondary hover:text-t-primary'
            />
          </Tooltip>
          <Button
            type='outline'
            shape='round'
            size='small'
            icon={<Magic size='16' />}
            onClick={() => setWizardVisible(true)}
            className='rd-100px border-1 border-solid border-[var(--color-border-2)] h-34px px-14px text-t-secondary hover:text-t-primary'
          >
            {t('settings.connectWizard.launchWizard')}
          </Button>
          <Button
            type='outline'
            shape='round'
            size='small'
            icon={<Plus size='16' />}
            onClick={handleAdd}
            className='rd-100px border-1 border-solid border-[var(--color-border-2)] h-34px px-14px text-t-secondary hover:text-t-primary'
          >
            {t('settings.remoteAgent.add')}
          </Button>
        </div>
      </div>

      {!agents || agents.length === 0 ? (
        <div className='flex flex-col items-center gap-12px py-48px'>
          <Typography.Text type='secondary' className='text-14px'>
            {t('settings.remoteAgent.emptyTitle')}
          </Typography.Text>
          <Button
            type='outline'
            shape='round'
            size='small'
            icon={<Plus size='16' />}
            onClick={handleAdd}
            className='rd-100px border-1 border-solid border-[var(--color-border-2)] h-34px px-14px text-t-secondary hover:text-t-primary'
          >
            {t('settings.remoteAgent.emptyAction')}
          </Button>
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-12px px-16px md:grid-cols-2 xl:grid-cols-3'>
          {agents.map((agent) => (
            <div
              key={agent.id}
              className='flex min-h-[214px] flex-col rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-14px transition-colors hover:border-[var(--color-border-3)]'
            >
              <div className='mb-12px flex justify-center'>
                <Avatar
                  size={48}
                  shape='square'
                  style={{ backgroundColor: 'var(--color-fill-2)', fontSize: 24, flexShrink: 0 }}
                >
                  {agent.avatar || <Robot theme='outline' size='18' />}
                </Avatar>
              </div>

              <div className='mb-10px text-center'>
                <Typography.Text className='block text-14px font-medium leading-20px line-clamp-2'>
                  {agent.name}
                </Typography.Text>
              </div>

              <div className='mb-10px flex min-h-[24px] flex-wrap items-center justify-center gap-6px'>
                {agent.status && agent.status !== 'unknown' && (
                  <Tag size='small' color={statusColor(agent.status)}>
                    {agent.status}
                  </Tag>
                )}
                <Tag size='small' color='arcoblue'>
                  {agent.protocol}
                </Tag>
                {defaultAgentId === agent.id && (
                  <Tag size='small' color='orangered'>
                    {t('settings.remoteAgent.defaultBadge')}
                  </Tag>
                )}
              </div>
              {(() => {
                const entry = health[agent.id];
                const loading = entry === 'loading';
                if (!entry) return null;
                const color = loading ? 'gray' : entry.healthy ? 'green' : 'red';
                return (
                  <Tooltip
                    content={
                      !loading && entry.error
                        ? entry.error
                        : !loading
                          ? t('settings.remoteAgent.healthLatency', { ms: entry.latency_ms })
                          : t('settings.remoteAgent.healthChecking')
                    }
                  >
                    <Tag size='small' color={color} className='mx-auto mb-8px'>
                      {loading
                        ? t('settings.remoteAgent.healthChecking')
                        : entry.healthy
                          ? t('settings.remoteAgent.healthHealthy')
                          : t('settings.remoteAgent.healthUnhealthy')}
                    </Tag>
                  </Tooltip>
                );
              })()}

              <Typography.Text
                type='secondary'
                className='mb-14px block min-h-[36px] text-center text-12px line-clamp-2'
              >
                {agent.url}
              </Typography.Text>

              <div className='mt-auto flex flex-col gap-8px'>
                {agent.protocol === 'opencode' ? (
                  <>
                    <Button
                      size='small'
                      type='secondary'
                      icon={<Key theme='outline' size='14' />}
                      className={remoteActionButtonClassName}
                      onClick={() => handleManageProviders(agent)}
                    >
                      {t('settings.remoteAgent.providers.manage')}
                    </Button>
                    <Button
                      size='small'
                      type='secondary'
                      icon={<Plug theme='outline' size='14' />}
                      className={remoteActionButtonClassName}
                      onClick={() => setPluginAgent(agent)}
                    >
                      {t('settings.remoteAgent.plugin.installButton')}
                    </Button>
                  </>
                ) : null}
                <div className='grid grid-cols-2 gap-8px'>
                  <Button
                    size='small'
                    type='secondary'
                    icon={<Edit theme='outline' size='14' />}
                    className={remoteActionButtonClassName}
                    onClick={() => handleEdit(agent)}
                  >
                    {t('common.edit', { defaultValue: 'Edit' })}
                  </Button>
                  <Button
                    size='small'
                    type='secondary'
                    status='danger'
                    icon={<ReduceOne theme='outline' size='14' />}
                    className={remoteActionButtonClassName}
                    onClick={() => void handleDelete(agent)}
                  >
                    {t('common.delete', { defaultValue: 'Delete' })}
                  </Button>
                </div>
                <Button
                  size='small'
                  type='text'
                  icon={<Like theme='outline' size='12' />}
                  onClick={() => handleSetDefault(defaultAgentId === agent.id ? null : agent.id)}
                  className='!rounded-10px !px-10px text-t-secondary hover:text-t-primary'
                >
                  {defaultAgentId === agent.id
                    ? t('settings.remoteAgent.clearDefault')
                    : t('settings.remoteAgent.setDefault')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RemoteAgentFormModal
        visible={modalVisible}
        editAgent={editAgent}
        onClose={() => setModalVisible(false)}
        onSaved={handleSaved}
      />
      <RemoteProviderAuthModal
        visible={Boolean(providerAgent)}
        agent={providerAgent}
        onClose={() => setProviderAgent(undefined)}
      />
      <PluginInstallModal
        visible={Boolean(pluginAgent)}
        agent={pluginAgent}
        onClose={() => setPluginAgent(undefined)}
      />
      <ConnectWizard
        visible={wizardVisible}
        onClose={() => setWizardVisible(false)}
        onCompleted={() => {
          clearConnectWizardDismissal();
          void mutate();
        }}
      />
    </div>
  );
};

export default RemoteAgentManagement;
