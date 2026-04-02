/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { Button, Dropdown, Link, Menu, Message, Typography } from '@arco-design/web-react';
import AionModal from '@/renderer/components/base/AionModal';
import { Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import AgentCard from './AgentCard';
import InlineAgentEditor from './InlineAgentEditor';

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Detected agents (filter out custom and remote)
  const { data: detectedAgents } = useSWR('acp.agents.available.settings', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      return result.data.filter((agent) => agent.backend !== 'custom' && agent.backend !== 'remote');
    }
    return [];
  });

  // Custom agents
  const { data: customAgents, mutate: mutateCustomAgents } = useSWR('acp.customAgents.settings', async () => {
    const agents = await ConfigStorage.get('acp.customAgents');
    return ((agents || []) as AcpBackendConfig[]).filter((a) => !a.isPreset);
  });

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AcpBackendConfig | null>(null);

  const handleSaveCustomAgent = useCallback(
    async (agent: AcpBackendConfig) => {
      const current = (await ConfigStorage.get('acp.customAgents')) || [];
      const existingIndex = (current as AcpBackendConfig[]).findIndex((a) => a.id === agent.id);
      const updatedAgents =
        existingIndex >= 0
          ? (current as AcpBackendConfig[]).map((a, i) => (i === existingIndex ? agent : a))
          : [...(current as AcpBackendConfig[]), agent];
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      await mutateCustomAgents();
      setEditorVisible(false);
      setEditingAgent(null);
    },
    [mutateCustomAgents]
  );

  const handleDeleteCustomAgent = useCallback(
    async (agentId: string) => {
      const current = (await ConfigStorage.get('acp.customAgents')) || [];
      const agents = (current as AcpBackendConfig[]).filter((a) => a.id !== agentId || a.isPreset);
      await ConfigStorage.set('acp.customAgents', agents);
      await mutateCustomAgents();
    },
    [mutateCustomAgents]
  );

  const handleToggleCustomAgent = useCallback(
    async (agentId: string, enabled: boolean) => {
      const current = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = (current as AcpBackendConfig[]).map((a) =>
        a.id === agentId && !a.isPreset ? { ...a, enabled } : a
      );
      if (updatedAgents.some((a) => a.id === agentId && !a.isPreset)) {
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        await mutateCustomAgents();
      }
    },
    [mutateCustomAgents]
  );

  // Aion CLI and Gemini CLI first among detected agents
  const geminiAgent = detectedAgents?.find((a) => a.backend === 'gemini');
  const aionrsAgent = detectedAgents?.find((a) => a.backend === 'aionrs');
  const otherDetected = detectedAgents?.filter((a) => a.backend !== 'gemini' && a.backend !== 'aionrs') ?? [];

  return (
    <div className='flex flex-col gap-8px py-16px'>
      {/* Top action bar */}
      <div className='flex items-center justify-between'>
        <span className='text-12px text-t-secondary px-16px'>
          {t('settings.agentManagement.localAgentsDescription')}
          {'  '}
          <Link href='https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup' target='_blank' className='text-12px'>
            {t('settings.agentManagement.localAgentsSetupLink')}
          </Link>
        </span>
        <Dropdown
          droplist={
            <Menu
              onClickMenuItem={(key) => {
                if (key === 'market') {
                  Message.info(t('settings.agentManagement.marketComingSoon'));
                } else if (key === 'custom') {
                  setEditingAgent(null);
                  setEditorVisible(true);
                }
              }}
            >
              <Menu.Item key='market'>{t('settings.agentManagement.installFromMarket')}</Menu.Item>
              <Menu.Item key='custom'>{t('settings.agentManagement.detectCustomAgent')}</Menu.Item>
            </Menu>
          }
          position='bl'
        >
          <Button
            type='outline'
            shape='round'
            size='small'
            icon={<Plus size='16' />}
            className='rd-100px border-1 border-solid border-[var(--color-border-2)] h-34px px-14px text-t-secondary hover:text-t-primary'
          >
            {t('settings.agentManagement.addAgent')}
          </Button>
        </Dropdown>
      </div>

      {/* Detected Agents section */}
      <div className='px-16px mt-8px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.detected')}
        </Typography.Text>
      </div>
      <div className='flex flex-col gap-4px px-0'>
        {aionrsAgent && (
          <AgentCard
            type='detected'
            agent={aionrsAgent}
            settingsDisabled={false}
            onSettings={() => navigate('/settings/aionrs')}
          />
        )}
        {geminiAgent && (
          <AgentCard
            type='detected'
            agent={geminiAgent}
            settingsDisabled={false}
            onSettings={() => navigate('/settings/gemini')}
          />
        )}
        {otherDetected.map((agent) => (
          <AgentCard key={agent.backend} type='detected' agent={agent} />
        ))}
        {(!detectedAgents || detectedAgents.length === 0) && (
          <Typography.Text type='secondary' className='block py-16px text-center text-12px'>
            {t('settings.agentManagement.localAgentsEmpty')}
          </Typography.Text>
        )}
      </div>

      {/* Custom Agents section */}
      {(editorVisible || (customAgents && customAgents.length > 0)) && (
        <div className='px-16px mt-16px'>
          <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
            {t('settings.agentManagement.customAgents')}
          </Typography.Text>
        </div>
      )}

      <AionModal
        visible={editorVisible}
        onCancel={() => {
          setEditorVisible(false);
          setEditingAgent(null);
        }}
        header={{
          title: editingAgent
            ? t('settings.agentManagement.editCustomAgent')
            : t('settings.agentManagement.detectCustomAgent'),
          showClose: true,
        }}
        footer={null}
        style={{ maxWidth: '92vw', borderRadius: 16 }}
        contentStyle={{ background: 'var(--bg-1)', borderRadius: 16, padding: '20px 24px 16px', overflow: 'auto' }}
      >
        <InlineAgentEditor
          agent={editingAgent}
          onSave={(agent) => void handleSaveCustomAgent(agent)}
          onCancel={() => {
            setEditorVisible(false);
            setEditingAgent(null);
          }}
        />
      </AionModal>

      <div className='flex flex-col gap-4px px-0'>
        {customAgents?.map((agent) => (
          <AgentCard
            key={agent.id}
            type='custom'
            agent={agent}
            onEdit={() => {
              setEditingAgent(agent);
              setEditorVisible(true);
            }}
            onDelete={() => void handleDeleteCustomAgent(agent.id)}
            onToggle={(enabled) => void handleToggleCustomAgent(agent.id, enabled)}
          />
        ))}
      </div>
    </div>
  );
};

export default LocalAgents;
