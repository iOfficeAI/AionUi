/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Message, Typography } from '@arco-design/web-react';
import { ArrowLeft, Connection } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { useManagedAgents } from '@/renderer/hooks/agent/useManagedAgents';
import { formatManagedAgentDiagnosticMessage } from '@/renderer/utils/model/agentTypes';
import AgentRepairPanel from './AgentRepairPanel';
import { BoundAssistantList, getBoundAssistants, useAssistantsForAgents } from './BoundAssistants';

const OPEN_ASSISTANT_EDITOR_INTENT_KEY = 'guid.openAssistantEditorIntent';

const AgentRepairPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { agents, isRefreshing, refreshCatalog } = useManagedAgents();
  const { assistants } = useAssistantsForAgents();
  const [isTesting, setIsTesting] = useState(false);

  const agent = agents.find((a) => a.id === id);

  useEffect(() => {
    if (!isRefreshing && !agent) {
      navigate('/settings/agent', { replace: true });
    }
  }, [isRefreshing, agent, navigate]);

  const handleTestConnection = useCallback(async () => {
    if (!agent) return;
    try {
      setIsTesting(true);
      const result = await ipcBridge.acpConversation.checkManagedAgentHealthById.invoke({ id: agent.id });
      await refreshCatalog();
      switch (result.status) {
        case 'online':
          Message.success(t('settings.agentManagement.testConnectionOnline', { name: result.name }));
          break;
        case 'missing':
          Message.warning(t('settings.agentManagement.testConnectionMissing', { name: result.name }));
          break;
        case 'offline':
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
      setIsTesting(false);
    }
  }, [agent, refreshCatalog, t]);

  // Open the target assistant's detail/editor by handing the intent to the
  // assistant settings page (which mounts its split-view editor on this key),
  // mirroring how other surfaces jump into a specific assistant.
  const handleOpenAssistant = useCallback(
    (assistantId: string) => {
      try {
        sessionStorage.setItem(
          OPEN_ASSISTANT_EDITOR_INTENT_KEY,
          JSON.stringify({ assistantId, openAssistantEditor: true })
        );
      } catch (error) {
        console.error('[AgentRepair] Failed to persist assistant open intent:', error);
      }
      navigate('/settings/assistants', { state: { openAssistantEditor: true, openAssistantId: assistantId } });
    },
    [navigate]
  );

  if (isRefreshing || !agent) {
    return null;
  }

  const handleBack = () => {
    navigate('/settings/agent');
  };

  const handleSaved = () => {
    void refreshCatalog();
  };

  const boundAssistants = getBoundAssistants(agent, assistants);

  return (
    <div data-testid='agent-repair-page' className='flex h-full min-h-0 flex-col overflow-hidden bg-transparent'>
      <div
        data-testid='agent-repair-bar'
        className='sticky top-0 z-10 flex h-48px flex-shrink-0 items-center gap-12px border-b border-border-2 bg-bg-0 px-18px'
      >
        <div className='flex min-w-0 flex-1 items-center gap-10px'>
          <Button
            type='text'
            icon={<ArrowLeft size={16} />}
            onClick={handleBack}
            data-testid='btn-back-agent-repair'
            className='!rounded-8px !px-6px !text-t-primary'
          >
            {t('common.goBack', { defaultValue: 'Back' })}
          </Button>
          <div className='truncate text-14px font-600 text-t-primary'>{agent.name}</div>
        </div>
        <Button
          type='outline'
          size='small'
          loading={isTesting}
          icon={<Connection theme='outline' size='14' />}
          onClick={() => void handleTestConnection()}
          data-testid='btn-test-connection-agent-repair'
          className='!h-30px !rounded-8px !border-border-2 !bg-base !px-10px !text-12px !font-500 !text-t-primary hover:!border-border-1 hover:!bg-fill-1'
        >
          {t('settings.agentManagement.testConnection')}
        </Button>
      </div>

      <div data-testid='agent-repair-body' className='relative min-h-0 flex-1 overflow-auto px-18px py-18px pb-24px'>
        <div className='mx-auto w-full max-w-760px'>
          <AgentRepairPanel agent={agent} onSaved={handleSaved} />

          {/* Which assistants depend on this agent — clicking one jumps to its
              detail/editor so the user can see and adjust the binding. */}
          <div className='mt-18px'>
            <Typography.Text className='mb-8px block text-13px font-medium text-t-primary'>
              {t('settings.agentManagement.boundAssistantsTitle')}
              {boundAssistants.length > 0 ? (
                <span className='ml-4px text-t-tertiary'>{`（${boundAssistants.length}）`}</span>
              ) : null}
            </Typography.Text>
            <BoundAssistantList assistants={boundAssistants} onOpenAssistant={handleOpenAssistant} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentRepairPage;
