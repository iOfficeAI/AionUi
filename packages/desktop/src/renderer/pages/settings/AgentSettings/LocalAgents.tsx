/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { parseError } from '@/common/utils';
import { formatManagedAgentDiagnosticMessage, type ManagedAgent } from '@/renderer/utils/model/agentTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { useManagedAgents } from '@/renderer/hooks/agent/useManagedAgents';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Button, Message, Typography } from '@arco-design/web-react';
import TalkToButlerButton from '@/renderer/components/base/TalkToButlerButton';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AgentCard from './AgentCard';
import { isDeprecatedRuntimeAgentType } from '@/renderer/utils/model/agentTypeSupportPolicy';
import InlineAgentEditor, { type CustomAgentDraft } from './InlineAgentEditor';
import { getBoundAssistants, useAssistantsForAgents } from './BoundAssistants';
import SettingsPageHeader from '../components/SettingsPageHeader';
import { useNavigate } from 'react-router-dom';
import {
  filterAgentsByAvailability,
  getAgentAvailabilityFilterStats,
  type AgentAvailabilityFilter,
} from './agentFilters';

const LOCAL_AGENT_SETUP_GUIDE_URL = 'https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup';

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<AgentAvailabilityFilter>('all');
  const { assistants } = useAssistantsForAgents();

  // Management view: includes user-disabled custom agents so they stay
  // listed (greyed) with a working re-enable toggle. `refreshCatalog`
  // also refreshes assistant list caches because generated-assistant availability
  // can change after health checks or custom-agent mutations.
  const { agents: allAgents, isRefreshing, refreshCatalog } = useManagedAgents();

  // Hide deprecated runtime backends (nanobot / openclaw-gateway / remote / gemini)
  // — they are no longer offered as agents and shouldn't appear on the detection page.
  const officialAgents = allAgents.filter(
    (a) => a.agent_source !== 'custom' && !isDeprecatedRuntimeAgentType(a.agent_type)
  );

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
        console.error('save custom agent failed:', err);
        Message.error(parseError(err));
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
        Message.error(parseError(err));
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
        Message.error(parseError(err));
      }
    },
    [refreshCatalog]
  );

  const sortedOfficialAgents = [...officialAgents].toSorted((left, right) => {
    const leftIsAionrs = left.agent_type === 'aionrs' || left.backend === 'aionrs';
    const rightIsAionrs = right.agent_type === 'aionrs' || right.backend === 'aionrs';
    if (leftIsAionrs !== rightIsAionrs) {
      return leftIsAionrs ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  const officialFilterStats = getAgentAvailabilityFilterStats(sortedOfficialAgents);
  const visibleOfficialAgents = filterAgentsByAvailability(sortedOfficialAgents, agentFilter);

  const openCustomAgentEditor = useCallback(() => {
    setEditingAgent(null);
    setEditorVisible(true);
  }, []);

  const openAgentConfig = useCallback(
    (agentId: string) => {
      navigate(`/settings/agent/${agentId}/repair`);
    },
    [navigate]
  );

  // Manual "test connection": runs the live ACP probe (initialize +
  // session/new) and refreshes the catalog so the card reflects the new
  // status immediately (F2-02: three states stay clickable, in-progress
  // feedback, recover-on-success).
  const handleTestConnection = useCallback(
    async (agentId: string) => {
      try {
        setTestingAgentId(agentId);
        const result = await ipcBridge.acpConversation.checkManagedAgentHealthById.invoke({ id: agentId });
        await refreshCatalog();
        switch (result.status) {
          case 'online':
            Message.success(t('settings.agentManagement.testConnectionOnline', { name: result.name }));
            break;
          case 'missing':
            Message.warning(t('settings.agentManagement.testConnectionMissing', { name: result.name }));
            break;
          case 'offline':
            // auth_required is offline-with-a-reason: surface the diagnostic
            // (which carries the "needs sign-in" guidance) when present.
            Message.warning(
              formatManagedAgentDiagnosticMessage(t, result) ||
                (result.last_check_error_code === 'auth_required'
                  ? t('settings.agentManagement.testConnectionAuth', { name: result.name })
                  : t('settings.agentManagement.testConnectionOffline', { name: result.name }))
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
    <div data-testid='agent-management-page' className='flex flex-col gap-16px'>
      <SettingsPageHeader
        data-testid='agent-management-header'
        title={t('settings.agents', { defaultValue: 'Agents' })}
        description={
          <>
            <span>{t('settings.agentManagement.localAgentsDescription')} </span>
            <Button
              type='text'
              size='mini'
              className='!h-auto !p-0 !align-baseline !text-13px !font-normal !text-primary-6 hover:!text-primary-7 hover:!underline underline-offset-2'
              onClick={() => {
                void openExternalUrl(LOCAL_AGENT_SETUP_GUIDE_URL).catch(console.error);
              }}
            >
              {t('settings.agentManagement.localAgentsSetupLink')}
            </Button>
          </>
        }
        actions={
          <TalkToButlerButton
            label={t('settings.agentManagement.addCustomAgent', { defaultValue: 'Add custom Agent' })}
            chatLabel={t('settings.talkToButler.addViaChat', { defaultValue: 'Add via chat' })}
            onManual={openCustomAgentEditor}
            manualLabel={t('settings.talkToButler.addManually', { defaultValue: 'Add manually' })}
            prompt={t('settings.talkToButler.prompt.addCustomAgent', {
              defaultValue: 'Help me add a custom Agent.',
            })}
            data-testid='btn-add-custom-agent'
          />
        }
        tabs={[
          {
            key: 'all',
            label: t('settings.agentManagement.filterAll', { defaultValue: 'All' }),
            count: officialFilterStats.all,
          },
          {
            key: 'available',
            label: t('settings.agentManagement.filterAvailable', { defaultValue: 'Available' }),
            count: officialFilterStats.available,
          },
          {
            key: 'unavailable',
            label: t('settings.agentManagement.filterUnavailable', { defaultValue: 'Unavailable' }),
            count: officialFilterStats.unavailable,
          },
        ]}
        activeTab={agentFilter}
        onTabChange={(key) => setAgentFilter(key as AgentAvailabilityFilter)}
      />

      {isRefreshing ? (
        <div className='text-11px text-t-tertiary'>{t('settings.agentManagement.refreshingStatuses')}</div>
      ) : null}

      {/* Detected Agents section */}
      <div data-testid='agent-management-official-section'>
        <div className='flex flex-col gap-8px rounded-12px border border-border-2 bg-2 p-8px md:rounded-16px md:p-10px'>
          {visibleOfficialAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              type='official'
              agent={agent}
              boundAssistants={getBoundAssistants(agent, assistants)}
              onTestConnection={() => void handleTestConnection(agent.id)}
              onConfigure={() => openAgentConfig(agent.id)}
              isTesting={testingAgentId === agent.id}
            />
          ))}
          {visibleOfficialAgents.length === 0 && (
            <Typography.Text type='secondary' className='block py-16px text-center text-12px'>
              {t('settings.agentManagement.localAgentsEmpty')}
            </Typography.Text>
          )}
        </div>
      </div>

      {/* Custom Agents section */}
      <div data-testid='agent-management-custom-header' className='flex flex-col gap-2px'>
        <Typography.Text className='text-13px font-medium text-t-secondary block'>
          {t('settings.agentManagement.customAgents', { defaultValue: 'Custom Agents' })}
        </Typography.Text>
        <Typography.Text className='block text-12px text-t-tertiary'>
          {t('settings.agentManagement.customEmptyDescription')}
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

      <div data-testid='agent-management-custom-section'>
        <div className='flex flex-col gap-8px rounded-12px border border-border-2 bg-2 p-8px md:rounded-16px md:p-10px'>
          {customAgents?.map((agent) => (
            <AgentCard
              key={agent.id}
              type='custom'
              agent={agent}
              boundAssistants={getBoundAssistants(agent, assistants)}
              onTestConnection={() => void handleTestConnection(agent.id)}
              onConfigure={() => openAgentConfig(agent.id)}
              isTesting={testingAgentId === agent.id}
              onEdit={() => {
                setEditingAgent(agent);
                setEditorVisible(true);
              }}
              onDelete={() => void handleDeleteCustomAgent(agent.id)}
              onToggle={(enabled) => void handleToggleCustomAgent(agent.id, enabled)}
            />
          ))}
          {customAgents.length === 0 ? (
            <Typography.Text type='secondary' className='block py-12px text-center text-12px'>
              {t('settings.agentManagement.customEmpty')}
            </Typography.Text>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default LocalAgents;
