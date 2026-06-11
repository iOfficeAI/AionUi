/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { LocalOpenCodeInstance, LocalOpenCodeStatus } from '@/common/types/agent/localOpenCodeTypes';
import {
  Button,
  Card,
  Empty,
  Input,
  Message,
  Modal,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from '@arco-design/web-react';
import { Plus, Power, Refresh, Robot } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

const { Text } = Typography;

const statusColor = (status: LocalOpenCodeStatus): string => {
  switch (status) {
    case 'running':
      return 'green';
    case 'starting':
      return 'orange';
    case 'crashed':
      return 'red';
    default:
      return 'gray';
  }
};

const statusBorderColor = (status: LocalOpenCodeStatus): string => {
  switch (status) {
    case 'running':
      return 'var(--color-success-6)';
    case 'starting':
      return 'var(--color-warning-6)';
    case 'crashed':
      return 'var(--color-danger-6)';
    default:
      return 'var(--color-neutral-4)';
  }
};

const LocalOpenCodePanel: React.FC = () => {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showStartModal, setShowStartModal] = useState(false);

  const {
    data: listData,
    isLoading,
    mutate: refreshList,
  } = useSWR('local-opencode-list', () => ipcBridge.localOpenCode.list.invoke(), {
    refreshInterval: 10_000,
  });

  const instances = listData?.instances ?? [];

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      await ipcBridge.localOpenCode.start.invoke({
        name: nameInput.trim() || undefined,
      });
      Message.success(t('settings.localOpenCode.startSuccess'));
      setShowStartModal(false);
      setNameInput('');
      void refreshList();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('settings.localOpenCode.startError'));
    } finally {
      setStarting(false);
    }
  }, [nameInput, refreshList, t]);

  const handleStop = useCallback(
    async (id: string) => {
      try {
        await ipcBridge.localOpenCode.stop.invoke({ id });
        Message.success(t('settings.localOpenCode.stopSuccess'));
        void refreshList();
      } catch (err) {
        Message.error(err instanceof Error ? err.message : t('settings.localOpenCode.stopError'));
      }
    },
    [refreshList, t]
  );

  const handleRestart = useCallback(
    async (id: string) => {
      try {
        await ipcBridge.localOpenCode.restart.invoke({ id });
        Message.success(t('settings.localOpenCode.restartSuccess'));
        void refreshList();
      } catch (err) {
        Message.error(err instanceof Error ? err.message : t('settings.localOpenCode.restartError'));
      }
    },
    [refreshList, t]
  );

  return (
    <Card
      title={t('settings.localOpenCode.title')}
      extra={
        <Button type='primary' size='small' icon={<Plus />} onClick={() => setShowStartModal(true)}>
          {t('settings.localOpenCode.start')}
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      {isLoading ? (
        <Spin style={{ display: 'block', padding: 24 }} />
      ) : instances.length === 0 ? (
        <Empty description={t('settings.localOpenCode.empty')} style={{ padding: 24 }} />
      ) : (
        <Space direction='vertical' style={{ width: '100%' }} size={8}>
          {instances.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} onStop={handleStop} onRestart={handleRestart} />
          ))}
        </Space>
      )}

      <Modal
        title={t('settings.localOpenCode.startTitle')}
        visible={showStartModal}
        onCancel={() => setShowStartModal(false)}
        onOk={handleStart}
        confirmLoading={starting}
        okText={t('settings.localOpenCode.start')}
      >
        <div style={{ marginBottom: 8 }}>
          <Text>{t('settings.localOpenCode.nameLabel')}</Text>
        </div>
        <Input
          placeholder={t('settings.localOpenCode.namePlaceholder')}
          value={nameInput}
          onChange={setNameInput}
          maxLength={64}
        />
      </Modal>
    </Card>
  );
};

const InstanceCard: React.FC<{
  instance: LocalOpenCodeInstance;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
}> = ({ instance, onStop, onRestart }) => {
  const { t } = useTranslation();
  const isRunning = instance.status === 'running' || instance.status === 'starting';

  return (
    <Card size='small' style={{ borderLeft: `3px solid ${statusBorderColor(instance.status)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Robot size={20} />
          <Text className='font-medium'>{instance.name}</Text>
          <Tag color={statusColor(instance.status)} size='small'>
            {t(`settings.localOpenCode.status.${instance.status}`)}
          </Tag>
          {instance.port > 0 && (
            <Tag size='small' color='arcoblue'>
              :{instance.port}
            </Tag>
          )}
          {instance.pid != null && (
            <Text type='secondary' style={{ fontSize: 12 }}>
              PID {instance.pid}
            </Text>
          )}
        </Space>
        <Text type='secondary' style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
          {t('settings.localOpenCode.agentId', { id: instance.agent_id })}
        </Text>
        <Space>
          {isRunning ? (
            <Tooltip content={t('settings.localOpenCode.stopTooltip')}>
              <Button size='mini' status='danger' icon={<Power />} onClick={() => onStop(instance.id)} />
            </Tooltip>
          ) : (
            <Tooltip content={t('settings.localOpenCode.restartTooltip')}>
              <Button size='mini' icon={<Refresh />} onClick={() => onRestart(instance.id)} />
            </Tooltip>
          )}
        </Space>
      </div>
    </Card>
  );
};

export default LocalOpenCodePanel;
