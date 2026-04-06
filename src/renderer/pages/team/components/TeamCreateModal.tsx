import React, { useState } from 'react';
import { Modal, Button, Input, Select, Message } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { TTeam, TeamAgent } from '@/common/types/teamTypes';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import { isElectronDesktop } from '@renderer/utils/platform';
import {
  agentKey,
  agentFromKey,
  resolveConversationType,
  resolveTeamAgentType,
  filterTeamSupportedAgents,
  AgentOptionLabel,
} from './agentSelectUtils';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (team: TTeam) => void;
};

const TeamCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { cliAgents, presetAssistants } = useConversationAgents();
  const [name, setName] = useState('');
  const [dispatchAgentKey, setDispatchAgentKey] = useState<string | undefined>(undefined);
  const [workspace, setWorkspace] = useState('');
  const [loading, setLoading] = useState(false);

  const allAgents = filterTeamSupportedAgents([...cliAgents, ...presetAssistants]);
  const isDesktop = isElectronDesktop();

  const handleClose = () => {
    setName('');
    setDispatchAgentKey(undefined);
    setWorkspace('');
    onClose();
  };

  const handleBrowseWorkspace = async () => {
    const files = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory'] });
    if (files?.[0]) {
      setWorkspace(files[0]);
    }
  };

  const handleCreate = async () => {
    const userId = user?.id ?? 'system_default_user';
    setLoading(true);
    try {
      const agents: TeamAgent[] = [];

      const dispatchAgent = dispatchAgentKey ? agentFromKey(dispatchAgentKey, allAgents) : undefined;
      const dispatchAgentType = resolveTeamAgentType(dispatchAgent, 'acp');
      agents.push({
        slotId: '',
        conversationId: '',
        role: 'lead',
        status: 'pending',
        agentType: dispatchAgentType,
        agentName: dispatchAgent?.name ?? name,
        conversationType: resolveConversationType(dispatchAgentType),
        cliPath: dispatchAgent?.cliPath,
        customAgentId: dispatchAgent?.customAgentId,
      });

      const team = await ipcBridge.team.create.invoke({
        userId,
        name,
        workspace,
        workspaceMode: 'shared',
        agents,
      });

      // The platform bridge swallows provider errors and returns a sentinel object
      const result = team as unknown as { __bridgeError?: boolean; message?: string };
      if (result.__bridgeError) {
        Message.error(result.message ?? t('team.create.error', { defaultValue: 'Failed to create team' }));
        return;
      }

      onCreated(team);
      handleClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      Message.error(msg || t('team.create.error', { defaultValue: 'Failed to create team' }));
    } finally {
      setLoading(false);
    }
  };

  const canCreate = name.trim().length > 0 && dispatchAgentKey !== undefined;

  return (
    <Modal
      title={t('team.create.title', { defaultValue: 'Create Team' })}
      visible={visible}
      onCancel={handleClose}
      footer={null}
      style={{ width: 520 }}
      autoFocus={false}
      focusLock
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
    >
      <div className='flex flex-col gap-20px'>
        {/* Team name */}
        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.create.namePlaceholder', { defaultValue: 'Team name' })}
          </label>
          <Input
            placeholder={t('team.create.namePlaceholder', { defaultValue: 'Team name' })}
            value={name}
            onChange={setName}
          />
        </div>

        {/* Dispatch Agent - single select */}
        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.create.step.dispatch', { defaultValue: 'Dispatch Agent' })}
          </label>
          <Select
            placeholder={
              allAgents.length === 0
                ? t('team.create.noSupportedAgents', { defaultValue: 'No supported agents installed' })
                : t('team.create.dispatchAgentPlaceholder', { defaultValue: 'Select dispatch agent' })
            }
            value={dispatchAgentKey}
            onChange={setDispatchAgentKey}
            showSearch
            allowClear
            disabled={allAgents.length === 0}
            renderFormat={(option) => {
              const agent = option?.value ? agentFromKey(option.value as string, allAgents) : undefined;
              return agent ? <AgentOptionLabel agent={agent} /> : <span>{option?.children}</span>;
            }}
          >
            {allAgents.length > 0 && (
              <Select.OptGroup label={t('conversation.dropdown.cliAgents', { defaultValue: 'CLI Agents' })}>
                {allAgents.map((agent) => (
                  <Select.Option key={agentKey(agent)} value={agentKey(agent)}>
                    <AgentOptionLabel agent={agent} />
                  </Select.Option>
                ))}
              </Select.OptGroup>
            )}
          </Select>
          <span className='text-12px text-[var(--color-text-4)]'>
            {t('team.create.supportedAgentsHint', {
              defaultValue: 'Currently supports Claude, Codex, CodeBuddy. More agents coming soon.',
            })}
          </span>
        </div>

        {/* Workspace - optional folder picker (desktop only) or text input (webui) */}
        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.create.step.workspace', { defaultValue: 'Workspace' })}
            <span className='ml-4px text-[var(--color-text-4)] font-normal text-xs'>
              {t('common.optional', { defaultValue: '(optional)' })}
            </span>
          </label>
          {isDesktop ? (
            <div className='flex items-center gap-8px'>
              <div className='flex-1 px-12px py-6px rounded-6px bg-[var(--fill-2)] text-sm text-[var(--color-text-3)] truncate min-h-32px flex items-center'>
                {workspace || t('team.create.workspacePlaceholder', { defaultValue: 'Workspace path (optional)' })}
              </div>
              <Button icon={<FolderOpen size='16' />} onClick={handleBrowseWorkspace}>
                {t('common.browse', { defaultValue: 'Browse' })}
              </Button>
              {workspace && (
                <Button type='text' onClick={() => setWorkspace('')}>
                  {t('common.clear', { defaultValue: 'Clear' })}
                </Button>
              )}
            </div>
          ) : (
            <Input
              placeholder={t('team.create.workspacePlaceholder', { defaultValue: 'Workspace path (optional)' })}
              value={workspace}
              onChange={setWorkspace}
            />
          )}
        </div>

        {/* Footer */}
        <div className='flex justify-end pt-4px'>
          <Button type='primary' loading={loading} disabled={!canCreate} onClick={handleCreate}>
            {t('team.create.confirm', { defaultValue: 'Create Team' })}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default TeamCreateModal;
