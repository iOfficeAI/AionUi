/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { RemoteAgentConfig, RemoteAgentInput } from '@process/agent/remote/types';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import {
  Avatar,
  Button,
  Collapse,
  Form,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { Edit, Plus, ReduceOne, Robot, Speed } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

const FormItem = Form.Item;

const PAIRING_POLL_INTERVAL = 5_000;
const PAIRING_TIMEOUT = 5 * 60 * 1000;

type PairingState = 'idle' | 'handshaking' | 'pending' | 'timeout';

const RemoteAgentFormModal: React.FC<{
  visible: boolean;
  editAgent?: RemoteAgentConfig;
  onClose: () => void;
  onSaved: () => void;
}> = ({ visible, editAgent, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<RemoteAgentInput>();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeProtocol, setActiveProtocol] = useState<string>('openclaw');
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

  const handleTestConnection = useCallback(async () => {
    const values = form.getFieldsValue(['url', 'authType', 'authToken']) as {
      url?: string;
      authType?: string;
      authToken?: string;
    };
    if (!values.url) {
      Message.warning(t('settings.remoteAgent.urlRequired'));
      return;
    }
    setTesting(true);
    try {
      const result = await ipcBridge.remoteAgent.testConnection.invoke({
        url: values.url,
        authType: values.authType || 'none',
        authToken: values.authToken,
      });
      if (result.success) {
        Message.success(t('settings.remoteAgent.testSuccess'));
      } else {
        Message.error(t('settings.remoteAgent.testFailed', { error: result.error }));
      }
    } catch (error) {
      Message.error(t('settings.remoteAgent.testError', { error: String(error) }));
    } finally {
      setTesting(false);
    }
  }, [form, t]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validate();
      setSaving(true);
      const payload: RemoteAgentInput = { ...values, protocol: activeProtocol as RemoteAgentInput['protocol'], avatar };

      let agentId: string;
      if (editAgent) {
        await ipcBridge.remoteAgent.update.invoke({ id: editAgent.id, updates: payload });
        agentId = editAgent.id;
      } else {
        const created = await ipcBridge.remoteAgent.create.invoke(payload);
        agentId = created.id;
      }
      savedAgentIdRef.current = agentId;

      // For openclaw protocol, perform full handshake
      if (activeProtocol === 'openclaw') {
        setPairingState('handshaking');
        const result = await ipcBridge.remoteAgent.handshake.invoke({ id: agentId });

        if (result.status === 'ok') {
          Message.success(editAgent ? t('settings.remoteAgent.updated') : t('settings.remoteAgent.created'));
          onSaved();
          onClose();
        } else if (result.status === 'pending_approval') {
          startPairingPoll(agentId);
          onSaved(); // refresh list to show 'pending' status
        } else {
          Message.warning(
            `${editAgent ? t('settings.remoteAgent.updated') : t('settings.remoteAgent.created')} — ${result.error || 'Handshake failed'}`
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

  const formatTimeLeft = (ms: number): string => {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  // Render pairing waiting UI
  if (pairingState === 'pending' || pairingState === 'timeout') {
    return (
      <Modal
        visible={visible}
        title={editAgent ? t('settings.remoteAgent.editTitle') : t('settings.remoteAgent.addTitle')}
        onCancel={handleCancelPairing}
        autoFocus={false}
        style={{ width: 520 }}
        footer={<Button onClick={handleCancelPairing}>{t('settings.remoteAgent.pendingCancel')}</Button>}
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
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      title={editAgent ? t('settings.remoteAgent.editTitle') : t('settings.remoteAgent.addTitle')}
      onCancel={onClose}
      autoFocus={false}
      style={{ width: 520 }}
      footer={
        <Space>
          <Button onClick={onClose}>{t('settings.remoteAgent.cancel')}</Button>
          <Button type='primary' loading={saving || pairingState === 'handshaking'} onClick={handleSave}>
            {pairingState === 'handshaking' ? t('settings.remoteAgent.handshaking') : t('settings.remoteAgent.save')}
          </Button>
        </Space>
      }
      afterOpen={() => {
        if (editAgent) {
          setActiveProtocol(editAgent.protocol);
          setAvatar(editAgent.avatar || '\u{1F916}');
          form.setFieldsValue({
            name: editAgent.name,
            url: editAgent.url,
            authType: editAgent.authType,
            authToken: editAgent.authToken,
            description: editAgent.description,
          });
        } else {
          setActiveProtocol('openclaw');
          setAvatar('\u{1F916}');
          form.setFieldsValue({ authType: 'none' });
        }
      }}
      afterClose={() => {
        setPairingState('idle');
        form.resetFields();
      }}
    >
      {/* Protocol tabs at top */}
      <Tabs
        activeTab={activeProtocol}
        onChange={(key) => setActiveProtocol(key)}
        type='line'
        className='mb-16px settings-remote-tabs'
      >
        <Tabs.TabPane
          key='openclaw'
          title={
            <span
              className={`inline-flex items-center gap-6px transition-colors ${activeProtocol === 'openclaw' ? 'text-t-primary font-600' : 'text-t-secondary'}`}
            >
              OpenClaw
            </span>
          }
        />
      </Tabs>

      {/* Avatar + Name row */}
      <div className='flex items-start gap-12px mb-16px'>
        <EmojiPicker onChange={(emoji) => setAvatar(emoji)}>
          <div className='cursor-pointer shrink-0'>
            <Avatar size={48} shape='square' style={{ backgroundColor: 'var(--color-fill-2)', fontSize: 24 }}>
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
        <FormItem
          label={t('settings.remoteAgent.url')}
          field='url'
          rules={[{ required: true, message: t('settings.remoteAgent.urlRequired') }]}
        >
          <Input size='large' placeholder='wss://example.com/gateway' />
        </FormItem>

        <FormItem label={t('settings.remoteAgent.authType')} field='authType' rules={[{ required: true }]}>
          <Select size='large'>
            <Select.Option value='none'>{t('settings.remoteAgent.authNone')}</Select.Option>
            <Select.Option value='bearer'>{t('settings.remoteAgent.authBearer')}</Select.Option>
          </Select>
        </FormItem>

        <Form.Item shouldUpdate noStyle>
          {(values: Record<string, unknown>) =>
            values.authType === 'bearer' ? (
              <FormItem
                label={t('settings.remoteAgent.authToken')}
                field='authToken'
                rules={[{ required: true, message: t('settings.remoteAgent.tokenRequired') }]}
              >
                <Input.Password size='large' placeholder={t('settings.remoteAgent.tokenPlaceholder')} />
              </FormItem>
            ) : null
          }
        </Form.Item>

        <FormItem label={t('settings.remoteAgent.description')} field='description'>
          <Input.TextArea
            placeholder={t('settings.remoteAgent.descriptionPlaceholder')}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </FormItem>

        <Button
          long
          type='outline'
          size='large'
          icon={<Speed theme='outline' size='14' />}
          loading={testing}
          onClick={handleTestConnection}
        >
          {t('settings.remoteAgent.testConnection')}
        </Button>
      </Form>
    </Modal>
  );
};

const RemoteAgentManagement: React.FC = () => {
  const { t } = useTranslation();
  const { data: agents, mutate } = useSWR('remote-agents.list', () => ipcBridge.remoteAgent.list.invoke());
  const [modalVisible, setModalVisible] = useState(false);
  const [editAgent, setEditAgent] = useState<RemoteAgentConfig>();

  const handleAdd = useCallback(() => {
    setEditAgent(undefined);
    setModalVisible(true);
  }, []);

  const handleEdit = useCallback((agent: RemoteAgentConfig) => {
    setEditAgent(agent);
    setModalVisible(true);
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

  const statusColor = (status?: string): string => {
    switch (status) {
      case 'connected':
        return 'green';
      case 'pending':
        return 'orange';
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <Collapse.Item
      name='remote-agents'
      header={<span className='font-medium'>{t('settings.remoteAgent.title')}</span>}
      extra={
        <Button
          size='mini'
          type='text'
          icon={<Plus theme='outline' size='14' />}
          onClick={(e) => {
            e.stopPropagation();
            handleAdd();
          }}
        >
          {t('settings.remoteAgent.add')}
        </Button>
      }
    >
      {!agents || agents.length === 0 ? (
        <Typography.Text type='secondary' className='block py-16px text-center'>
          {t('settings.remoteAgent.empty')}
        </Typography.Text>
      ) : (
        <div className='flex flex-col gap-8px'>
          {agents.map((agent) => (
            <div
              key={agent.id}
              className='flex items-center justify-between px-12px py-10px rd-8px bg-aou-1 hover:bg-aou-2'
            >
              <div className='flex items-center gap-10px min-w-0 flex-1'>
                <Avatar
                  size={32}
                  shape='square'
                  style={{ backgroundColor: 'var(--color-fill-2)', fontSize: 16, flexShrink: 0 }}
                >
                  {agent.avatar || <Robot theme='outline' size='16' />}
                </Avatar>
                <div className='flex flex-col gap-2px min-w-0 flex-1'>
                  <div className='flex items-center gap-8px'>
                    <Typography.Text className='font-medium text-14px truncate'>{agent.name}</Typography.Text>
                    {agent.status && agent.status !== 'unknown' && (
                      <Tag size='small' color={statusColor(agent.status)}>
                        {agent.status}
                      </Tag>
                    )}
                    <Tag size='small' color='arcoblue'>
                      {agent.protocol}
                    </Tag>
                  </div>
                  <Typography.Text type='secondary' className='text-12px truncate'>
                    {agent.url}
                  </Typography.Text>
                </div>
              </div>
              <Space size={4}>
                <Button
                  size='mini'
                  type='text'
                  icon={<Edit theme='outline' size='14' />}
                  onClick={() => handleEdit(agent)}
                />
                <Button
                  size='mini'
                  type='text'
                  status='danger'
                  icon={<ReduceOne theme='outline' size='14' />}
                  onClick={() => void handleDelete(agent)}
                />
              </Space>
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
    </Collapse.Item>
  );
};

export default RemoteAgentManagement;
