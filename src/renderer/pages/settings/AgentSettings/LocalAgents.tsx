/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { Button, Typography } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import AgentCard from './AgentCard';
import InlineAgentEditor from './InlineAgentEditor';

const HIDDEN_LOCAL_AGENT_BACKENDS = new Set(['copilot', 'github-copilot']);
const HIDDEN_LOCAL_AGENT_NAMES = new Set(['github copilot']);

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Detected agents (include built-in backends and extension-contributed agents, exclude user custom and remote)
  const { data: detectedAgents } = useSWR('acp.agents.available.settings', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success && result.data) {
      return result.data.filter((agent) => agent.backend !== 'remote' && agent.backend !== 'custom' && !agent.isPreset);
    }
    return [];
  });

  // Custom agents (user-defined, stored in 'acp.customAgents')
  const { data: customAgents, mutate: mutateCustomAgents } = useSWR('acp.customAgents.settings', async () => {
    const agents = await ConfigStorage.get('acp.customAgents');
    return (agents || []) as AcpBackendConfig[];
  });

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AcpBackendConfig | null>(null);

  const handleSaveCustomAgent = useCallback(
    async (agent: AcpBackendConfig) => {
      const current = ((await ConfigStorage.get('acp.customAgents')) || []) as AcpBackendConfig[];
      const existingIndex = current.findIndex((a) => a.id === agent.id);
      const updatedAgents =
        existingIndex >= 0 ? current.map((a, i) => (i === existingIndex ? agent : a)) : [...current, agent];
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      await mutateCustomAgents();
      setEditorVisible(false);
      setEditingAgent(null);
    },
    [mutateCustomAgents]
  );

  const handleDeleteCustomAgent = useCallback(
    async (agentId: string) => {
      const current = ((await ConfigStorage.get('acp.customAgents')) || []) as AcpBackendConfig[];
      const agents = current.filter((a) => a.id !== agentId);
      await ConfigStorage.set('acp.customAgents', agents);
      await mutateCustomAgents();
    },
    [mutateCustomAgents]
  );

  const handleToggleCustomAgent = useCallback(
    async (agentId: string, enabled: boolean) => {
      const current = ((await ConfigStorage.get('acp.customAgents')) || []) as AcpBackendConfig[];
      const updatedAgents = current.map((a) => (a.id === agentId ? { ...a, enabled } : a));
      if (updatedAgents.some((a) => a.id === agentId)) {
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        await mutateCustomAgents();
      }
    },
    [mutateCustomAgents]
  );

  // Aion CLI first among detected agents
  const aionrsAgent = detectedAgents?.find((a) => a.backend === 'aionrs');
  const otherDetected =
    detectedAgents?.filter((agent) => {
      if (agent.backend === 'aionrs') {
        return false;
      }
      if (HIDDEN_LOCAL_AGENT_BACKENDS.has(agent.backend)) {
        return false;
      }
      return !HIDDEN_LOCAL_AGENT_NAMES.has(agent.name.trim().toLowerCase());
    }) ?? [];

  const openCustomAgentEditor = useCallback(() => {
    setEditingAgent(null);
    setEditorVisible(true);
  }, []);

  const handleAddCursorCookbookAgent = useCallback(async () => {
    const current = ((await ConfigStorage.get('acp.customAgents')) || []) as AcpBackendConfig[];
    const existing = current.find((agent) => agent.id === 'cursor-cookbook');
    if (existing) {
      setEditingAgent(existing);
      setEditorVisible(true);
      return;
    }

    const preset: AcpBackendConfig = {
      id: 'cursor-cookbook',
      name: 'Cursor Cookbook',
      avatar: '📚',
      defaultCliPath: 'agent',
      acpArgs: ['acp'],
      enabled: true,
    };

    await ConfigStorage.set('acp.customAgents', [...current, preset]);
    await mutateCustomAgents();
  }, [mutateCustomAgents]);

  return (
    <div className='flex flex-col gap-8px py-16px'>
      <div className='px-16px text-12px text-t-secondary'>
        <span>{t('settings.agentManagement.localAgentsDescription')} </span>
        <Button
          type='text'
          size='mini'
          className='!h-auto !p-0 !align-baseline !text-12px !font-normal !text-primary-6 hover:!text-primary-7 hover:!underline underline-offset-2'
          onClick={openCustomAgentEditor}
        >
          {t('settings.agentManagement.detectCustomAgent')}
        </Button>
        <span className='mx-6px'>·</span>
        <Button
          type='text'
          size='mini'
          className='!h-auto !p-0 !align-baseline !text-12px !font-normal !text-primary-6 hover:!text-primary-7 hover:!underline underline-offset-2'
          onClick={() => void handleAddCursorCookbookAgent()}
        >
          {t('settings.agentManagement.addCursorCookbookAgent')}
        </Button>
      </div>

      {/* Detected Agents section */}
      <div className='px-16px mt-8px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.detected')}
        </Typography.Text>
      </div>
      <div className='grid grid-cols-2 gap-10px px-16px md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
        {aionrsAgent && (
          <AgentCard
            type='detected'
            agent={aionrsAgent}
            settingsDisabled={false}
            onSettings={() => navigate('/settings/aionrs')}
            variant='grid'
          />
        )}
        {otherDetected.map((agent) => (
          <AgentCard key={agent.backend} type='detected' agent={agent} variant='grid' />
        ))}
      </div>
      {(!detectedAgents || detectedAgents.length === 0) && (
        <Typography.Text type='secondary' className='block px-16px py-16px text-center text-12px'>
          {t('settings.agentManagement.localAgentsEmpty')}
        </Typography.Text>
      )}

      {/* Custom Agents section */}
      {(editorVisible || (customAgents && customAgents.length > 0)) && (
        <div className='px-16px mt-16px'>
          <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
            {t('settings.agentManagement.customAgents', { defaultValue: 'Custom Runtimes' })}
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
        contentStyle={{
          background: 'var(--dialog-fill-0)',
          borderRadius: 16,
          padding: '20px 24px 16px',
          overflow: 'auto',
        }}
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
