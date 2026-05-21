/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ManagedCliInstallTarget } from '@/common/types/agent/managedCliInstaller';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { useAgents } from '@/renderer/hooks/agent/useAgents';
import { Button, Message, Typography } from '@arco-design/web-react';
import { Home, Plus } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isPackagedElectronDesktop } from '@/renderer/utils/platform';
import AgentCard from './AgentCard';
import { AgentHubModal } from './AgentHubModal';
import InlineAgentEditor, { type CustomAgentDraft } from './InlineAgentEditor';

type ManagedCliCardConfig = {
  target: ManagedCliInstallTarget;
  label: string;
  backendAliases: string[];
};

type InstallState = 'idle' | 'installing' | 'uninstalling';

const MANAGED_CLI_CARDS: ManagedCliCardConfig[] = [
  { target: 'claude', label: 'Claude Code', backendAliases: ['claude', 'anthropic'] },
  { target: 'hermes', label: 'Hermes', backendAliases: ['hermes'] },
  { target: 'opencode', label: 'OpenCode', backendAliases: ['opencode'] },
  { target: 'openclaw', label: 'OpenClaw', backendAliases: ['openclaw', 'openclaw-gateway'] },
];

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const [hubModalVisible, setHubModalVisible] = useState(false);
  const [installingState, setInstallingState] = useState<Partial<Record<ManagedCliInstallTarget, InstallState>>>({});
  const isPackaged = isPackagedElectronDesktop();

  // Single fetch for all agents; both detected and custom lists are derived from it.
  const { agents: allAgents, revalidate: mutateAgents } = useAgents();

  const detectedAgents = allAgents.filter((a) => a.agent_type !== 'remote' && a.agent_source !== 'custom');

  const customAgents: AgentMetadata[] = allAgents.filter((a) => a.agent_source === 'custom');

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentMetadata | null>(null);

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

  // POUNDING CLI first among detected agents
  const aionrsAgent = detectedAgents?.find((a) => a.agent_type === 'aionrs' || a.backend === 'aionrs');
  const brandedAionrsAgent = aionrsAgent ? { ...aionrsAgent, name: 'POUNDING CLI' } : null;

  const managedCliCards = useMemo(() => {
    return MANAGED_CLI_CARDS.map((card) => {
      const matchedAgent = detectedAgents.find((agent) =>
        card.backendAliases.includes((agent.backend || agent.agent_type || '').toLowerCase())
      );

      const fallbackAgent: AgentMetadata = {
        id: `managed-cli-${card.target}`,
        name: card.label,
        backend: card.backendAliases[0],
        agent_type: 'acp',
        agent_source: 'builtin',
        available: false,
        enabled: true,
      };

      return {
        ...card,
        agent: matchedAgent ?? fallbackAgent,
      };
    });
  }, [detectedAgents]);

  const setTargetState = useCallback((target: ManagedCliInstallTarget, state: InstallState) => {
    setInstallingState((prev) => ({ ...prev, [target]: state }));
  }, []);

  const clearTargetState = useCallback((target: ManagedCliInstallTarget) => {
    setInstallingState((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
  }, []);

  const revalidateAfterCliMutation = useCallback(async () => {
    await mutateAgents();
  }, [mutateAgents]);

  const handleInstallManagedCli = useCallback(
    async (target: ManagedCliInstallTarget) => {
      setTargetState(target, 'installing');
      try {
        const result = await ipcBridge.managedCliInstaller.install.invoke({ target });
        if (!result.success) {
          throw new Error(result.message || 'Install failed');
        }
        await revalidateAfterCliMutation();
        Message.success(
          t('settings.agentManagement.installSuccess', {
            defaultValue: 'Installed successfully',
          })
        );
      } catch (error) {
        console.error(`Failed to install ${target}:`, error);
        Message.error(error instanceof Error ? error.message : t('common.failed', { defaultValue: 'Failed' }));
      } finally {
        clearTargetState(target);
      }
    },
    [clearTargetState, revalidateAfterCliMutation, setTargetState, t]
  );

  const handleUninstallManagedCli = useCallback(
    async (target: ManagedCliInstallTarget) => {
      setTargetState(target, 'uninstalling');
      try {
        const result = await ipcBridge.managedCliInstaller.uninstall.invoke({ target });
        if (!result.success) {
          throw new Error(result.message || 'Uninstall failed');
        }
        await revalidateAfterCliMutation();
        Message.success(
          t('settings.agentManagement.uninstallSuccess', {
            defaultValue: 'Uninstalled successfully',
          })
        );
      } catch (error) {
        console.error(`Failed to uninstall ${target}:`, error);
        Message.error(error instanceof Error ? error.message : t('common.failed', { defaultValue: 'Failed' }));
      } finally {
        clearTargetState(target);
      }
    },
    [clearTargetState, revalidateAfterCliMutation, setTargetState, t]
  );

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

      {process.env.NODE_ENV === 'development' && !isPackaged && (
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
        {brandedAionrsAgent && <AgentCard type='detected' agent={brandedAionrsAgent} variant='grid' />}
        {managedCliCards.map(({ target, agent }) => (
          <AgentCard
            key={target}
            type='detected'
            agent={agent}
            variant='grid'
            managedCliTarget={target}
            canManageInstall={true}
            installState={installingState[target] ?? 'idle'}
            onInstall={() => {
              void handleInstallManagedCli(target);
            }}
            onUninstall={() => {
              void handleUninstallManagedCli(target);
            }}
          />
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
