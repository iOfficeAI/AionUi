import React, { useState } from 'react';
import { Modal, Button, Input, Select, Message } from '@arco-design/web-react';
import { FolderOpen, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { TTeam, TeamAgent } from '@/common/types/teamTypes';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { isElectronDesktop } from '@renderer/utils/platform';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@renderer/pages/guid/constants';
import type { AvailableAgent } from '@renderer/utils/model/agentTypes';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (team: TTeam) => void;
};

// Unique key for each agent option
function agentKey(agent: AvailableAgent): string {
  return agent.customAgentId ? `preset::${agent.customAgentId}` : `cli::${agent.backend}`;
}

function agentFromKey(key: string, allAgents: AvailableAgent[]): AvailableAgent | undefined {
  return allAgents.find((a) => agentKey(a) === key);
}

const AgentOptionLabel: React.FC<{ agent: AvailableAgent }> = ({ agent }) => {
  const logo = getAgentLogo(agent.backend);
  const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
  const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');
  return (
    <div className='flex items-center gap-8px'>
      {avatarImage ? (
        <img src={avatarImage} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : isEmoji ? (
        <span style={{ fontSize: 14, lineHeight: '16px' }}>{agent.avatar}</span>
      ) : logo ? (
        <img src={logo} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : (
        <Robot size='16' />
      )}
      <span>{agent.name}</span>
    </div>
  );
};

const TeamCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { cliAgents, presetAssistants } = useConversationAgents();
  const [name, setName] = useState('');
  const [dispatchAgentKey, setDispatchAgentKey] = useState<string | undefined>(undefined);
  const [subAgentKeys, setSubAgentKeys] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState('');
  const [loading, setLoading] = useState(false);

  const allAgents = [...cliAgents, ...presetAssistants];
  const isDesktop = isElectronDesktop();

  const handleClose = () => {
    setName('');
    setDispatchAgentKey(undefined);
    setSubAgentKeys([]);
    setWorkspace('');
    onClose();
  };

  const handleBrowseWorkspace = async () => {
    const files = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory'] });
    if (files?.[0]) {
      setWorkspace(files[0]);
    }
  };

  const resolveConversationType = (
    backend: string
  ): 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' => {
    if (backend === 'gemini') return 'gemini';
    if (backend === 'codex') return 'codex';
    if (backend === 'openclaw-gateway') return 'openclaw-gateway';
    if (backend === 'nanobot') return 'nanobot';
    if (backend === 'remote') return 'remote';
    return 'acp';
  };

  const handleCreate = async () => {
    const userId = user?.id ?? 'system_default_user';
    setLoading(true);
    try {
      const agents: TeamAgent[] = [];

      const dispatchAgent = dispatchAgentKey ? agentFromKey(dispatchAgentKey, allAgents) : undefined;
      agents.push({
        slotId: `slot-${crypto.randomUUID().slice(0, 8)}`,
        conversationId: '',
        role: 'lead',
        status: 'pending',
        agentType: dispatchAgent?.backend ?? 'acp',
        agentName: dispatchAgent?.name ?? name,
        conversationType: resolveConversationType(dispatchAgent?.backend ?? 'acp'),
        cliPath: dispatchAgent?.cliPath,
      });

      for (const key of subAgentKeys) {
        const subAgent = agentFromKey(key, allAgents);
        if (subAgent) {
          agents.push({
            slotId: `slot-${crypto.randomUUID().slice(0, 8)}`,
            conversationId: '',
            role: 'teammate',
            status: 'pending',
            agentType: subAgent.backend,
            agentName: subAgent.name,
            conversationType: resolveConversationType(subAgent.backend),
            cliPath: subAgent.cliPath,
          });
        }
      }

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
            placeholder={t('team.create.dispatchAgentPlaceholder', { defaultValue: 'Select dispatch agent' })}
            value={dispatchAgentKey}
            onChange={setDispatchAgentKey}
            showSearch
            allowClear
            renderFormat={(option) => {
              const agent = option?.value ? agentFromKey(option.value as string, allAgents) : undefined;
              return agent ? <AgentOptionLabel agent={agent} /> : <span>{option?.children}</span>;
            }}
          >
            {cliAgents.length > 0 && (
              <Select.OptGroup label={t('conversation.dropdown.cliAgents', { defaultValue: 'CLI Agents' })}>
                {cliAgents.map((agent) => (
                  <Select.Option key={agentKey(agent)} value={agentKey(agent)}>
                    <AgentOptionLabel agent={agent} />
                  </Select.Option>
                ))}
              </Select.OptGroup>
            )}
            {presetAssistants.length > 0 && (
              <Select.OptGroup
                label={t('conversation.dropdown.presetAssistants', { defaultValue: 'Preset Assistants' })}
              >
                {presetAssistants.map((agent) => (
                  <Select.Option key={agentKey(agent)} value={agentKey(agent)}>
                    <AgentOptionLabel agent={agent} />
                  </Select.Option>
                ))}
              </Select.OptGroup>
            )}
          </Select>
        </div>

        {/* Sub Agents - multi select */}
        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.create.step.subAgents', { defaultValue: 'Sub Agents' })}
            <span className='ml-4px text-[var(--color-text-4)] font-normal text-xs'>
              {t('common.optional', { defaultValue: '(optional)' })}
            </span>
          </label>
          <Select
            mode='multiple'
            placeholder={t('team.create.subAgentsPlaceholder', { defaultValue: 'Select sub agents' })}
            value={subAgentKeys}
            onChange={setSubAgentKeys}
            showSearch
            allowClear
            renderTag={({ value, closable, onClose }) => {
              const agent = agentFromKey(value as string, allAgents);
              return (
                <span
                  key={value as string}
                  className='flex items-center gap-4px px-6px py-2px rounded-4px bg-[var(--fill-2)] text-sm mr-4px mb-2px'
                >
                  {agent?.name ?? (value as string)}
                  {closable && (
                    <span className='cursor-pointer opacity-60 hover:opacity-100 ml-2px' onClick={onClose}>
                      ×
                    </span>
                  )}
                </span>
              );
            }}
          >
            {cliAgents.length > 0 && (
              <Select.OptGroup label={t('conversation.dropdown.cliAgents', { defaultValue: 'CLI Agents' })}>
                {cliAgents.map((agent) => (
                  <Select.Option key={agentKey(agent)} value={agentKey(agent)}>
                    <AgentOptionLabel agent={agent} />
                  </Select.Option>
                ))}
              </Select.OptGroup>
            )}
            {presetAssistants.length > 0 && (
              <Select.OptGroup
                label={t('conversation.dropdown.presetAssistants', { defaultValue: 'Preset Assistants' })}
              >
                {presetAssistants.map((agent) => (
                  <Select.Option key={agentKey(agent)} value={agentKey(agent)}>
                    <AgentOptionLabel agent={agent} />
                  </Select.Option>
                ))}
              </Select.OptGroup>
            )}
          </Select>
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
