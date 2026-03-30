/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ipcBridge } from '@/common';
import { Button, Link, Message, Modal, Typography } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR, { mutate } from 'swr';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { acpConversation } from '@/common/adapter/ipcBridge';
import AgentCard from './AgentCard';
import InlineAgentEditor from './InlineAgentEditor';

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [message, messageContext] = Message.useMessage();

  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AcpBackendConfig | null>(null);

  // Detected agents (filter out custom and remote)
  const { data: detectedAgents } = useSWR('acp.agents.available.settings', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      return result.data.filter((agent) => agent.backend !== 'custom' && agent.backend !== 'remote');
    }
    return [];
  });

  const loadCustomAgents = useCallback(async () => {
    try {
      const agents = await ConfigStorage.get('acp.customAgents');
      if (agents && Array.isArray(agents)) {
        setCustomAgents(agents.filter((a) => !a.isPreset));
      }
    } catch {
      // Config not yet initialized
    }
  }, []);

  useEffect(() => {
    void loadCustomAgents();
  }, [loadCustomAgents]);

  const refreshAgentDetection = useCallback(async () => {
    try {
      await acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
      await mutate('acp.agents.available.settings');
    } catch {
      // Refresh failed — UI will update on next page load
    }
  }, []);

  /**
   * Save a custom agent while preserving preset agents in the config array.
   * Always reads the full config before writing to prevent data loss.
   */
  const handleSaveAgent = useCallback(
    async (agentData: AcpBackendConfig) => {
      try {
        const allAgents: AcpBackendConfig[] = (await ConfigStorage.get('acp.customAgents')) || [];

        let updatedAgents: AcpBackendConfig[];
        if (editingAgent) {
          updatedAgents = allAgents.map((agent) => (agent.id === editingAgent.id ? agentData : agent));
        } else {
          updatedAgents = [...allAgents, agentData];
        }

        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setCustomAgents(updatedAgents.filter((a) => !a.isPreset));
        setShowEditor(false);
        setEditingAgent(null);
        message.success(t('settings.customAcpAgentSaved', { defaultValue: 'Custom agent saved' }));
        await refreshAgentDetection();
      } catch {
        message.error(t('settings.customAcpAgentSaveFailed', { defaultValue: 'Failed to save custom agent' }));
      }
    },
    [editingAgent, message, t, refreshAgentDetection]
  );

  const handleDeleteAgent = useCallback(
    async (agent: AcpBackendConfig) => {
      Modal.confirm({
        title: t('settings.deleteCustomAgent', { defaultValue: 'Delete Custom Agent' }),
        content: agent.name,
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          try {
            const allAgents: AcpBackendConfig[] = (await ConfigStorage.get('acp.customAgents')) || [];
            const updatedAgents = allAgents.filter((a) => a.id !== agent.id);
            await ConfigStorage.set('acp.customAgents', updatedAgents);
            setCustomAgents(updatedAgents.filter((a) => !a.isPreset));
            message.success(t('common.success', { defaultValue: 'Deleted' }));
            await refreshAgentDetection();
          } catch {
            message.error(t('common.failed', { defaultValue: 'Failed' }));
          }
        },
      });
    },
    [message, t, refreshAgentDetection]
  );

  const handleToggleAgent = useCallback(
    async (agent: AcpBackendConfig, enabled: boolean) => {
      try {
        const allAgents: AcpBackendConfig[] = (await ConfigStorage.get('acp.customAgents')) || [];
        const updatedAgents = allAgents.map((a) => (a.id === agent.id ? { ...a, enabled } : a));
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setCustomAgents(updatedAgents.filter((a) => !a.isPreset));
        await refreshAgentDetection();
      } catch {
        message.error(t('common.failed', { defaultValue: 'Failed' }));
      }
    },
    [message, t, refreshAgentDetection]
  );

  // Gemini CLI first among detected agents
  const geminiAgent = detectedAgents?.find((a) => a.backend === 'gemini');
  const otherDetected = detectedAgents?.filter((a) => a.backend !== 'gemini') ?? [];

  return (
    <div className='flex flex-col gap-8px py-16px'>
      {messageContext}

      {/* Top action bar */}
      <div className='flex items-center justify-between px-16px'>
        <span className='text-12px text-t-secondary'>
          {t('settings.agentManagement.localAgentsDescription')}
          {'  '}
          <Link href='https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup' target='_blank' className='text-12px'>
            {t('settings.agentManagement.localAgentsSetupLink')}
          </Link>
        </span>
      </div>

      {/* Detected Agents section */}
      <div className='px-16px mt-8px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.detected')}
        </Typography.Text>
      </div>
      <div className='flex flex-col gap-4px px-0'>
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
      <div className='px-16px mt-16px'>
        <div className='flex items-center justify-between'>
          <Typography.Text className='text-12px font-medium text-t-secondary'>
            {t('settings.agentManagement.customAgents', { defaultValue: 'Custom Agents' })}
          </Typography.Text>
          {!showEditor && (
            <Button
              type='text'
              size='small'
              icon={<Plus theme='outline' size={14} />}
              onClick={() => {
                setEditingAgent(null);
                setShowEditor(true);
              }}
            >
              {t('settings.addCustomAgentTitle', { defaultValue: 'Add' })}
            </Button>
          )}
        </div>
      </div>

      <div className='flex flex-col gap-4px px-0'>
        {customAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            type='custom'
            agent={agent}
            onEdit={() => {
              setEditingAgent(agent);
              setShowEditor(true);
            }}
            onDelete={() => void handleDeleteAgent(agent)}
            onToggle={(enabled) => void handleToggleAgent(agent, enabled)}
          />
        ))}
      </div>

      {showEditor && (
        <InlineAgentEditor
          agent={editingAgent}
          onSave={handleSaveAgent}
          onCancel={() => {
            setShowEditor(false);
            setEditingAgent(null);
          }}
        />
      )}
    </div>
  );
};

export default LocalAgents;
