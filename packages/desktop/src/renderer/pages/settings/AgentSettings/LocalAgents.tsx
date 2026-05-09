/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { Button, Typography } from '@arco-design/web-react';
import { Home, Plus } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import AgentCard from './AgentCard';
import { AgentHubModal } from './AgentHubModal';
import InlineAgentEditor from './InlineAgentEditor';

// Convert a backend AgentMetadata row (agent_source === 'custom') to the
// shape InlineAgentEditor expects, so editing pre-fills the form correctly.
// The `advanced` bag carries columns that are not covered by the 5 basic
// form fields so the JSON panel can round-trip them unchanged.
function agentMetadataToEditorShape(a: AgentMetadata): AcpBackendConfig {
  const envRecord: Record<string, string> = {};
  for (const entry of a.env ?? []) {
    envRecord[entry.name] = entry.value;
  }
  const advanced: AcpBackendConfig['advanced'] = {};
  if (a.yolo_id) advanced.yolo_id = a.yolo_id;
  if (a.native_skills_dirs && a.native_skills_dirs.length > 0) {
    advanced.native_skills_dirs = a.native_skills_dirs;
  }
  if (a.behavior_policy && Object.keys(a.behavior_policy).length > 0) {
    advanced.behavior_policy = a.behavior_policy;
  }
  if (a.description) advanced.description = a.description;
  return {
    id: a.id,
    name: a.name,
    avatar: a.icon,
    defaultCliPath: a.command ?? '',
    enabled: a.enabled,
    acpArgs: a.args,
    env: Object.keys(envRecord).length > 0 ? envRecord : undefined,
    advanced: Object.keys(advanced).length > 0 ? advanced : undefined,
  };
}

// Convert the editor's AcpBackendConfig back into the backend's
// CustomAgentUpsertRequest body shape (sans id).
function editorShapeToUpsertBody(a: AcpBackendConfig) {
  const envArray = Object.entries(a.env ?? {}).map(([name, value]) => ({ name, value }));
  return {
    name: a.name,
    command: a.defaultCliPath ?? '',
    icon: a.avatar,
    args: a.acpArgs,
    env: envArray.length > 0 ? envArray : undefined,
    advanced: a.advanced,
  };
}

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hubModalVisible, setHubModalVisible] = useState(false);

  // Single fetch for all agents; both detected and custom lists are derived from it.
  const { data: allAgents, mutate: mutateAgents } = useSWR('acp.agents.available.settings', async () => {
    const agents = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    return Array.isArray(agents) ? agents : [];
  });

  const detectedAgents = (allAgents ?? []).filter((a) => a.agent_type !== 'remote' && a.agent_source !== 'custom');

  const customAgents: AcpBackendConfig[] = (allAgents ?? [])
    .filter((a) => a.agent_source === 'custom')
    .map(agentMetadataToEditorShape);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AcpBackendConfig | null>(null);

  const handleSaveCustomAgent = useCallback(
    async (agent: AcpBackendConfig) => {
      const body = editorShapeToUpsertBody(agent);
      try {
        if (editingAgent) {
          await ipcBridge.acpConversation.updateCustomAgent.invoke({ id: editingAgent.id, ...body });
        } else {
          await ipcBridge.acpConversation.createCustomAgent.invoke(body);
        }
        await mutateAgents();
        setEditorVisible(false);
        setEditingAgent(null);
      } catch (err) {
        // Surface backend rejection (e.g. cli_not_found / acp_init_failed) without crashing.
        console.error('save custom agent failed:', err);
      }
    },
    [editingAgent, mutateAgents]
  );

  const handleDeleteCustomAgent = useCallback(
    async (agentId: string) => {
      try {
        await ipcBridge.acpConversation.deleteCustomAgent.invoke({ id: agentId });
        await mutateAgents();
      } catch (err) {
        console.error('delete custom agent failed:', err);
      }
    },
    [mutateAgents]
  );

  const handleToggleCustomAgent = useCallback(
    async (agentId: string, enabled: boolean) => {
      try {
        await ipcBridge.acpConversation.setAgentEnabled.invoke({ id: agentId, enabled });
        await mutateAgents();
      } catch (err) {
        console.error('toggle custom agent failed:', err);
      }
    },
    [mutateAgents]
  );

  // Aion CLI first among detected agents
  const aionrsAgent = detectedAgents?.find((a) => a.agent_type === 'aionrs' || a.backend === 'aionrs');
  const otherDetected = detectedAgents?.filter((a) => a.agent_type !== 'aionrs' && a.backend !== 'aionrs') ?? [];

  const openCustomAgentEditor = useCallback(() => {
    setEditingAgent(null);
    setEditorVisible(true);
  }, []);

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
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className='px-16px mt-8px'>
          <div className='flex flex-col gap-14px rounded-16px border border-solid border-[rgba(var(--primary-6),0.18)] bg-[rgba(var(--primary-6),0.06)] p-16px md:flex-row md:items-center md:justify-between'>
            <div className='flex items-center gap-12px'>
              <div className='flex h-40px w-40px items-center justify-center leading-none rounded-12px border border-solid border-[rgba(var(--primary-6),0.12)] bg-[rgba(var(--primary-6),0.10)] text-primary-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]'>
                <Home theme='outline' size='20' strokeWidth={2} className='block' />
              </div>
              <div className='min-w-0'>
                <Typography.Text className='mb-4px block text-15px font-medium text-t-primary'>
                  {t('settings.agentManagement.installFromMarket')}
                </Typography.Text>
                <Typography.Text className='block text-12px leading-18px text-t-secondary'>
                  {t('settings.agentManagement.discoverMoreAgents')}
                </Typography.Text>
              </div>
            </div>

            <Button
              type='primary'
              size='small'
              icon={<Plus size='14' />}
              className='!rounded-10px md:!min-w-144px'
              onClick={() => setHubModalVisible(true)}
            >
              {t('settings.agentManagement.installFromMarket')}
            </Button>
          </div>
        </div>
      )}

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
          <AgentCard key={agent.backend || agent.agent_type} type='detected' agent={agent} variant='grid' />
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
            {t('settings.agentManagement.customAgents', { defaultValue: 'Custom Agents' })}
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
        {/* Conditional mount + key unmounts the editor on close so the
            next `创建自定义 Agent` click always starts from a blank form.
            The inner useEffect([agent]) only resets when the `agent`
            reference changes; two consecutive `null` values would not
            retrigger it. */}
        {editorVisible && (
          <InlineAgentEditor
            key={editingAgent?.id ?? 'new'}
            agent={editingAgent}
            onSave={(agent) => void handleSaveCustomAgent(agent)}
            onCancel={() => {
              setEditorVisible(false);
              setEditingAgent(null);
            }}
          />
        )}
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

      {hubModalVisible && <AgentHubModal visible={hubModalVisible} onCancel={() => setHubModalVisible(false)} />}
    </div>
  );
};

export default LocalAgents;
