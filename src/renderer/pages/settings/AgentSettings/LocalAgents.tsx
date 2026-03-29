/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ipcBridge } from '@/common';
import { Button, Link, Modal, Typography, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus } from '@icon-park/react';
import useSWR, { mutate } from 'swr';
import { ConfigStorage } from '@/common/config/storage';
import { acpConversation } from '@/common/adapter/ipcBridge';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import AgentCard from './AgentCard';
import InlineAgentEditor from './InlineAgentEditor';

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [message, messageContext] = Message.useMessage({ maxCount: 10 });

  // Detected agents (filter out custom and remote)
  const { data: detectedAgents } = useSWR('acp.agents.available.settings', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      return result.data.filter((agent) => agent.backend !== 'custom' && agent.backend !== 'remote');
    }
    return [];
  });

  // Custom agents
  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);
  const [editingAgentId, setEditingAgentId] = useState<string | 'new' | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AcpBackendConfig | null>(null);

  const refreshAgentDetection = useCallback(async () => {
    try {
      await acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
      await mutate('acp.agents.available.settings');
    } catch {
      // Refresh failed — UI will update on next page load
    }
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const agents = await ConfigStorage.get('acp.customAgents');
        if (agents && Array.isArray(agents) && agents.length > 0) {
          setCustomAgents(agents.filter((a) => !a.isPreset));
          return;
        }
        // Migrate legacy single-agent format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const legacyAgent = await (ConfigStorage as any).get('acp.customAgent');
        if (legacyAgent && typeof legacyAgent === 'object' && legacyAgent.defaultCliPath) {
          const migratedAgent: AcpBackendConfig = {
            ...legacyAgent,
            id: legacyAgent.id && legacyAgent.id !== 'custom' ? legacyAgent.id : `migrated-${Date.now()}`,
          };
          const migratedAgents = [migratedAgent];
          await ConfigStorage.set('acp.customAgents', migratedAgents);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ConfigStorage as any).remove('acp.customAgent');
          setCustomAgents(migratedAgents);
          await refreshAgentDetection();
        }
      } catch (error) {
        console.error('Failed to load custom agents config:', error);
      }
    };
    void loadConfig();
  }, [refreshAgentDetection]);

  const handleSaveAgent = useCallback(
    async (agentData: AcpBackendConfig) => {
      try {
        let updatedAgents: AcpBackendConfig[];
        if (editingAgentId && editingAgentId !== 'new') {
          updatedAgents = customAgents.map((agent) => (agent.id === editingAgentId ? agentData : agent));
        } else {
          updatedAgents = [...customAgents, agentData];
        }
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setCustomAgents(updatedAgents);
        setEditingAgentId(null);
        message.success(t('settings.customAcpAgentSaved') || 'Custom agent saved');
        await refreshAgentDetection();
      } catch (error) {
        console.error('Failed to save custom agent config:', error);
        message.error(t('settings.customAcpAgentSaveFailed') || 'Failed to save custom agent');
      }
    },
    [customAgents, editingAgentId, message, t, refreshAgentDetection]
  );

  const handleDeleteAgent = useCallback(async () => {
    if (!agentToDelete) return;
    try {
      const updatedAgents = customAgents.filter((agent) => agent.id !== agentToDelete.id);
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setCustomAgents(updatedAgents);
      setDeleteConfirmVisible(false);
      setAgentToDelete(null);
      if (editingAgentId === agentToDelete.id) setEditingAgentId(null);
      message.success(t('settings.customAcpAgentDeleted') || 'Custom agent deleted');
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to delete custom agent config:', error);
      message.error(t('settings.customAcpAgentDeleteFailed') || 'Failed to delete custom agent');
    }
  }, [agentToDelete, customAgents, editingAgentId, message, t, refreshAgentDetection]);

  const handleToggleAgent = useCallback(
    async (agent: AcpBackendConfig, enabled: boolean) => {
      try {
        const updatedAgents = customAgents.map((a) => (a.id === agent.id ? { ...a, enabled } : a));
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setCustomAgents(updatedAgents);
        await refreshAgentDetection();
      } catch (error) {
        console.error('Failed to toggle custom agent:', error);
      }
    },
    [customAgents, refreshAgentDetection]
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
        <Button
          type='outline'
          size='small'
          icon={<Plus theme='outline' size='14' />}
          onClick={() => setEditingAgentId('new')}
        >
          {t('settings.agentManagement.addCustomAgent')}
        </Button>
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
      <div className='px-16px mt-12px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.custom')}
        </Typography.Text>
      </div>

      {/* New agent editor */}
      {editingAgentId === 'new' && (
        <InlineAgentEditor onSave={handleSaveAgent} onCancel={() => setEditingAgentId(null)} />
      )}

      <div className='flex flex-col gap-4px'>
        {customAgents.map((agent) => (
          <React.Fragment key={agent.id}>
            <AgentCard
              type='custom'
              agent={agent}
              onEdit={() => setEditingAgentId(editingAgentId === agent.id ? null : agent.id)}
              onDelete={() => {
                setAgentToDelete(agent);
                setDeleteConfirmVisible(true);
              }}
              onToggle={(enabled) => handleToggleAgent(agent, enabled)}
            />
            {editingAgentId === agent.id && (
              <InlineAgentEditor agent={agent} onSave={handleSaveAgent} onCancel={() => setEditingAgentId(null)} />
            )}
          </React.Fragment>
        ))}
        {customAgents.length === 0 && editingAgentId !== 'new' && (
          <Typography.Text type='secondary' className='block py-16px text-center text-12px'>
            {t('settings.agentManagement.customEmpty')}
          </Typography.Text>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        title={t('settings.deleteCustomAgent') || 'Delete Custom Agent'}
        visible={deleteConfirmVisible}
        onCancel={() => setDeleteConfirmVisible(false)}
        onOk={handleDeleteAgent}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.confirm') || 'Confirm'}
        cancelText={t('common.cancel') || 'Cancel'}
      >
        <p>
          {t('settings.deleteCustomAgentConfirm') || 'Are you sure you want to delete this custom agent?'}
          {agentToDelete && <strong className='block mt-2'>{agentToDelete.name}</strong>}
        </p>
      </Modal>
    </div>
  );
};

export default LocalAgents;
