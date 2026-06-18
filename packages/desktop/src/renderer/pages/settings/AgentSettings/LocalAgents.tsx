/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { useManagedAgents } from '@/renderer/hooks/agent/useManagedAgents';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Button, Message, Typography } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AgentCard from './AgentCard';
import InlineAgentEditor, { type CustomAgentDraft } from './InlineAgentEditor';

const LOCAL_AGENT_SETUP_GUIDE_URL = 'https://github.com/iOfficeAI/AionUi/wiki/Getting-Started';

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null);

  // Management view: includes user-disabled custom agents so they stay
  // listed (greyed) with a working re-enable toggle. `refreshCatalog`
  // also refreshes assistant list caches because bare-assistant availability
  // can change after health checks or custom-agent mutations.
  const { agents: allAgents, isRefreshing, refreshCatalog } = useManagedAgents();

  const officialAgents = allAgents.filter((a) => a.agent_source !== 'custom');

  const customAgents: ManagedAgent[] = allAgents.filter((a) => a.agent_source === 'custom');

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ManagedAgent | null>(null);

  const handleSaveCustomAgent = useCallback(
    async (draft: CustomAgentDraft) => {
      const body = {
        name: draft.name,
        command: draft.command,
        icon: draft.icon,
        args: draft.args,
        env: draft.env,
        advanced: draft.advanced,
      };
      try {
        if (editingAgent) {
          await ipcBridge.acpConversation.updateCustomAgent.invoke({ id: editingAgent.id, ...body });
        } else {
          await ipcBridge.acpConversation.createCustomAgent.invoke(body);
        }
        await refreshCatalog();
        setEditorVisible(false);
        setEditingAgent(null);
      } catch (err) {
        // Surface backend rejection (e.g. cli_not_found / acp_init_failed) without crashing.
        console.error('save custom agent failed:', err);
      }
    },
    [editingAgent, refreshCatalog]
  );

  const handleDeleteCustomAgent = useCallback(
    async (agentId: string) => {
      try {
        await ipcBridge.acpConversation.deleteCustomAgent.invoke({ id: agentId });
        await refreshCatalog();
      } catch (err) {
        console.error('delete custom agent failed:', err);
      }
    },
    [refreshCatalog]
  );

  const handleToggleCustomAgent = useCallback(
    async (agentId: string, enabled: boolean) => {
      try {
        await ipcBridge.acpConversation.setAgentEnabled.invoke({ id: agentId, enabled });
        await refreshCatalog();
      } catch (err) {
        console.error('toggle custom agent failed:', err);
      }
    },
    [refreshCatalog]
  );

  const sortedOfficialAgents = [...officialAgents].sort((left, right) => {
    const leftIsAionrs = left.agent_type === 'aionrs' || left.backend === 'aionrs';
    const rightIsAionrs = right.agent_type === 'aionrs' || right.backend === 'aionrs';
    if (leftIsAionrs !== rightIsAionrs) {
      return leftIsAionrs ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  const openCustomAgentEditor = useCallback(() => {
    setEditingAgent(null);
    setEditorVisible(true);
  }, []);

  const handleTestConnection = useCallback(
    async (agentId: string) => {
      try {
        setTestingAgentId(agentId);
        const result = await ipcBridge.acpConversation.checkManagedAgentHealthById.invoke({ id: agentId });
        await refreshCatalog();
        switch (result.status) {
          case 'available':
            Message.success(t('settings.agentManagement.testConnectionAvailable', { name: result.name }));
            break;
          case 'missing':
            Message.warning(t('settings.agentManagement.testConnectionMissing', { name: result.name }));
            break;
          case 'unavailable':
            Message.warning(
              result.last_check_error_message ||
                t('settings.agentManagement.testConnectionUnavailable', { name: result.name })
            );
            break;
          default:
            break;
        }
      } catch (error) {
        console.error('test managed agent failed:', error);
        Message.error(t('settings.agentManagement.testConnectionError'));
      } finally {
        setTestingAgentId(null);
      }
    },
    [refreshCatalog, t]
  );

  return (
    <div className='flex flex-col gap-8px py-16px'>
      <div className='px-16px text-12px text-t-secondary'>
        <span>{t('settings.agentManagement.localAgentsDescription')} </span>
        <Button
          type='text'
          size='mini'
          className='!mr-8px !h-auto !p-0 !align-baseline !text-12px !font-normal !text-primary-6 hover:!text-primary-7 hover:!underline underline-offset-2'
          onClick={() => {
            void openExternalUrl(LOCAL_AGENT_SETUP_GUIDE_URL).catch(console.error);
          }}
        >
          {t('settings.agentManagement.localAgentsSetupLink')}
        </Button>
        <Button
          type='text'
          size='mini'
          className='!h-auto !p-0 !align-baseline !text-12px !font-normal !text-primary-6 hover:!text-primary-7 hover:!underline underline-offset-2'
          onClick={openCustomAgentEditor}
        >
          {t('settings.agentManagement.detectCustomAgent')}
        </Button>
      </div>
      {isRefreshing ? (
        <div className='px-16px text-11px text-t-tertiary'>{t('settings.agentManagement.refreshingStatuses')}</div>
      ) : null}

      {/* Detected Agents section */}
      <div className='px-16px mt-8px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.officialAgents')}
        </Typography.Text>
      </div>
      <div className='grid grid-cols-2 gap-10px px-16px md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
        {sortedOfficialAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            type='official'
            agent={agent}
            onTestConnection={() => void handleTestConnection(agent.id)}
            isTesting={testingAgentId === agent.id}
          />
        ))}
      </div>
      {(!officialAgents || officialAgents.length === 0) && (
        <Typography.Text type='secondary' className='block px-16px py-16px text-center text-12px'>
          {t('settings.agentManagement.localAgentsEmpty')}
        </Typography.Text>
      )}

      {/* Custom Agents section */}
      <div className='px-16px mt-16px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.customAgents', { defaultValue: 'Custom Agents' })}
        </Typography.Text>
      </div>

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
            onTestConnection={() => void handleTestConnection(agent.id)}
            onEdit={() => {
              setEditingAgent(agent);
              setEditorVisible(true);
            }}
            onDelete={() => void handleDeleteCustomAgent(agent.id)}
            onToggle={(enabled) => void handleToggleCustomAgent(agent.id, enabled)}
            isTesting={testingAgentId === agent.id}
          />
        ))}
        {customAgents.length === 0 ? (
          <Typography.Text type='secondary' className='block px-16px py-12px text-center text-12px'>
            {t('settings.agentManagement.customEmpty', {
              defaultValue: 'No custom agents yet. Click "Detect Custom Agent" to create one.',
            })}
          </Typography.Text>
        ) : null}
      </div>
    </div>
  );
};

export default LocalAgents;
